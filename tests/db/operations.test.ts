import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { IDS, asUser, createTestDb, expectError } from "./harness";

const [M1, M2, M3, M4, M5] = IDS.members;
// A Wednesday, 10:00 Bangkok time. Jobs take the clock as a parameter.
const WED = "2026-10-28T03:00:00Z";

let db: PGlite;

async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}
const taskId = async (title: string) => (await one<{ id: string }>(`select id from public.tasks where title = $1`, [title])).id;

/** Manager creates a task for `assignee` due `days` after WED at 17:00 Bangkok. */
async function managerTask(title: string, assignee: string, days: number | null, extra = ""): Promise<string> {
  const due = days === null ? "null" : `(date '2026-10-28' + ${days} + time '17:00') at time zone 'Asia/Bangkok'`;
  return asUser(
    db,
    IDS.manager,
    async (q) =>
      (
        await q<{ id: string }>(
          `select public.create_task(p_team_id => $1, p_title => $2, p_assignee_ids => array[$3]::uuid[], p_due_at => ${due} ${extra}) as id`,
          [IDS.team, title, assignee],
        )
      )[0].id,
    { commit: true },
  );
}

const notes = (kind: string, task: string) =>
  db.query<{ user_id: string; payload: Record<string, unknown> }>(
    `select user_id, payload from public.notifications where kind = $1 and task_id = $2 order by user_id`,
    [kind, task],
  );

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

describe("1. eight states and guarded transitions", () => {
  it("the status enum has exactly the 8 confirmed states", async () => {
    const r = await db.query<{ v: string }>(`select unnest(enum_range(null::public.task_status))::text as v`);
    expect(r.rows.map((x) => x.v)).toEqual([
      "not_started",
      "in_progress",
      "blocked",
      "in_review",
      "revision_required",
      "completed",
      "paused",
      "cancelled",
    ]);
  });

  it("rejects invalid transitions and lets members only move work states", async () => {
    const id = await managerTask("T-states", M1, 10);
    for (const bad of ["completed", "in_review", "revision_required", "not_started", "cancelled"]) {
      await expectError(asUser(db, M1, (q) => q(`select public.update_task_status($1, $2::public.task_status)`, [id, bad])), "invalid_transition");
    }
    for (const step of ["in_progress", "blocked", "paused", "in_progress"]) {
      await asUser(db, M1, (q) => q(`select public.update_task_status($1, $2::public.task_status)`, [id, step]), { commit: true });
    }
    await expectError(asUser(db, M1, (q) => q(`select public.update_task_status($1, 'in_progress')`, [id])), "invalid_transition");
    // Leads may cancel; cancelled is terminal.
    await asUser(db, IDS.manager, (q) => q(`select public.update_task_status($1, 'cancelled')`, [id]), { commit: true });
    await expectError(asUser(db, IDS.manager, (q) => q(`select public.update_task_status($1, 'in_progress')`, [id])), "invalid_transition");
  });
});

describe("2. urgent path", () => {
  it("Director's direct urgent assignment notifies the Manager; later changes notify the Director", async () => {
    const id = await taskId("แก้ไขสไลด์นำเสนอลูกค้าด่วน"); // seed: Director → M4, urgent
    expect((await notes("urgent_direct_assignment_notice", id)).rows.map((r) => r.user_id)).toEqual([IDS.manager]);

    await asUser(db, IDS.manager, (q) => q(`select public.update_task_details($1, p_priority => 'low', p_due_at => now() + interval '3 days')`, [id]), {
      commit: true,
    });
    const notice = (await notes("urgent_task_changed", id)).rows;
    expect(notice.map((r) => r.user_id)).toEqual([IDS.director]);
    expect(Object.keys(notice[0].payload.changes as object).sort()).toEqual(["due_at", "priority"]);
    // Members cannot change deadline/priority directly.
    await expectError(asUser(db, M4, (q) => q(`select public.update_task_details($1, p_priority => 'high')`, [id])), "not_authorized");
  });
});

