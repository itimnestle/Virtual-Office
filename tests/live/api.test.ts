/**
 * Live security tests against the real local Supabase stack (GoTrue,
 * PostgREST, Storage, Realtime). Run `npx supabase start && npx supabase db reset`
 * first. Skipped automatically when the stack/env is not available.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";

try {
  process.loadEnvFile(path.resolve(__dirname, "../../.env.local"));
} catch {
  /* env may come from the shell */
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const SECRET = process.env.SUPABASE_SECRET_KEY ?? "";
const PASSWORD = "VirtualOffice2026";
const ORG = "00000000-0000-4000-8000-000000000001";
const PRIVATE_TITLE = "ประเมินผลงานพนักงานทดลองงาน";

async function stackUp(): Promise<boolean> {
  if (!URL || !KEY || !SECRET) return false;
  try {
    const r = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: KEY } });
    return r.ok;
  } catch {
    return false;
  }
}

const available = await stackUp();
const d = available ? describe : describe.skip;
if (!available) console.warn("[live] Supabase stack not reachable — live API tests skipped.");

async function signIn(email: string): Promise<SupabaseClient> {
  const c = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return c;
}

d("live API: authentication", () => {
  it("every seeded role can sign in", async () => {
    for (const email of ["admin@example.com", "director@example.com", "manager@example.com", "member1@example.com"]) {
      const c = await signIn(email);
      const { data } = await c.from("profiles").select("role").eq("email", email).single();
      expect(data?.role).toBeTruthy();
    }
  });

  it("public sign-up is disabled (invite-only)", async () => {
    const c = createClient(URL, KEY, { auth: { persistSession: false } });
    const { error } = await c.auth.signUp({ email: `stranger-${Date.now()}@example.com`, password: PASSWORD });
    expect(error).toBeTruthy();
  });

  it("even the service role cannot create a user without an invite (DB trigger)", async () => {
    const admin = createClient(URL, SECRET, { auth: { persistSession: false } });
    const { error } = await admin.auth.admin.createUser({ email: `noinvite-${Date.now()}@example.com`, password: PASSWORD, email_confirm: true });
    expect(error).toBeTruthy();
  });

  it("anon key alone reads nothing", async () => {
    const c = createClient(URL, KEY, { auth: { persistSession: false } });
    const { data, error } = await c.from("tasks").select("id");
    expect(data ?? []).toEqual([]);
    expect(error).toBeTruthy();
  });
});

d("live API: private task confidentiality", () => {
  let member: SupabaseClient;
  let manager: SupabaseClient;
  let service: SupabaseClient;
  let privateId: string;
  const objectPath = () => `${ORG}/${privateId}/live-test-secret.txt`;

  beforeAll(async () => {
    member = await signIn("member1@example.com");
    manager = await signIn("manager@example.com");
    service = createClient(URL, SECRET, { auth: { persistSession: false } });
    const { data } = await service.from("tasks").select("id").eq("title", PRIVATE_TITLE).single();
    privateId = data!.id;
    await service.storage.from("task-files").upload(objectPath(), new Blob(["CONFIDENTIAL-FILE"], { type: "text/plain" }), { upsert: true });
  });

  afterAll(async () => {
    await service?.storage.from("task-files").remove([objectPath()]);
  });

  it("REST: unrelated member gets no row, no assignees, no audit", async () => {
    const [t, a, l] = await Promise.all([
      member.from("tasks").select("*").eq("id", privateId),
      member.from("task_assignees").select("*").eq("task_id", privateId),
      member.from("task_audit_logs").select("*").eq("task_id", privateId),
    ]);
    expect(t.data).toEqual([]);
    expect(a.data).toEqual([]);
    expect(l.data).toEqual([]);
  });

  it("REST filter/search cannot probe the description", async () => {
    const { data } = await member.from("tasks").select("id").ilike("description", "%CONFIDENTIAL%");
    expect(data).toEqual([]);
  });

  it("RPC directory returns the title only", async () => {
    const { data } = await member.rpc("task_directory");
    const row = (data ?? []).find((r: { id: string }) => r.id === privateId);
    expect(row).toMatchObject({ title: PRIVATE_TITLE, redacted: true, status: null, due_at: null, assignee_ids: null });
    expect(JSON.stringify(data)).not.toContain("CONFIDENTIAL");
  });

  it("Storage: unrelated member cannot download, list, or sign a URL for the file", async () => {
    const dl = await member.storage.from("task-files").download(objectPath());
    expect(dl.data).toBeNull();
    const signed = await member.storage.from("task-files").createSignedUrl(objectPath(), 60);
    expect(signed.data).toBeNull();
    const list = await member.storage.from("task-files").list(`${ORG}/${privateId}`);
    expect(list.data ?? []).toEqual([]);
    const upload = await member.storage.from("task-files").upload(`${ORG}/${privateId}/intruder.txt`, new Blob(["x"]));
    expect(upload.error).toBeTruthy();
  });

  it("Storage: the Manager can download the file", async () => {
    const dl = await manager.storage.from("task-files").download(objectPath());
    expect(await dl.data?.text()).toBe("CONFIDENTIAL-FILE");
  });

  it("Realtime: an unrelated member receives no task change payloads", async () => {
    const events: unknown[] = [];
    await member.realtime.setAuth((await member.auth.getSession()).data.session!.access_token);
    const channel = member
      .channel("leak-probe")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, (p) => events.push(p))
      .subscribe();
    await new Promise((r) => setTimeout(r, 2500));
    // Touch a non-archived private task through the service role.
    await service.from("tasks").update({ priority: "high" }).eq("id", privateId);
    await new Promise((r) => setTimeout(r, 2500));
    await member.removeChannel(channel);
    expect(JSON.stringify(events)).not.toContain("CONFIDENTIAL");
    expect(events.filter((e) => JSON.stringify(e).includes(privateId))).toEqual([]);
  });
});

