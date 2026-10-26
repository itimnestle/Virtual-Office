import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { IDS, asUser, createTestDb, expectError } from "./harness";

const [M1, M2, , , M5] = IDS.members;
const PRIVATE_EVAL = "ประเมินผลงานพนักงานทดลองงาน"; // private, Manager → M5

let db: PGlite;

async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}
const taskId = async (title: string) => (await one<{ id: string }>(`select id from public.tasks where title = $1`, [title])).id;
const file = (task: string, name: string) => ({ path: `${IDS.org}/${task}/${crypto.randomUUID()}-x`, name, size: 10, mime: "application/pdf" });

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

describe("file versions", () => {
  it("same name = new version; users see the latest, Admin sees every version", async () => {
    const id = await taskId("เตรียมรายงานยอดขายไตรมาส 3"); // M1
    await asUser(db, M1, (q) => q(`select public.submit_task($1, 'v1', $2::jsonb)`, [id, JSON.stringify([file(id, "Report.pdf")])]), {
      commit: true,
    });
    await asUser(db, M1, (q) => q(`select public.add_task_files($1, $2::jsonb)`, [id, JSON.stringify([file(id, "report.PDF "), file(id, "notes.txt")])]), {
      commit: true,
    });

    const all = await db.query<{ file_key: string; version: number }>(
      `select file_key, version from public.task_attachments where task_id = $1 order by file_key, version`,
      [id],
    );
    expect(all.rows).toEqual([
      { file_key: "notes.txt", version: 1 },
      { file_key: "report.pdf", version: 1 },
      { file_key: "report.pdf", version: 2 },
    ]);

    for (const user of [M1, M2, IDS.manager, IDS.director]) {
      const seen = await asUser(db, user, (q) => q<{ v: string }>(`select file_key || ':' || version as v from public.task_attachments where task_id = $1 order by 1`, [id]));
      expect(seen.map((r) => r.v), `user ${user}`).toEqual(["notes.txt:1", "report.pdf:2"]);
    }
    const admin = await asUser(db, IDS.admin, (q) => q(`select id from public.task_attachments where task_id = $1`, [id]));
    expect(admin).toHaveLength(3);

    // The Storage visibility helper agrees (old object path is Admin-only).
    const oldPath = (await one<{ p: string }>(`select storage_path as p from public.task_attachments where task_id = $1 and version = 1 and file_key = 'report.pdf'`, [id])).p;
    expect((await asUser(db, M1, (q) => q<{ v: boolean }>(`select private.storage_object_visible($1) as v`, [oldPath])))[0].v).toBe(false);
    expect((await asUser(db, IDS.admin, (q) => q<{ v: boolean }>(`select private.storage_object_visible($1) as v`, [oldPath])))[0].v).toBe(true);
  });

  it("only people who can edit the task may add files, and never to an archived task", async () => {
    const id = await taskId("เตรียมรายงานยอดขายไตรมาส 3");
    await expectError(asUser(db, M2, (q) => q(`select public.add_task_files($1, $2::jsonb)`, [id, JSON.stringify([file(id, "x.pdf")])])), "not_authorized");
    await expectError(
      asUser(db, M1, (q) => q(`select public.add_task_files($1, $2::jsonb)`, [id, JSON.stringify([{ ...file(id, "x.pdf"), path: `${IDS.org}/other/x.pdf` }])])),
      "invalid_attachment_path",
    );
  });
});

describe("checklists", () => {
  it("editors add and tick items; unrelated members never see a private task's checklist", async () => {
    const id = await taskId(PRIVATE_EVAL);
    const item = await asUser(
      db,
      M5,
      async (q) => (await q<{ id: string }>(`select public.add_checklist_item($1, 'CONFIDENTIAL-STEP') as id`, [id]))[0].id,
      { commit: true },
    );
    await asUser(db, IDS.manager, (q) => q(`select public.set_checklist_item_done($1, true)`, [item]), { commit: true });
    const row = await one<{ is_done: boolean; done_by: string }>(`select is_done, done_by from public.task_checklist_items where id = $1`, [item]);
    expect(row).toEqual({ is_done: true, done_by: IDS.manager });

    expect(await asUser(db, M1, (q) => q(`select * from public.task_checklist_items where task_id = $1`, [id]))).toEqual([]);
    await expectError(asUser(db, M1, (q) => q(`select public.add_checklist_item($1, 'x')`, [id])), "not_authorized");
    await expectError(asUser(db, M1, (q) => q(`select public.set_checklist_item_done($1, false)`, [item])), "not_authorized");
    // A team member who is not assigned cannot edit someone else's (public) task either.
    const pub = await taskId("ออกแบบโปสเตอร์งานสัมมนา"); // M2 + M3
    await expectError(asUser(db, M1, (q) => q(`select public.add_checklist_item($1, 'x')`, [pub])), "not_authorized");
  });
});