describe("3. extension requests pause reminders", () => {
  it("pending pauses, rejection resumes with the old date, approval moves the date", async () => {
    const id = await managerTask("T-extension", M2, 3); // due Sat 31 Oct 17:00 BKK
    const run = async (at: string) => (await one<{ n: number }>(`select public.run_due_reminders($1::timestamptz) as n`, [at])).n;

    await run(WED);
    expect((await notes("due_reminder", id)).rows.map((r) => r.user_id).sort()).toEqual([M2, IDS.director, IDS.manager].sort());
    expect((await notes("due_reminder", id)).rows[0].payload.days_left).toBe(3);

    // Member asks for more time → reminders stop for this task.
    const req = await asUser(
      db,
      M2,
      async (q) =>
        (await q<{ id: string }>(`select public.request_due_change($1, now() + interval '20 days', 'รอข้อมูลจากลูกค้า') as id`, [id]))[0].id,
      { commit: true },
    );
    await expectError(
      asUser(db, M2, (q) => q(`select public.request_due_change($1, now() + interval '21 days', 'อีกครั้ง')`, [id])),
      "request_already_pending",
    );
    const label = await asUser(db, M2, (q) => q<{ p: boolean }>(`select has_pending_extension as p from public.task_directory() where id = $1`, [id]));
    expect(label[0].p).toBe(true);
    const THU = "2026-10-29T03:00:00Z";
    await run(THU);
    expect((await notes("due_reminder", id)).rows).toHaveLength(3); // nothing new while pending

    // Only the reviewer decides; rejection keeps the due date and resumes reminders.
    await expectError(asUser(db, M2, (q) => q(`select public.decide_due_change($1, true)`, [req])), "not_reviewer");
    const dueBefore = (await one<{ d: string }>(`select due_at::text as d from public.tasks where id = $1`, [id])).d;
    await asUser(db, IDS.manager, (q) => q(`select public.decide_due_change($1, false, 'ลูกค้ายืนยันวันเดิม')`, [req]), { commit: true });
    expect((await one<{ d: string }>(`select due_at::text as d from public.tasks where id = $1`, [id])).d).toBe(dueBefore);
    expect((await notes("extension_rejected", id)).rows.map((r) => r.user_id)).toEqual([M2]);
    await run(THU);
    expect((await notes("due_reminder", id)).rows).toHaveLength(6);

    // A new request, approved: the date moves and the audit records it.
    const req2 = await asUser(
      db,
      M2,
      async (q) => (await q<{ id: string }>(`select public.request_due_change($1, now() + interval '30 days', 'ขอเพิ่มเวลา') as id`, [id]))[0].id,
      { commit: true },
    );
    await asUser(db, IDS.manager, (q) => q(`select public.decide_due_change($1, true)`, [req2]), { commit: true });
    const t = await one<{ far: boolean }>(`select due_at > now() + interval '29 days' as far from public.tasks where id = $1`, [id]);
    expect(t.far).toBe(true);
    const audit = await db.query<{ action: string }>(`select action from public.task_audit_logs where task_id = $1 and action like 'extension_%' order by id`, [id]);
    expect(audit.rows.map((r) => r.action)).toEqual(["extension_requested", "extension_rejected", "extension_requested", "extension_approved"]);
    await expectError(asUser(db, IDS.manager, (q) => q(`select public.decide_due_change($1, false)`, [req2])), "request_already_decided");
  });

  it("an extension on an urgent task also notifies the Director", async () => {
    const id = await taskId("แก้ไขสไลด์นำเสนอลูกค้าด่วน");
    await asUser(db, M4, (q) => q(`select public.request_due_change($1, now() + interval '9 days', 'ลูกค้าเปลี่ยนสเปก')`, [id]), { commit: true });
    expect((await notes("extension_requested", id)).rows.map((r) => r.user_id).sort()).toEqual([IDS.director, IDS.manager].sort());
  });

  it("reminders skip Sundays except on the due date and respect a per-task override", async () => {
    const SUN = "2026-11-01T03:00:00Z";
    const sundayDue = await managerTask("T-sunday-due", M1, 4); // due Sun 1 Nov
    const mondayDue = await managerTask("T-monday-due", M1, 5); // due Mon 2 Nov
    const off = await managerTask("T-reminders-off", M1, 2);
    await asUser(db, IDS.manager, (q) => q(`select public.update_task_details($1, p_reminder_days => 0::smallint)`, [off]), { commit: true });
    await db.query(`select public.run_due_reminders($1::timestamptz)`, [SUN]);
    expect((await notes("due_reminder", sundayDue)).rows.length).toBeGreaterThan(0);
    expect((await notes("due_reminder", mondayDue)).rows).toHaveLength(0);
    await db.query(`select public.run_due_reminders($1::timestamptz)`, [WED]);
    expect((await notes("due_reminder", off)).rows).toHaveLength(0);
  });
});

