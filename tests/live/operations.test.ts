/**
 * Milestone C live checks (local Supabase): extension flow over PostgREST,
 * mention privacy, leads-only suggestions, job functions not callable by users.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
const TEAM = "10000000-0000-4000-8000-000000000001";
const M1 = "20000000-0000-4000-8000-000000000011";
const M6 = "20000000-0000-4000-8000-000000000016";

async function stackUp(): Promise<boolean> {
  if (!URL || !KEY || !SECRET) return false;
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
  return c;
}

d("live: Milestone C operations", () => {
  it("extension request → manager decision over the API, with reminders paused meanwhile", async () => {
    const manager = await signIn("manager@example.com");
    const m6 = await signIn("member6@example.com");
    const { data: taskId } = await manager.rpc("create_task", {
      p_team_id: TEAM,
      p_title: `LIVE-EXT-${Date.now()}`,
      p_assignee_ids: [M6],
      p_due_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    });
    const req = await m6.rpc("request_due_change", {
      p_task_id: taskId!,
      p_proposed_due_at: new Date(Date.now() + 10 * 86_400_000).toISOString(),
      p_reason: "รอข้อมูล",
    });
    expect(req.error).toBeNull();
    expect((await m6.rpc("is_task_reviewer", { p_task_id: taskId! })).data).toBe(false);
    expect((await manager.rpc("is_task_reviewer", { p_task_id: taskId! })).data).toBe(true);
    const row = (await m6.rpc("task_directory")).data?.find((r) => r.id === taskId);
    expect(row?.has_pending_extension).toBe(true);

    expect((await m6.rpc("decide_due_change", { p_request_id: req.data!, p_approve: true })).error?.message).toContain("not_reviewer");
    expect((await manager.rpc("decide_due_change", { p_request_id: req.data!, p_approve: true })).error).toBeNull();
    const { data: t } = await manager.from("tasks").select("due_at").eq("id", taskId!).single();
    expect(new Date(t!.due_at!).getTime()).toBeGreaterThan(Date.now() + 9 * 86_400_000);
  });

  it("a mention of someone who cannot open a private task is dropped", async () => {
    const manager = await signIn("manager@example.com");
    const { data: taskId } = await manager.rpc("create_task", {
      p_team_id: TEAM,
      p_title: `LIVE-PRIV-COMMENT-${Date.now()}`,
      p_assignee_ids: [M6],
      p_is_private: true,
    });
    const c = await manager.rpc("add_task_comment", { p_task_id: taskId!, p_body: "LIVE-SECRET-COMMENT", p_mentions: [M1, M6] });
    expect(c.error).toBeNull();
    const m1 = await signIn("member1@example.com");
    expect((await m1.from("task_comments").select("id").eq("task_id", taskId!)).data).toEqual([]);
    const m1Notes = await m1.from("notifications").select("payload").eq("kind", "mentioned");
    expect(JSON.stringify(m1Notes.data)).not.toContain("LIVE-SECRET-COMMENT");
    const m6 = await signIn("member6@example.com");
    const m6Notes = await m6.from("notifications").select("payload").eq("task_id", taskId!).eq("kind", "mentioned");
    expect(m6Notes.data).toHaveLength(1);
  });

  it("older file versions are Admin-only in Storage as well as in the table", async () => {
    const manager = await signIn("manager@example.com");
    const m6 = await signIn("member6@example.com");
    const admin = await signIn("admin@example.com");
    const { data: taskId } = await manager.rpc("create_task", { p_team_id: TEAM, p_title: `LIVE-VERSIONS-${Date.now()}`, p_assignee_ids: [M6] });
    const ORG = "00000000-0000-4000-8000-000000000001";
    const upload = async (body: string) => {
      const path = `${ORG}/${taskId}/${crypto.randomUUID()}-plan.txt`;
      expect((await m6.storage.from("task-files").upload(path, new Blob([body], { type: "text/plain" }))).error).toBeNull();
      expect((await m6.rpc("add_task_files", { p_task_id: taskId!, p_attachments: [{ path, name: "plan.txt", size: body.length, mime: "text/plain" }] })).error).toBeNull();
      return path;
    };
    const v1 = await upload("VERSION-1");
    const v2 = await upload("VERSION-2");

    const seen = await manager.from("task_attachments").select("version").eq("task_id", taskId!);
    expect(seen.data).toEqual([{ version: 2 }]);
    expect((await manager.storage.from("task-files").download(v1)).data).toBeNull();
    expect((await m6.storage.from("task-files").createSignedUrl(v1, 60)).data).toBeNull();
    expect(await (await manager.storage.from("task-files").download(v2)).data?.text()).toBe("VERSION-2");

    expect((await admin.from("task_attachments").select("version").eq("task_id", taskId!)).data).toHaveLength(2);
    expect(await (await admin.storage.from("task-files").download(v1)).data?.text()).toBe("VERSION-1");
  });

  it("suggestions are leads-only and jobs cannot be run by users", async () => {
    const m1 = await signIn("member1@example.com");
    expect((await m1.rpc("suggest_assignees", { p_team_id: TEAM })).error?.message).toContain("not_authorized");
    const manager = await signIn("manager@example.com");
    const s = await manager.rpc("suggest_assignees", { p_team_id: TEAM, p_size: "m" });
    expect(s.error).toBeNull();
    expect(s.data!.length).toBeGreaterThanOrEqual(8);
    const job = await manager.rpc("run_due_reminders" as never);
    expect((job as { error: unknown }).error).toBeTruthy();
    const anon = createClient<Database>(URL, KEY, { auth: { persistSession: false } });
    expect((await anon.rpc("task_directory")).error).toBeTruthy();
  });
});
