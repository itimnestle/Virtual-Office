import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { IDS, asUser, createTestDb, expectError } from "./harness";

const [M1, , , , M5] = IDS.members;
let db: PGlite;

const window = `current_date - 30, current_date + 30`;

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

describe("report_tasks", () => {
  it("excludes other people's private tasks entirely (no aggregate leak)", async () => {
    const priv = (await db.query<{ id: string }>(`select id from public.tasks where title = 'ประเมินผลงานพนักงานทดลองงาน'`)).rows[0].id;
    const m1 = await asUser(db, M1, (q) => q<{ id: string }>(`select id from public.report_tasks(${window})`));
    const m5 = await asUser(db, M5, (q) => q<{ id: string }>(`select id from public.report_tasks(${window})`));
    const mgr = await asUser(db, IDS.manager, (q) => q<{ id: string }>(`select id from public.report_tasks(${window})`));
    expect(m1.map((r) => r.id)).not.toContain(priv);
    expect(m5.map((r) => r.id)).toContain(priv);
    expect(mgr.map((r) => r.id)).toContain(priv);
    expect(mgr.length).toBe(7); // all seeded tasks
    expect(m1.length).toBe(5); // non-private only
  });

  it("uses the approved submission time for timeliness", async () => {
    const id = (await db.query<{ id: string }>(`select id from public.tasks where title = 'เตรียมรายงานยอดขายไตรมาส 3'`)).rows[0].id;
    await asUser(db, M1, (q) => q(`select public.submit_task($1, 'done')`, [id]), { commit: true });
    await asUser(db, IDS.manager, (q) => q(`select public.review_task($1, 'approved')`, [id]), { commit: true });
    const row = await asUser(db, M1, (q) =>
      q<{ approved_submitted_at: string | null; completed_at: string | null }>(`select approved_submitted_at, completed_at from public.report_tasks(${window}) where id = $1`, [id]),
    );
    expect(row[0].approved_submitted_at).toBeTruthy();
    expect(row[0].completed_at).toBeTruthy();
  });

  it("refuses windows longer than two years and returns nothing for other orgs or anon", async () => {
    const long = await asUser(db, IDS.manager, (q) => q(`select id from public.report_tasks(current_date - 1000, current_date)`));
    expect(long).toEqual([]);
    await expectError(asUser(db, null, (q) => q(`select * from public.report_tasks(current_date, current_date)`), { role: "anon" }), "permission denied");
  });
});

describe("log_export", () => {
  it("audits exports without content and validates input", async () => {
    await asUser(db, M1, (q) => q(`select public.log_export('tasks', 'csv', 12, '{"q":"x"}')`), { commit: true });
    await expectError(asUser(db, M1, (q) => q(`select public.log_export('everything', 'csv', 1)`)), "invalid_input");
    const rows = await db.query<{ actor_id: string; details: Record<string, unknown> }>(
      `select actor_id, details from public.admin_audit_logs where action = 'export'`,
    );
    expect(rows.rows).toEqual([{ actor_id: M1, details: { kind: "tasks", format: "csv", rows: 12, filters: { q: "x" } } }]);
    // Members still cannot read the audit log themselves.
    expect(await asUser(db, M1, (q) => q(`select * from public.admin_audit_logs`))).toEqual([]);
  });
});