describe("4. leave collision", () => {
  it("notifies the Manager without changing the due date or assignee", async () => {
    const id = await managerTask("T-leave", M1, 6); // due Tue 3 Nov
    const before = await one(`select due_at::text as due, (select array_agg(user_id) from public.task_assignees where task_id = $1)::text as who from public.tasks where id = $1`, [id]);
    await asUser(
      db,
      M1,
      (q) =>
        q(`insert into public.member_absences (org_id, user_id, starts_on, ends_on, reason) values ($1, $2, '2026-11-02', '2026-11-04', 'SECRET-REASON')`, [
          IDS.org,
          M1,
        ]),
      { commit: true },
    );
    const n = (await notes("leave_due_conflict", id)).rows;
    expect(n.map((r) => r.user_id)).toEqual([IDS.manager]);
    expect(JSON.stringify(n)).not.toContain("SECRET-REASON");
    const after = await one(`select due_at::text as due, (select array_agg(user_id) from public.task_assignees where task_id = $1)::text as who from public.tasks where id = $1`, [id]);
    expect(after).toEqual(before);
    // The "waiting for you to come back" label is derived, not stored.
    const leaveToday = await asUser(db, M2, (q) =>
      q<{ a: boolean }>(`select assignee_absent_today as a from public.task_directory() where id = $1`, [id]),
    );
    expect(leaveToday[0].a).toBe(false);
  });

  it("a Manager's own leave on their task's due date goes to the Director", async () => {
    const id = await taskId("จัดทำแผนงบประมาณปี 2027"); // Director → Manager
    const due = (await one<{ d: string }>(`select (due_at at time zone 'Asia/Bangkok')::date::text as d from public.tasks where id = $1`, [id])).d;
    await asUser(
      db,
      IDS.manager,
      (q) => q(`insert into public.member_absences (org_id, user_id, starts_on, ends_on) values ($1, $2, $3, $3)`, [IDS.org, IDS.manager, due]),
      { commit: true },
    );
    expect((await notes("leave_due_conflict", id)).rows.map((r) => r.user_id)).toEqual([IDS.director]);
  });
});

describe("5. confidentiality of the new channels", () => {
  it("comments and mentions on a private task never reach unrelated members", async () => {
    const id = await taskId("ประเมินผลงานพนักงานทดลองงาน"); // private, M5
    await asUser(db, M5, (q) => q(`select public.add_task_comment($1, 'CONFIDENTIAL-COMMENT @everyone', array[$2, $3]::uuid[])`, [id, M1, IDS.manager]), {
      commit: true,
    });
    // M1 cannot open the task, so the mention was dropped and nobody told M1.
    expect((await notes("mentioned", id)).rows.map((r) => r.user_id)).toEqual([IDS.manager]);
    const m1 = await asUser(db, M1, async (q) => ({
      comments: await q(`select * from public.task_comments where task_id = $1`, [id]),
      requests: await q(`select * from public.task_change_requests where task_id = $1`, [id]),
      dir: await q<{ has_pending_extension: boolean | null }>(`select has_pending_extension from public.task_directory() where id = $1`, [id]),
    }));
    expect(m1.comments).toEqual([]);
    expect(m1.requests).toEqual([]);
    expect(m1.dir[0].has_pending_extension).toBeNull();
    await expectError(asUser(db, M1, (q) => q(`select public.add_task_comment($1, 'x')`, [id])), "task_not_found");
  });

  it("suggestions are for leads only", async () => {
    await expectError(asUser(db, M1, (q) => q(`select * from public.suggest_assignees($1)`, [IDS.team])), "not_authorized");
  });

  it("only Admins manage company holidays", async () => {
    await expectError(
      asUser(db, IDS.manager, (q) => q(`insert into public.company_holidays (org_id, holiday_on, name) values ($1, '2026-12-05', 'x')`, [IDS.org])),
      "row-level security",
    );
    await asUser(db, IDS.admin, (q) => q(`insert into public.company_holidays (org_id, holiday_on, name) values ($1, '2026-12-05', 'วันพ่อ')`, [IDS.org]), {
      commit: true,
    });
  });
});

