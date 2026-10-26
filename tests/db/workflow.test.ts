import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { IDS, asUser, createTestDb, expectError } from "./harness";

const [M1, M2, , , M5] = IDS.members;
const MEETING = "30000000-0000-4000-8000-000000000001"; // seed: ended 25h ago, 3 unassigned items

let db: PGlite;

async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}
const taskId = async (title: string) => (await one<{ id: string }>(`select id from public.tasks where title = $1`, [title])).id;
const itemId = async (title: string) =>
  (await one<{ id: string }>(`select id from public.meeting_action_items where title = $1`, [title])).id;

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

describe("A. meeting → unassigned inbox → reminders", () => {
  it("assigning 1 of 3 items leaves 2 in the inbox and creates a real task", async () => {
    const item = await itemId("วางแผนคอนเทนต์โซเชียล 4 สัปดาห์");
    const task = await asUser(
      db,
      IDS.manager,
      async (q) =>
        (
          await q<{ id: string }>(
            `select public.assign_action_item(p_item_id => $1, p_assignee_ids => array[$2]::uuid[], p_size => 'm', p_estimated_hours => 6) as id`,
            [item, M1],
          )
        )[0].id,
      { commit: true },
    );
    const row = await one<{ status: string; task_id: string; source: string }>(
      `select i.status::text, i.task_id, t.source_action_item_id as source
       from public.meeting_action_items i join public.tasks t on t.id = i.task_id where i.id = $1`,
      [item],
    );
    expect(row).toMatchObject({ status: "assigned", task_id: task, source: item });

    const inbox = await asUser(db, IDS.manager, (q) =>
      q(`select id from public.meeting_action_items where status = 'unassigned' and meeting_id = $1`, [MEETING]),
    );
    expect(inbox).toHaveLength(2);
    // Member 1 sees the new task in their workspace and got notified.
    const seen = await asUser(db, M1, (q) => q(`select n.kind from public.notifications n where n.task_id = $1`, [task]));
    expect(seen).toEqual([{ kind: "task_assigned" }]);
  });

  it("an item cannot be assigned twice (retry / double click)", async () => {
    const item = await itemId("วางแผนคอนเทนต์โซเชียล 4 สัปดาห์");
    await expectError(
      asUser(db, IDS.manager, (q) => q(`select public.assign_action_item(p_item_id => $1, p_assignee_ids => array[$2]::uuid[])`, [item, M2])),
      "action_item_already_handled",
    );
  });

  it("sends exactly one reminder per lead per 24h cycle, however often the job runs", async () => {
    const run = async (at: string) => (await one<{ n: number }>(`select public.run_unassigned_meeting_reminders($1::timestamptz) as n`, [at])).n;
    const now = (await one<{ now: string }>(`select now()::text as now`)).now;

    expect(await run(now)).toBe(1); // cycle 1 → the Manager (team lead + creator)
    expect(await run(now)).toBe(0); // retry in the same cycle → nothing
    expect(await run(now)).toBe(0);

    const reminders = await db.query<{ user_id: string; payload: { remaining: number; cycle: number } }>(
      `select user_id, payload from public.notifications where kind = 'meeting_unassigned_reminder'`,
    );
    expect(reminders.rows).toEqual([{ user_id: IDS.manager, payload: expect.objectContaining({ remaining: 2, cycle: 1 }) }]);

    // 24h later: next cycle sends again.
    const later = (await one<{ t: string }>(`select (now() + interval '24 hours')::text as t`)).t;
    expect(await run(later)).toBe(1);
    expect(await run(later)).toBe(0);

    const runs = await one<{ ok: number }>(`select count(*)::int as ok from public.job_runs where status = 'succeeded'`);
    expect(runs.ok).toBe(5);
  });

  it("stops reminding once every item is handled", async () => {
    // Resolve ids first: PGlite serializes queries, so no db.query inside asUser().
    const budgetItem = await itemId("สรุปงบโฆษณาต่อช่องทาง");
    const leadsItem = await itemId("รวบรวมรายชื่อลูกค้าเป้าหมาย");
    await asUser(
      db,
      IDS.manager,
      async (q) => {
        await q(`select public.assign_action_item(p_item_id => $1, p_assignee_ids => array[$2]::uuid[])`, [budgetItem, M2]);
        await q(`select public.dismiss_action_item($1)`, [leadsItem]);
      },
      { commit: true },
    );
    const muchLater = (await one<{ t: string }>(`select (now() + interval '72 hours')::text as t`)).t;
    expect((await one<{ n: number }>(`select public.run_unassigned_meeting_reminders($1::timestamptz) as n`, [muchLater])).n).toBe(0);
  });

  it("only leads create meetings/assign; a proxy member adds notes and items but cannot assign", async () => {
    await expectError(
      asUser(db, M1, (q) =>
        q(`select public.create_meeting($1, 'x', now() - interval '1 hour', now(), null, '{}', '{}', '{}')`, [IDS.team]),
      ),
      "not_authorized",
    );
    const meeting = await asUser(
      db,
      IDS.manager,
      async (q) =>
        (
          await q<{ id: string }>(
            `select public.create_meeting($1, 'ประชุมลูกค้า', now() - interval '2 hours', now() - interval '1 hour',
               'สรุปเบื้องต้น', array[$2]::uuid[], array[$3]::uuid[], array['ส่งใบเสนอราคา', '  ']) as id`,
            [IDS.team, M1, M2],
          )
        )[0].id,
      { commit: true },
    );
    const items = await db.query(`select title from public.meeting_action_items where meeting_id = $1`, [meeting]);
    expect(items.rows).toEqual([{ title: "ส่งใบเสนอราคา" }]);

    const added = await asUser(
      db,
      M2,
      (q) => q<{ n: number }>(`select public.add_meeting_notes($1, 'ลูกค้าขอเลื่อนส่งของ', array['ติดตามลูกค้า']) as n`, [meeting]),
      { commit: true },
    );
    expect(added[0].n).toBe(1);
    const leadNote = await one<{ n: number }>(
      `select count(*)::int as n from public.notifications where kind = 'meeting_notes_added' and user_id = $1`,
      [IDS.manager],
    );
    expect(leadNote.n).toBe(1);

    const item = (await one<{ id: string }>(`select id from public.meeting_action_items where title = 'ติดตามลูกค้า'`)).id;
    await expectError(
      asUser(db, M2, (q) => q(`select public.assign_action_item(p_item_id => $1, p_assignee_ids => array[$2]::uuid[])`, [item, M2])),
      "not_authorized",
    );
    // A non-proxy attendee cannot add notes.
    await expectError(asUser(db, M1, (q) => q(`select public.add_meeting_notes($1, 'x')`, [meeting])), "not_authorized");
  });
});

