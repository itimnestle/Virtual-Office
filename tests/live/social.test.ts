/**
 * Milestone D live checks (local Supabase): anonymous chat over the API,
 * chat media in Storage (owner check, visibility while live), expiry, the
 * purge job route deleting the actual objects, and content-free realtime.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import path from "node:path";
import type { Database } from "@/lib/database.types";

try {
  process.loadEnvFile(path.resolve(__dirname, "../../.env.local"));
} catch {
  /* env may come from the shell */
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const SECRET = process.env.SUPABASE_SECRET_KEY ?? "";
const ORG = "00000000-0000-4000-8000-000000000001";
const M1 = "20000000-0000-4000-8000-000000000011";

async function stackUp(): Promise<boolean> {
  if (!URL || !KEY || !SECRET || !process.env.CRON_SECRET) return false;
  try {
    return (await fetch(`${URL}/auth/v1/health`, { headers: { apikey: KEY } })).ok;
  } catch {
    return false;
  }
}
const d = (await stackUp()) ? describe : describe.skip;

async function signIn(email: string): Promise<SupabaseClient<Database>> {
  const c = createClient<Database>(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: "VirtualOffice2026" });
  if (error) throw new Error(error.message);
  await c.realtime.setAuth((await c.auth.getSession()).data.session!.access_token);
  return c;
}

// 1×1 transparent PNG.
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="), (c) => c.charCodeAt(0));

d("live: chat", () => {
  it("anonymous image: hidden sender, owner-checked attach, purged from Storage after expiry", async () => {
    const m1 = await signIn("member1@example.com");
    const m2 = await signIn("member2@example.com");
    const service = createClient<Database>(URL, SECRET, { auth: { persistSession: false } });

    const objectPath = `${ORG}/${crypto.randomUUID()}.png`;
    expect((await m1.storage.from("chat-media").upload(objectPath, new Blob([PNG], { type: "image/png" }))).error).toBeNull();
    // Non-image types are rejected by the bucket.
    expect((await m1.storage.from("chat-media").upload(`${ORG}/${crypto.randomUUID()}.txt`, new Blob(["x"], { type: "text/plain" }))).error).toBeTruthy();
    // Someone else cannot attach M1's upload.
    expect((await m2.rpc("send_chat_message", { p_kind: "image", p_media_path: objectPath })).error?.message).toContain("attachment_not_uploaded");

    const sent = await m1.rpc("send_chat_message", { p_kind: "image", p_media_path: objectPath, p_anonymous: true });
    expect(sent.error).toBeNull();
    const row = (await m2.rpc("chat_feed", {})).data?.find((m) => m.id === sent.data);
    expect(row).toMatchObject({ is_anonymous: true, sender_id: null, sender_name: null, is_mine: false });
    expect(objectPath).not.toContain(M1);
    expect((await m2.storage.from("chat-media").createSignedUrl(objectPath, 60)).data?.signedUrl).toBeTruthy();
    // Members cannot read chat tables directly over REST.
    expect((await m2.from("chat_messages" as never).select("sender_id")).error).toBeTruthy();

    // 24 hours pass for this message (lifetime stays exactly 24 h, per the DB check).
    const expired = await service
      .from("chat_messages")
      .update({ created_at: new Date(Date.now() - 25 * 3_600_000).toISOString(), expires_at: new Date(Date.now() - 3_600_000).toISOString() })
      .eq("id", sent.data!);
    expect(expired.error).toBeNull();
    expect((await m2.rpc("chat_feed", {})).data?.some((m) => m.id === sent.data)).toBe(false);
    expect((await m2.storage.from("chat-media").createSignedUrl(objectPath, 60)).data).toBeNull();

    const { GET } = await import("@/app/api/jobs/chat-purge/route");
    expect((await GET(new NextRequest("http://localhost/api/jobs/chat-purge"))).status).toBe(401);
    const res = await GET(
      new NextRequest("http://localhost/api/jobs/chat-purge", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }),
    );
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.media).toBeGreaterThanOrEqual(1);
    expect((await service.from("chat_messages").select("id").eq("id", sent.data!)).data).toEqual([]);
    expect((await service.storage.from("chat-media").download(objectPath)).data).toBeNull();
  });

  it("realtime chat signals carry no content or sender", async () => {
    const m1 = await signIn("member1@example.com");
    const m2 = await signIn("member2@example.com");
    const events: { payload: Record<string, unknown> }[] = [];
    await new Promise<void>((resolve) => {
      m2.channel(`org:${ORG}`, { config: { private: true } })
        .on("broadcast", { event: "changed" }, (msg) => events.push(msg as never))
        .subscribe((s) => s === "SUBSCRIBED" && resolve());
    });
    await m1.rpc("send_chat_message", { p_kind: "text", p_body: "LIVE-ANON-SECRET", p_anonymous: true });
    await new Promise((r) => setTimeout(r, 2500));
    await m2.removeAllChannels();
    const chat = events.filter((e) => e.payload.entity === "chat");
    expect(chat.length).toBeGreaterThan(0);
    const raw = JSON.stringify(events);
    expect(raw).not.toContain("LIVE-ANON-SECRET");
    expect(raw).not.toContain(M1);
  });

  it("only the Admin can reveal an anonymous sender, and it is audited", async () => {
    const m1 = await signIn("member1@example.com");
    const manager = await signIn("manager@example.com");
    const admin = await signIn("admin@example.com");
    const sent = await m1.rpc("send_chat_message", { p_kind: "text", p_body: "who am i", p_anonymous: true });
    expect((await manager.rpc("admin_chat_identity", { p_message_id: sent.data! })).error?.message).toContain("admin_only");
    const who = await admin.rpc("admin_chat_identity", { p_message_id: sent.data! });
    expect(who.data?.[0]?.sender_id).toBe(M1);
    const audit = await admin.from("admin_audit_logs").select("action, details").eq("action", "chat_identity_revealed");
    expect(audit.data?.some((a) => (a.details as { message_id?: string }).message_id === sent.data)).toBe(true);
  });
});
