/**
 * Milestone B live checks against the local Supabase stack: Realtime channel
 * authorization and content-free payloads, Storage-backed submissions, and
 * the 3D office snapshot built through the shared query layer.
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import type { Database } from "@/lib/database.types";
import { getOfficeSnapshot } from "@/lib/data/office";

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
const TEAM = "10000000-0000-4000-8000-000000000001";
const M3 = "20000000-0000-4000-8000-000000000013";
const M2 = "20000000-0000-4000-8000-000000000012";

async function stackUp(): Promise<boolean> {
  if (!URL || !KEY || !SECRET) return false;
  try {
    return (await fetch(`${URL}/auth/v1/health`, { headers: { apikey: KEY } })).ok;
  } catch {
    return false;
  }
}
const available = await stackUp();
const d = available ? describe : describe.skip;

async function signIn(email: string): Promise<SupabaseClient<Database>> {
  const c = createClient<Database>(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  await c.realtime.setAuth((await c.auth.getSession()).data.session!.access_token);
  return c;
}

function subscribe(client: SupabaseClient, topic: string, sink: unknown[]): Promise<{ status: string; channel: RealtimeChannel }> {
  return new Promise((resolve) => {
    const channel = client
      .channel(topic, { config: { private: true } })
      .on("broadcast", { event: "changed" }, (msg) => sink.push(msg))
      .subscribe((status) => {
        if (status !== "SUBSCRIBED" && status !== "CHANNEL_ERROR" && status !== "TIMED_OUT") return;
        resolve({ status, channel });
      });
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

d("live: realtime signals are authorized and content-free", () => {
  let member: SupabaseClient<Database>;
  let manager: SupabaseClient<Database>;

  beforeAll(async () => {
    member = await signIn("member1@example.com");
    manager = await signIn("manager@example.com");
  });

  it("a member cannot join another org's channel or another user's channel", async () => {
    const other = await subscribe(member, `org:${crypto.randomUUID()}`, []);
    expect(other.status).not.toBe("SUBSCRIBED");
    const someoneElse = await subscribe(member, `user:${M2}`, []);
    expect(someoneElse.status).not.toBe("SUBSCRIBED");
    await member.removeAllChannels();
  });

  it("changes to a private task reach members only as an id-free 'tasks changed' signal", async () => {
    const events: { payload: unknown }[] = [];
    const sub = await subscribe(member, `org:${ORG}`, events);
    expect(sub.status).toBe("SUBSCRIBED");

    const { data: created } = await manager.rpc("create_task", {
      p_team_id: TEAM,
      p_title: `LIVE-PRIVATE-${Date.now()}`,
      p_description: "LIVE-CONFIDENTIAL",
      p_assignee_ids: [M3],
      p_is_private: true,
    });
    expect(created).toBeTruthy();
    await wait(2500);
    await member.removeAllChannels();

    expect(events.length).toBeGreaterThan(0);
    const raw = JSON.stringify(events);
    expect(raw).not.toContain(String(created));
    expect(raw).not.toContain("LIVE-PRIVATE");
    expect(raw).not.toContain("LIVE-CONFIDENTIAL");
    // Realtime adds its own message id; the only domain field is the entity name.
    for (const e of events) {
      const payload = e.payload as Record<string, unknown>;
      expect(Object.keys(payload).sort()).toEqual(["entity", "id"]);
      expect(["tasks", "meetings", "absences"]).toContain(payload.entity);
    }
  });

  it("an assignee gets a personal notification signal", async () => {
    const m3 = await signIn("member3@example.com");
    const events: unknown[] = [];
    expect((await subscribe(m3, `user:${M3}`, events)).status).toBe("SUBSCRIBED");
    await manager.rpc("create_task", { p_team_id: TEAM, p_title: `LIVE-NOTIFY-${Date.now()}`, p_assignee_ids: [M3] });
    await wait(2500);
    await m3.removeAllChannels();
    expect(JSON.stringify(events)).toContain('"entity":"notifications"');
  });
});

d("live: submit with a Storage file → review → archive", () => {
  it("runs the full path and keeps the file private", async () => {
    const manager = await signIn("manager@example.com");
    const m3 = await signIn("member3@example.com");
    const m1 = await signIn("member1@example.com");

    const { data: taskId, error } = await manager.rpc("create_task", {
      p_team_id: TEAM,
      p_title: `LIVE-FLOW-${Date.now()}`,
      p_assignee_ids: [M3],
      p_is_private: true,
    });
    expect(error).toBeNull();

    // Cannot submit a file that was never uploaded.
    const ghost = await m3.rpc("submit_task", {
      p_task_id: taskId!,
      p_attachments: [{ path: `${ORG}/${taskId}/ghost.pdf`, name: "ghost.pdf", size: 1, mime: "application/pdf" }],
    });
    expect(ghost.error?.message).toContain("attachment_not_uploaded");

    // Unrelated member cannot upload into the task folder.
    const intrude = await m1.storage.from("task-files").upload(`${ORG}/${taskId}/x.txt`, new Blob(["x"], { type: "text/plain" }));
    expect(intrude.error).toBeTruthy();

    const filePath = `${ORG}/${taskId}/${crypto.randomUUID()}-report.txt`;
    const up = await m3.storage.from("task-files").upload(filePath, new Blob(["LIVE-FILE-BODY"], { type: "text/plain" }));
    expect(up.error).toBeNull();
    const sub = await m3.rpc("submit_task", {
      p_task_id: taskId!,
      p_note: "เสร็จแล้ว",
      p_attachments: [{ path: filePath, name: "รายงาน.txt", size: 14, mime: "text/plain" }],
    });
    expect(sub.error).toBeNull();

    expect((await manager.rpc("can_review_task", { p_task_id: taskId! })).data).toBe(true);
    expect((await m3.rpc("can_review_task", { p_task_id: taskId! })).data).toBe(false);

    // Unrelated member: no attachment row, no download, no signed URL.
    expect((await m1.from("task_attachments").select("id").eq("task_id", taskId!)).data).toEqual([]);
    expect((await m1.storage.from("task-files").download(filePath)).data).toBeNull();
    expect((await m1.storage.from("task-files").createSignedUrl(filePath, 60)).data).toBeNull();

    // Two concurrent approvals: exactly one wins.
    const [a, b] = await Promise.all([
      manager.rpc("review_task", { p_task_id: taskId!, p_decision: "approved" }),
      manager.rpc("review_task", { p_task_id: taskId!, p_decision: "approved" }),
    ]);
    expect([a.error, b.error].filter(Boolean)).toHaveLength(1);

    const { data: task } = await manager.from("tasks").select("status, archived_at").eq("id", taskId!).single();
    expect(task?.status).toBe("completed");
    expect(task?.archived_at).toBeTruthy();

    // Archived: files stay readable for authorized people, but nothing new can be added.
    expect(await (await m3.storage.from("task-files").download(filePath)).data?.text()).toBe("LIVE-FILE-BODY");
    const late = await m3.storage.from("task-files").upload(`${ORG}/${taskId}/late.txt`, new Blob(["late"], { type: "text/plain" }));
    expect(late.error).toBeTruthy();
  });
});

d("live: 3D office snapshot uses the same authorized data", () => {
  it("never exposes private task details to an unrelated member", async () => {
    const m1 = await signIn("member1@example.com");
    const snapshot = await getOfficeSnapshot(m1);
    const raw = JSON.stringify(snapshot);
    expect(raw).not.toContain("CONFIDENTIAL");
    expect(raw).not.toContain("ประเมินผลงานพนักงานทดลองงาน");
    expect(raw).not.toContain("LIVE-PRIVATE");
    // Admin is not placed in the office; Director, Manager and 7 members are.
    expect(snapshot.people.filter((p) => p.role === "member").length).toBeGreaterThanOrEqual(7);
    expect(snapshot.people.some((p) => p.role === "director")).toBe(true);
  });

  it("matches the dashboard directory for the same viewer", async () => {
    const mgr = await signIn("manager@example.com");
    const [snapshot, dir] = await Promise.all([getOfficeSnapshot(mgr), mgr.rpc("task_directory")]);
    const m5 = snapshot.people.find((p) => p.id === "20000000-0000-4000-8000-000000000015")!;
    const fromDirectory = (dir.data ?? []).filter(
      (r) => r.assignee_ids?.includes(m5.id) && !r.archived_at && r.status !== "completed" && r.status !== "cancelled",
    );
    expect(m5.workload.open).toBe(fromDirectory.length);
    // The Manager may see the private evaluation task on M5's desk.
    expect(m5.tasks.map((t) => t.title)).toContain("ประเมินผลงานพนักงานทดลองงาน");
  });
});