describe("tags and category", () => {
  it("Admin manages the vocabulary; editors tag tasks; redacted rows expose no tags", async () => {
    await expectError(
      asUser(db, IDS.manager, (q) => q(`insert into public.task_tags (org_id, name) values ($1, 'x')`, [IDS.org])),
      "row-level security",
    );
    const tag = await asUser(
      db,
      IDS.admin,
      async (q) => (await q<{ id: string }>(`insert into public.task_tags (org_id, name, color) values ($1, 'ด่วนพิเศษ', '#ff0000') returning id`, [IDS.org]))[0].id,
      { commit: true },
    );
    const priv = await taskId(PRIVATE_EVAL);
    await asUser(db, M5, (q) => q(`select public.set_task_tags($1, array[$2]::uuid[])`, [priv, tag]), { commit: true });
    await expectError(asUser(db, M1, (q) => q(`select public.set_task_tags($1, '{}')`, [priv])), "not_authorized");

    const m1 = await asUser(db, M1, async (q) => ({
      dir: await q<{ tag_ids: string[] | null }>(`select tag_ids from public.task_directory() where id = $1`, [priv]),
      links: await q(`select * from public.task_tag_links where task_id = $1`, [priv]),
      byTag: await q(`select id from public.search_tasks(p_tag_id => $1)`, [tag]),
    }));
    expect(m1.dir[0].tag_ids).toBeNull();
    expect(m1.links).toEqual([]);
    expect(m1.byTag).toEqual([]); // filtering by tag cannot reveal the private task
    const mgr = await asUser(db, IDS.manager, (q) => q<{ id: string }>(`select id from public.search_tasks(p_tag_id => $1)`, [tag]));
    expect(mgr.map((r) => r.id)).toEqual([priv]);
  });

  it("category can be changed by the creator or leads only", async () => {
    const id = await taskId("ปรับปรุงคู่มือการใช้งานภายใน"); // created by M6
    const cat = (await one<{ id: string }>(`select id from public.task_categories where name_en = 'Documents'`)).id;
    await expectError(asUser(db, M1, (q) => q(`select public.set_task_category($1, $2)`, [id, cat])), "not_authorized");
    await asUser(db, IDS.manager, (q) => q(`select public.set_task_category($1, $2)`, [id, cat]), { commit: true });
    expect((await one<{ c: string }>(`select category_id as c from public.tasks where id = $1`, [id])).c).toBe(cat);
  });
});

describe("admin configuration", () => {
  it("only Admins create/rename teams and categories", async () => {
    for (const user of [M1, IDS.manager, IDS.director]) {
      await expectError(asUser(db, user, (q) => q(`insert into public.teams (org_id, name) values ($1, 'X')`, [IDS.org])), "row-level security");
      await expectError(
        asUser(db, user, (q) => q(`insert into public.task_categories (org_id, name_th, name_en) values ($1, 'x', 'x')`, [IDS.org])),
        "row-level security",
      );
      const renamed = await asUser(db, user, (q) => q(`update public.teams set name = 'hacked' where id = $1 returning id`, [IDS.team]));
      expect(renamed).toEqual([]);
    }
    const team = await asUser(
      db,
      IDS.admin,
      async (q) => (await q<{ id: string }>(`insert into public.teams (org_id, name) values ($1, 'Sales') returning id`, [IDS.org]))[0].id,
      { commit: true },
    );
    await asUser(db, IDS.admin, (q) => q(`select public.admin_set_team_membership($1, $2, true, false)`, [team, M1]), { commit: true });
    await asUser(db, IDS.admin, (q) => q(`update public.task_categories set is_active = false where name_en = 'Client'`), { commit: true });
    expect((await one<{ n: number }>(`select count(*)::int as n from public.team_members where team_id = $1`, [team])).n).toBe(1);
    expect((await one<{ a: boolean }>(`select is_active as a from public.task_categories where name_en = 'Client'`)).a).toBe(false);
  });
});

describe("private-aware search", () => {
  it("descriptions, comments and checklists match only on tasks the caller can open", async () => {
    const priv = await taskId(PRIVATE_EVAL);
    const m1 = await asUser(db, M1, (q) => q<{ id: string }>(`select id from public.search_tasks('CONFIDENTIAL')`));
    expect(m1.map((r) => r.id)).not.toContain(priv);
    const m1Title = await asUser(db, M1, (q) => q<{ id: string; redacted: boolean; status: string | null }>(`select id, redacted, status from public.search_tasks('ประเมินผล')`));
    expect(m1Title).toEqual([{ id: priv, redacted: true, status: null }]); // title is listable, nothing else
    const mgr = await asUser(db, IDS.manager, (q) => q<{ id: string }>(`select id from public.search_tasks('CONFIDENTIAL-STEP')`));
    expect(mgr.map((r) => r.id)).toEqual([priv]); // via checklist item
  });

  it("filters exclude redacted rows and wildcards are literal", async () => {
    const m1 = await asUser(db, M1, async (q) => ({
      pct: await q(`select id from public.search_tasks('%')`),
      underscore: await q(`select id from public.search_tasks('_')`),
      byStatus: await q<{ redacted: boolean }>(`select redacted from public.search_tasks(p_statuses => array['not_started']::public.task_status[])`),
      byAssignee: await q(`select id from public.search_tasks(p_assignee_id => $1)`, [M5]),
    }));
    expect(m1.pct).toEqual([]);
    expect(m1.underscore).toEqual([]);
    expect(m1.byStatus.every((r) => !r.redacted)).toBe(true);
    expect(m1.byAssignee).toEqual([]); // M5's only task is private → no inference
  });

  it("archived tasks are excluded unless requested", async () => {
    const id = await taskId("ออกแบบโปสเตอร์งานสัมมนา");
    await asUser(db, M2, (q) => q(`select public.submit_task($1, 'ok')`, [id]), { commit: true });
    await asUser(db, IDS.manager, (q) => q(`select public.review_task($1, 'approved')`, [id]), { commit: true });
    const without = await asUser(db, M2, (q) => q<{ id: string }>(`select id from public.search_tasks('โปสเตอร์')`));
    const withArchived = await asUser(db, M2, (q) => q<{ id: string }>(`select id from public.search_tasks('โปสเตอร์', p_include_archived => true)`));
    expect(without).toEqual([]);
    expect(withArchived.map((r) => r.id)).toEqual([id]);
    await expectError(asUser(db, M2, (q) => q(`select public.add_checklist_item($1, 'late')`, [id])), "task_archived_immutable");
  });
});