d("live API: unauthorized admin actions", () => {
  it("a Member cannot call admin RPCs or read invites", async () => {
    const member = await signIn("member2@example.com");
    const r = await member.rpc("admin_set_user_active", { p_user_id: "20000000-0000-4000-8000-000000000011", p_active: false });
    expect(r.error?.message).toContain("admin_only");
    const inv = await member.from("invites").select("*");
    expect(inv.data).toEqual([]);
  });

  it("a Member cannot escalate their role via REST", async () => {
    const member = await signIn("member2@example.com");
    const r = await member.from("profiles").update({ role: "admin" } as never).eq("email", "member2@example.com");
    expect(r.error).toBeTruthy();
  });
});

d("live API: invite → accept → deactivate lifecycle", () => {
  it("admin invites, user sets own password, deactivation blocks access but keeps data", async () => {
    const { createHash, randomBytes } = await import("node:crypto");
    const admin = await signIn("admin@example.com");
    const service = createClient(URL, SECRET, { auth: { persistSession: false } });
    const email = `live-${Date.now()}@example.com`;
    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");

    const inv = await admin.rpc("admin_create_invite", {
      p_email: email,
      p_full_name: "Live Test",
      p_role: "member",
      p_team_id: "10000000-0000-4000-8000-000000000001",
      p_token_hash: hash,
    });
    expect(inv.error).toBeNull();

    // Accept exactly as src/lib/auth/invite.ts does.
    const created = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { invite_token: token },
    });
    expect(created.error).toBeNull();
    // Replaying the token cannot create another account.
    const replay = await service.auth.admin.createUser({
      email: `other-${email}`,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { invite_token: token },
    });
    expect(replay.error).toBeTruthy();
    // The consumed token is not kept in the stored user metadata.
    const stored = await service.auth.admin.getUserById(created.data.user!.id);
    expect(JSON.stringify(stored.data.user?.user_metadata ?? {})).not.toContain(token);

    const user = await signIn(email);
    const own = await user.rpc("create_task", { p_team_id: "10000000-0000-4000-8000-000000000001", p_title: "live self task" });
    expect(own.error).toBeNull();

    const uid = created.data.user!.id;
    expect((await admin.rpc("admin_set_user_active", { p_user_id: uid, p_active: false })).error).toBeNull();
    await service.auth.admin.updateUserById(uid, { ban_duration: "876000h" });

    // Existing access token: RLS already denies everything.
    expect((await user.from("tasks").select("id")).data).toEqual([]);
    // New sign-in is refused by Auth.
    const c = createClient(URL, KEY, { auth: { persistSession: false } });
    expect((await c.auth.signInWithPassword({ email, password: PASSWORD })).error).toBeTruthy();
    // History retained.
    const kept = await service.from("task_assignees").select("task_id").eq("user_id", uid);
    expect(kept.data?.length).toBe(1);
  });
});