describe("6. scheduled jobs are retry-safe", () => {
  it("running due reminders twice in a day sends nothing new", async () => {
    const FRI = "2026-10-30T03:00:00Z";
    const first = (await one<{ n: number }>(`select public.run_due_reminders($1::timestamptz) as n`, [FRI])).n;
    const second = (await one<{ n: number }>(`select public.run_due_reminders($1::timestamptz) as n`, [FRI])).n;
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0);
  });
});

describe("7. archive stays immutable", () => {
  it("comments, extension requests and detail changes are rejected on archived tasks", async () => {
    const id = await managerTask("T-archive", M3, 5);
    await asUser(db, M3, (q) => q(`select public.submit_task($1, 'done')`, [id]), { commit: true });
    await asUser(db, IDS.manager, (q) => q(`select public.review_task($1, 'approved')`, [id]), { commit: true });
    await expectError(asUser(db, M3, (q) => q(`select public.add_task_comment($1, 'late')`, [id])), "task_archived_immutable");
    await expectError(
      asUser(db, M3, (q) => q(`select public.request_due_change($1, now() + interval '5 days', 'late')`, [id])),
      "task_archived_immutable",
    );
    await expectError(asUser(db, IDS.manager, (q) => q(`select public.update_task_details($1, p_priority => 'high')`, [id])), "task_archived_immutable");
    await expectError(db.query(`insert into public.task_comments (org_id, task_id, author_id, body) values ($1, $2, $3, 'x')`, [IDS.org, id, M3]), "task_archived_immutable");
  });
});