describe("B. member submit → manager review → archive", () => {
  const TITLE = "เตรียมรายงานยอดขายไตรมาส 3"; // Manager → M1

  it("guards status transitions", async () => {
    const id = await taskId(TITLE);
    await expectError(asUser(db, M1, (q) => q(`select public.update_task_status($1, 'completed')`, [id])), "invalid_transition");
    await expectError(asUser(db, M1, (q) => q(`select public.update_task_status($1, 'in_review')`, [id])), "invalid_transition");
    await expectError(asUser(db, M2, (q) => q(`select public.update_task_status($1, 'in_progress')`, [id])), "not_authorized");
    await asUser(db, M1, (q) => q(`select public.update_task_status($1, 'in_progress')`, [id]), { commit: true });
  });

  it("only assignees can submit, and a submission needs a note or file", async () => {
    const id = await taskId(TITLE);
    await expectError(asUser(db, M2, (q) => q(`select public.submit_task($1, 'x')`, [id])), "only_assignees_can_submit");
    await expectError(asUser(db, M1, (q) => q(`select public.submit_task($1, '  ')`, [id])), "submission_requires_note_or_file");
    await expectError(
      asUser(db, M1, (q) =>
        q(`select public.submit_task($1, 'x', $2::jsonb)`, [id, JSON.stringify([{ path: `${IDS.org}/other-task/x.pdf`, name: "x.pdf" }])]),
      ),
      "invalid_attachment_path",
    );
  });

  it("submit → revision → resubmit → approve archives atomically with audit and files", async () => {
    const id = await taskId(TITLE);
    const file = { path: `${IDS.org}/${id}/report-v1.pdf`, name: "report-v1.pdf", size: 1234, mime: "application/pdf" };
    await asUser(db, M1, (q) => q(`select public.submit_task($1, 'ร่างแรก', $2::jsonb)`, [id, JSON.stringify([file])]), { commit: true });

    let t = await one<{ status: string }>(`select status::text from public.tasks where id = $1`, [id]);
    expect(t.status).toBe("in_review");
    const sub = await one<{ review_level: string; files: number }>(
      `select s.review_level::text, (select count(*)::int from public.task_attachments a where a.submission_id = s.id) as files
       from public.task_submissions s where s.task_id = $1`,
      [id],
    );
    expect(sub).toEqual({ review_level: "manager", files: 1 });
    expect(await one(`select kind from public.notifications where task_id = $1 and user_id = $2 and kind = 'task_submitted'`, [id, IDS.manager])).toBeTruthy();

    // The Director is not the reviewer of member work while the team has a Manager.
    await expectError(asUser(db, IDS.director, (q) => q(`select public.review_task($1, 'approved')`, [id])), "not_reviewer");
    await expectError(asUser(db, M1, (q) => q(`select public.review_task($1, 'approved')`, [id])), "not_reviewer");
    await expectError(asUser(db, IDS.manager, (q) => q(`select public.review_task($1, 'revision_required')`, [id])), "revision_requires_comment");

    await asUser(db, IDS.manager, (q) => q(`select public.review_task($1, 'revision_required', 'เพิ่มกราฟช่องทางออนไลน์')`, [id]), {
      commit: true,
    });
    t = await one(`select status::text from public.tasks where id = $1`, [id]);
    expect(t.status).toBe("revision_required");

    await asUser(db, M1, (q) => q(`select public.submit_task($1, 'แก้ไขแล้ว')`, [id]), { commit: true });
    await asUser(db, IDS.manager, (q) => q(`select public.review_task($1, 'approved', 'ดีมาก')`, [id]), { commit: true });

    const done = await one<{ status: string; archived: boolean; archived_by: string }>(
      `select status::text, archived_at is not null as archived, archived_by from public.tasks where id = $1`,
      [id],
    );
    expect(done).toEqual({ status: "completed", archived: true, archived_by: IDS.manager });
    const audit = await db.query<{ action: string }>(`select action from public.task_audit_logs where task_id = $1 order by id`, [id]);
    expect(audit.rows.map((r) => r.action)).toEqual([
      "created",
      "status_changed",
      "submitted",
      "revision_requested",
      "submitted",
      "approved_and_archived",
    ]);
  });

  it("a retried approval and any later change are rejected (archive is read-only)", async () => {
    const id = await taskId(TITLE);
    await expectError(asUser(db, IDS.manager, (q) => q(`select public.review_task($1, 'approved')`, [id])), "task_archived_immutable");
    await expectError(asUser(db, M1, (q) => q(`select public.update_task_status($1, 'in_progress')`, [id])), "task_archived_immutable");
    await expectError(asUser(db, M1, (q) => q(`select public.submit_task($1, 'again')`, [id])), "task_archived_immutable");
    // Reviews/submissions are append-only too.
    await expectError(db.query(`update public.task_reviews set comment = 'x'`), "append_only_table");
  });
});

describe("C. Manager-owned task → Director review", () => {
  it("routes the Manager's submission to the Director only", async () => {
    const id = await taskId("จัดทำแผนงบประมาณปี 2027");
    await asUser(db, IDS.manager, (q) => q(`select public.submit_task($1, 'ร่างงบประมาณ')`, [id]), { commit: true });
    const sub = await one<{ review_level: string }>(`select review_level::text from public.task_submissions where task_id = $1`, [id]);
    expect(sub.review_level).toBe("director");
    const notified = await db.query<{ user_id: string }>(
      `select user_id from public.notifications where task_id = $1 and kind = 'task_submitted'`,
      [id],
    );
    expect(notified.rows).toEqual([{ user_id: IDS.director }]);

    await expectError(asUser(db, IDS.manager, (q) => q(`select public.review_task($1, 'approved')`, [id])), "not_reviewer");
    await asUser(db, IDS.director, (q) => q(`select public.review_task($1, 'approved')`, [id]), { commit: true });
    expect((await one<{ s: string }>(`select status::text as s from public.tasks where id = $1`, [id])).s).toBe("completed");
  });
});

describe("D. private task workflow stays confidential", () => {
  it("unrelated members cannot act on or read submissions of a private task", async () => {
    const id = await taskId("ประเมินผลงานพนักงานทดลองงาน");
    await asUser(db, M5, (q) => q(`select public.submit_task($1, 'CONFIDENTIAL-SUBMISSION')`, [id]), { commit: true });

    await expectError(asUser(db, M1, (q) => q(`select public.update_task_status($1, 'paused')`, [id])), "task_not_found");
    await expectError(asUser(db, M1, (q) => q(`select public.submit_task($1, 'x')`, [id])), "task_not_found");
    await expectError(asUser(db, M1, (q) => q(`select public.review_task($1, 'approved')`, [id])), "not_reviewer");
    const out = await asUser(db, M1, async (q) => ({
      subs: await q(`select * from public.task_submissions where task_id = $1`, [id]),
      files: await q(`select * from public.task_attachments where task_id = $1`, [id]),
      reviews: await q(`select * from public.task_reviews where task_id = $1`, [id]),
    }));
    expect(out).toEqual({ subs: [], files: [], reviews: [] });
    // The Manager (reviewer) does see it.
    const mgr = await asUser(db, IDS.manager, (q) => q<{ note: string }>(`select note from public.task_submissions where task_id = $1`, [id]));
    expect(mgr[0].note).toBe("CONFIDENTIAL-SUBMISSION");
  });
});