describe("recurrence", () => {
  const next = async (rule: Record<string, unknown>, after: string) =>
    (
      await one<{ d: string | null }>(
        `select private.next_occurrence(jsonb_populate_record(null::public.task_recurrence_rules, $1::jsonb), $2::date)::text as d`,
        [JSON.stringify({ interval_n: 1, weekdays: [], ...rule }), after],
      )
    ).d;

  it("computes timezone-free calendar occurrences, including month ends and leap years", async () => {
    expect(await next({ freq: "daily", interval_n: 3, starts_on: "2026-10-01" }, "2026-10-01")).toBe("2026-10-04");
    expect(await next({ freq: "custom", interval_n: 10, starts_on: "2026-10-01" }, "2026-10-25")).toBe("2026-10-31");
    expect(await next({ freq: "monthly", day_of_month: 31, starts_on: "2026-12-31" }, "2027-01-31")).toBe("2027-02-28");
    expect(await next({ freq: "monthly", day_of_month: 31, starts_on: "2026-12-31" }, "2028-01-31")).toBe("2028-02-29");
    expect(await next({ freq: "monthly", interval_n: 3, day_of_month: 15, starts_on: "2026-01-15" }, "2026-01-15")).toBe("2026-04-15");
    expect(await next({ freq: "yearly", starts_on: "2028-02-29" }, "2028-02-29")).toBe("2029-02-28");
    // Every 2 weeks on Monday and Thursday, starting Wed 2026-10-28.
    expect(await next({ freq: "weekly", interval_n: 2, weekdays: [1, 4], starts_on: "2026-10-28" }, "2026-10-28")).toBe("2026-10-29");
    expect(await next({ freq: "weekly", interval_n: 2, weekdays: [1, 4], starts_on: "2026-10-28" }, "2026-10-29")).toBe("2026-11-09");
  });

  it("creates each occurrence once, with assignees and a Bangkok due time, until the end date", async () => {
    const tpl = await managerTask("T-weekly-report", M1, -1); // template due Tue 27 Oct
    await asUser(
      db,
      IDS.manager,
      (q) => q(`select public.set_task_recurrence($1, 'weekly', 1::smallint, array[2]::smallint[], null, '09:30', '2026-11-20')`, [tpl]),
      { commit: true },
    );
    const run = async (at: string) => (await one<{ n: number }>(`select public.run_recurrences($1::timestamptz) as n`, [at])).n;
    // Real "now" may be before or after the template; force the schedule start for a stable test.
    await db.query(`update public.task_recurrence_rules set starts_on = '2026-10-27', next_run_on = '2026-11-03' where template_task_id = $1`, [tpl]);

    expect(await run("2026-11-02T03:00:00Z")).toBe(0); // before the next Tuesday
    expect(await run("2026-11-03T00:00:00Z")).toBe(1); // 07:00 BKK Tue 3 Nov
    expect(await run("2026-11-03T05:00:00Z")).toBe(0); // retry: no duplicate
    const inst = await db.query<{ due: string; who: string }>(
      `select to_char(t.due_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') as due,
              (select string_agg(user_id::text, ',') from public.task_assignees a where a.task_id = t.id) as who
       from public.tasks t join public.task_recurrence_rules r on r.id = t.recurrence_rule_id
       where r.template_task_id = $1`,
      [tpl],
    );
    expect(inst.rows).toEqual([{ due: "2026-11-03 09:30", who: M1 }]);

    // A run a week later catches up the missed Tuesday (within the 7-day window) once each.
    expect(await run("2026-11-17T03:00:00Z")).toBe(2); // 10 Nov + 17 Nov
    // After the end date (20 Nov) nothing more is created and the rule stops.
    expect(await run("2026-11-25T03:00:00Z")).toBe(0);
    const dates = await db.query<{ d: string }>(
      `select recurrence_on::text as d from public.tasks
       where recurrence_rule_id = (select id from public.task_recurrence_rules where template_task_id = $1) order by 1`,
      [tpl],
    );
    expect(dates.rows.map((r) => r.d)).toEqual(["2026-11-03", "2026-11-10", "2026-11-17"]);
    const rule = await one<{ next: string | null }>(`select next_run_on::text as next from public.task_recurrence_rules where template_task_id = $1`, [tpl]);
    expect(rule.next).toBeNull();
  });
});

describe("rule-based suggestions", () => {
  it("scores candidates with explained components and penalises leave at the due date", async () => {
    const rows = await asUser(db, IDS.manager, (q) =>
      q<{ user_id: string; score: number; on_leave_at_due: boolean; components: Record<string, number>; open_tasks: number }>(
        `select * from public.suggest_assignees($1, 'm', null, (current_date + 8 + time '12:00') at time zone 'Asia/Bangkok')`,
        [IDS.team],
      ),
    );
    expect(rows.length).toBeGreaterThanOrEqual(8); // 7 members + manager
    for (const r of rows) {
      const sum = Object.values(r.components).reduce((a, b) => a + Number(b), 0);
      expect(Math.abs(sum - r.score)).toBeLessThanOrEqual(1);
    }
    // Seed: Pim (M3) is on leave today+7..+8 → no availability points.
    const pim = rows.find((r) => r.user_id === M3)!;
    expect(pim.on_leave_at_due).toBe(true);
    expect(Number(pim.components.availability)).toBe(0);
    // Sorted best first.
    expect([...rows].sort((a, b) => b.score - a.score).map((r) => r.score)).toEqual(rows.map((r) => r.score));
    expect(rows.every((r) => Number.isInteger(r.open_tasks))).toBe(true);
  });
});
