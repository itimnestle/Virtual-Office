import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { IDS, asUser, createTestDb, expectError } from "./harness";

const [M1, M2, M3, M4, M5, M6, M7] = IDS.members;
const PRIVATE_EVAL = "ประเมินผลงานพนักงานทดลองงาน"; // Manager → M5, private
const PRIVATE_SELF = "เตรียมเอกสารขอทุนศึกษาต่อ"; // M7 self-created, private

let db: PGlite;

async function taskId(title: string): Promise<string> {
  const r = await db.query<{ id: string }>(`select id from public.tasks where title = $1`, [title]);
  return r.rows[0].id;
}

/**
 * Inserts an auth user the way GoTrue does: user metadata at insert time,
 * app metadata only afterwards. The invite triggers decide the profile.
 */
async function insertAuthUser(
  id: string,
  email: string,
  userMeta: Record<string, unknown>,
  appMeta: Record<string, unknown> = {},
) {
  await db.query(
    `insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values ($1, $2, $3, $4)`,
    [id, email, JSON.stringify(appMeta), JSON.stringify(userMeta)],
  );
}

/** Creates an invite and returns its id and plaintext token (only the hash is stored). */
async function createInvite(
  email: string,
  role: string,
  opts: { team?: string | null; expires?: string; org?: string; invitedBy?: string | null } = {},
) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const r = await db.query<{ id: string }>(
    `insert into public.invites (org_id, email, full_name, role, team_id, token_hash, invited_by, expires_at)
     values ($1, $2, 'Test Person', $3, $4, encode(sha256(convert_to($7, 'UTF8')), 'hex'), $5, $6)
     returning id`,
    [
      opts.org ?? IDS.org,
      email,
      role,
      opts.team === undefined ? IDS.team : opts.team,
      opts.invitedBy === undefined ? IDS.admin : opts.invitedBy,
      opts.expires ?? "2999-01-01",
      token,
    ],
  );
  return { id: r.rows[0].id, token };
}

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

describe("migrations + seed", () => {
  it("creates the synthetic organization with 1 admin, 1 director, 1 manager, 7 members", async () => {
    const r = await db.query<{ role: string; n: number }>(
      `select role::text, count(*)::int as n from public.profiles group by role order by role`,
    );
    expect(Object.fromEntries(r.rows.map((x) => [x.role, x.n]))).toEqual({
      admin: 1,
      director: 1,
      manager: 1,
      member: 7,
    });
  });

  it("seeds private and urgent tasks through the real RPC (with audit + notifications)", async () => {
    const r = await db.query<{ priv: number; urgent: number; audits: number }>(`
      select (select count(*) from public.tasks where is_private)::int as priv,
             (select count(*) from public.tasks where is_urgent)::int as urgent,
             (select count(*) from public.task_audit_logs where action = 'created')::int as audits`);
    expect(r.rows[0].priv).toBe(2);
    expect(r.rows[0].urgent).toBe(1);
    expect(r.rows[0].audits).toBe(7);
  });

  it("enables RLS on every public table", async () => {
    const r = await db.query<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(r.rows).toEqual([]);
  });
});

describe("function privileges", () => {
  it("anon can execute no public function, and scheduled jobs are not callable by users", async () => {
    const anon = await db.query<{ f: string }>(`
      select p.oid::regprocedure::text as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')`);
    expect(anon.rows).toEqual([]);
    const jobs = await db.query<{ f: string }>(`
      select p.proname as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'run\\_%' and has_function_privilege('authenticated', p.oid, 'EXECUTE')`);
    expect(jobs.rows).toEqual([]);
  });
});

describe("anonymous access", () => {
  it("anon cannot read tables or call RPCs", async () => {
    await expectError(asUser(db, null, (q) => q(`select * from public.tasks`), { role: "anon" }), "permission denied");
    await expectError(asUser(db, null, (q) => q(`select * from public.profiles`), { role: "anon" }), "permission denied");
    await expectError(
      asUser(db, null, (q) => q(`select * from public.task_directory()`), { role: "anon" }),
      "permission denied",
    );
  });
});

describe("private task confidentiality", () => {
  it("unrelated member cannot read the private task row, assignees, or audit log", async () => {
    const id = await taskId(PRIVATE_EVAL);
    const out = await asUser(db, M1, async (q) => ({
      task: await q(`select * from public.tasks where id = $1`, [id]),
      assignees: await q(`select * from public.task_assignees where task_id = $1`, [id]),
      audit: await q(`select * from public.task_audit_logs where task_id = $1`, [id]),
      search: await q(`select id from public.tasks where description ilike '%CONFIDENTIAL%'`),
    }));
    expect(out.task).toEqual([]);
    expect(out.assignees).toEqual([]);
    expect(out.audit).toEqual([]);
    expect(out.search).toEqual([]);
  });

  it("task_directory gives an unrelated member ONLY the title of a private task", async () => {
    const rows = await asUser(db, M1, (q) => q(`select * from public.task_directory()`));
    const redacted = rows.filter((r) => r.redacted);
    expect(redacted.map((r) => r.title).sort()).toEqual([PRIVATE_EVAL, PRIVATE_SELF].sort());
    for (const r of redacted) {
      const exposed = Object.entries(r).filter(([k, v]) => v !== null && !["id", "team_id", "title", "is_private", "redacted"].includes(k));
      expect(exposed).toEqual([]);
    }
    // No column of the directory ever carries the description.
    expect(JSON.stringify(rows)).not.toContain("CONFIDENTIAL");
  });

  it("creator, assignee, Manager, Director and Admin can read private task details", async () => {
    const evalId = await taskId(PRIVATE_EVAL);
    const selfId = await taskId(PRIVATE_SELF);
    for (const [user, id] of [
      [IDS.manager, evalId], // creator + team lead
      [M5, evalId], // assignee
      [IDS.director, evalId],
      [IDS.admin, evalId],
      [M7, selfId], // self-created
      [IDS.manager, selfId],
      [IDS.director, selfId],
    ] as const) {
      const rows = await asUser(db, user, (q) => q<{ description: string }>(`select description from public.tasks where id = $1`, [id]));
      expect(rows, `user ${user}`).toHaveLength(1);
      expect(rows[0].description).toContain("CONFIDENTIAL-SEED");
    }
  });

  it("a co-worker of the assignee still cannot open another member's private task", async () => {
    const selfId = await taskId(PRIVATE_SELF);
    const rows = await asUser(db, M5, (q) => q(`select id from public.tasks where id = $1`, [selfId]));
    expect(rows).toEqual([]);
  });

  it("unrelated members get no notifications about private tasks", async () => {
    const rows = await asUser(db, M1, (q) => q<{ payload: unknown }>(`select payload from public.notifications`));
    expect(JSON.stringify(rows)).not.toContain(PRIVATE_EVAL);
  });

  it("non-private team tasks are visible to every team member", async () => {
    const rows = await asUser(db, M1, (q) => q<{ title: string }>(`select title from public.tasks where not is_private`));
    expect(rows).toHaveLength(5);
  });
});

describe("cross-team and cross-org isolation", () => {
  const ORG2 = "00000000-0000-4000-8000-0000000000aa";
  const TEAM_B = "10000000-0000-4000-8000-0000000000bb";
  const OUTSIDER = "20000000-0000-4000-8000-0000000000cc"; // other org
  const TEAM_B_MEMBER = "20000000-0000-4000-8000-0000000000dd"; // same org, other team

  beforeAll(async () => {
    await db.exec(`
      insert into public.organizations (id, name) values ('${ORG2}', 'Other Org');
      insert into public.teams (id, org_id, name) values ('${TEAM_B}', '${IDS.org}', 'Team B');
      insert into public.teams (org_id, name) values ('${ORG2}', 'Other Team');
    `);
    const inviteB = await createInvite("teamb@example.com", "member", { team: TEAM_B });
    await insertAuthUser(TEAM_B_MEMBER, "teamb@example.com", { invite_token: inviteB.token });
    const outsider = await createInvite("outsider@example.com", "director", { org: ORG2, team: null, invitedBy: null });
    await insertAuthUser(OUTSIDER, "outsider@example.com", { invite_token: outsider.token });
  });

  it("member of another team sees no tasks (not even private titles) from Team A", async () => {
    const out = await asUser(db, TEAM_B_MEMBER, async (q) => ({
      tasks: await q(`select id from public.tasks`),
      dir: await q(`select id from public.task_directory()`),
    }));
    expect(out.tasks).toEqual([]);
    expect(out.dir).toEqual([]);
  });

  it("a Director of another organization sees nothing from this organization", async () => {
    const out = await asUser(db, OUTSIDER, async (q) => ({
      tasks: await q(`select id from public.tasks`),
      profiles: await q<{ org_id: string }>(`select org_id from public.profiles`),
      dir: await q(`select id from public.task_directory()`),
      meetings: await q(`select id from public.meetings`),
    }));
    expect(out.tasks).toEqual([]);
    expect(out.dir).toEqual([]);
    expect(out.meetings).toEqual([]);
    expect(out.profiles.every((p) => p.org_id === ORG2)).toBe(true);
  });

  it("a Manager cannot create work in a team they do not belong to", async () => {
    await expectError(
      asUser(db, IDS.manager, (q) => q(`select public.create_task(p_team_id => $1, p_title => 'x')`, [TEAM_B])),
      "not_team_member",
    );
  });
});

describe("invite-only onboarding", () => {
  it("rejects an auth user without an invite token", async () => {
    await expectError(insertAuthUser(crypto.randomUUID(), "random@example.com", {}), "invite_required");
  });

  it("ignores a forged invite_id in app metadata (only the token counts)", async () => {
    const inv = await createInvite("forged@example.com", "admin");
    await expectError(insertAuthUser(crypto.randomUUID(), "forged@example.com", {}, { invite_id: inv.id }), "invite_required");
  });

  it("rejects a wrong token, and revoked, expired, reused and mismatched invites", async () => {
    await createInvite("guess@example.com", "member");
    await expectError(
      insertAuthUser(crypto.randomUUID(), "guess@example.com", { invite_token: "not-the-token" }),
      "invalid_invite",
    );

    const revoked = await createInvite("revoked@example.com", "member");
    await db.query(`update public.invites set revoked_at = now() where id = $1`, [revoked.id]);
    await expectError(
      insertAuthUser(crypto.randomUUID(), "revoked@example.com", { invite_token: revoked.token }),
      "invalid_invite",
    );

    const expired = await createInvite("expired@example.com", "member", { expires: "2000-01-01" });
    await expectError(
      insertAuthUser(crypto.randomUUID(), "expired@example.com", { invite_token: expired.token }),
      "invalid_invite",
    );

    const mismatch = await createInvite("right@example.com", "member");
    await expectError(
      insertAuthUser(crypto.randomUUID(), "wrong@example.com", { invite_token: mismatch.token }),
      "invite_email_mismatch",
    );

    const once = await createInvite("once@example.com", "member");
    await insertAuthUser(crypto.randomUUID(), "once@example.com", { invite_token: once.token });
    await expectError(
      insertAuthUser(crypto.randomUUID(), "once@example.com", { invite_token: once.token }),
      "invalid_invite",
    );
  });

  it("a valid invite creates the profile with the invited role and team, and the token is not stored", async () => {
    const id = crypto.randomUUID();
    const teamC = (
      await db.query<{ id: string }>(`insert into public.teams (org_id, name) values ($1, 'Team C') returning id`, [IDS.org])
    ).rows[0].id;
    const invite = await createInvite("newmanager@example.com", "manager", { team: teamC });
    await insertAuthUser(id, "newmanager@example.com", { invite_token: invite.token });
    const p = await db.query<{ role: string; is_lead: boolean; accepted: boolean }>(
      `select pr.role::text, tm.is_lead, i.accepted_at is not null as accepted
       from public.profiles pr
       join public.team_members tm on tm.user_id = pr.id
       join public.invites i on i.accepted_user_id = pr.id
       where pr.id = $1`,
      [id],
    );
    expect(p.rows[0]).toEqual({ role: "manager", is_lead: true, accepted: true });

    const meta = await db.query<{ m: string }>(`select raw_user_meta_data::text as m from auth.users where id = $1`, [id]);
    expect(meta.rows[0].m).not.toContain(invite.token);
    // A later metadata write cannot put the token back either.
    await db.query(`update auth.users set raw_user_meta_data = raw_user_meta_data || $2::jsonb where id = $1`, [
      id,
      JSON.stringify({ invite_token: invite.token }),
    ]);
    const after = await db.query<{ m: string }>(`select raw_user_meta_data::text as m from auth.users where id = $1`, [id]);
    expect(after.rows[0].m).not.toContain("invite_token");
  });

  it("the role comes from the invite, never from caller-supplied metadata", async () => {
    const invite = await createInvite("sneaky@example.com", "member");
    const id = crypto.randomUUID();
    await insertAuthUser(id, "sneaky@example.com", { invite_token: invite.token, role: "admin" }, { role: "admin" });
    const r = await db.query<{ role: string }>(`select role::text from public.profiles where id = $1`, [id]);
    expect(r.rows[0].role).toBe("member");
  });

  it("invites cannot be written through the API (Admins use the RPC)", async () => {
    await expectError(
      asUser(db, IDS.admin, (q) =>
        q(
          `insert into public.invites (org_id, email, full_name, role, token_hash, expires_at)
           values ($1, 'x@example.com', 'X', 'admin', repeat('d', 64), now() + interval '1 day')`,
          [IDS.org],
        ),
      ),
      "permission denied",
    );
  });
});

describe("admin-only actions", () => {
  it("non-admins cannot run admin RPCs", async () => {
    for (const user of [M1, IDS.manager, IDS.director]) {
      await expectError(
        asUser(db, user, (q) => q(`select public.admin_set_user_active($1, false)`, [M2])),
        "admin_only",
      );
      await expectError(
        asUser(db, user, (q) => q(`select public.admin_set_user_role($1, 'admin')`, [M2])),
        "admin_only",
      );
      await expectError(
        asUser(db, user, (q) =>
          q(`select public.admin_create_invite('x@example.com', 'X', 'member', null, repeat('b', 64))`),
        ),
        "admin_only",
      );
    }
  });

  it("non-admins cannot read invites or admin audit logs", async () => {
    const out = await asUser(db, IDS.director, async (q) => ({
      invites: await q(`select * from public.invites`),
      audit: await q(`select * from public.admin_audit_logs`),
    }));
    expect(out.invites).toEqual([]);
    expect(out.audit).toEqual([]);
  });

  it("users cannot change their own role or activation by writing the table", async () => {
    await expectError(
      asUser(db, M1, (q) => q(`update public.profiles set role = 'admin' where id = $1`, [M1])),
      "permission denied",
    );
    await expectError(
      asUser(db, M1, (q) => q(`update public.profiles set is_active = false where id = $1`, [M2])),
      "permission denied",
    );
  });

  it("direct table writes to tasks are denied (mutations go through RPCs)", async () => {
    await expectError(
      asUser(db, IDS.director, (q) =>
        q(`insert into public.tasks (org_id, team_id, title, created_by) values ($1, $2, 'x', $3)`, [IDS.org, IDS.team, IDS.director]),
      ),
      "permission denied",
    );
    await expectError(
      asUser(db, IDS.manager, (q) => q(`update public.tasks set title = 'hacked'`)),
      "permission denied",
    );
    await expectError(asUser(db, IDS.admin, (q) => q(`delete from public.tasks`)), "permission denied");
  });

  it("admin can create an invite with only a token hash", async () => {
    const id = await asUser(db, IDS.admin, async (q) => {
      const r = await q<{ id: string }>(
        `select public.admin_create_invite('invitee@example.com', 'Invitee', 'member', $1, $2) as id`,
        [IDS.team, "c".repeat(64)],
      );
      return r[0].id;
    });
    expect(id).toMatch(/[0-9a-f-]{36}/);
  });

  it("profile self-service edits are limited to own row and allowed columns", async () => {
    const out = await asUser(db, M1, async (q) => ({
      own: await q(`update public.profiles set nickname = 'มะลิใหม่' where id = $1 returning id`, [M1]),
      other: await q(`update public.profiles set nickname = 'x' where id = $1 returning id`, [M2]),
    }));
    expect(out.own).toHaveLength(1);
    expect(out.other).toEqual([]);
  });
});

describe("deactivated accounts", () => {
  it("lose all access while their tasks and history are retained", async () => {
    await asUser(db, IDS.admin, (q) => q(`select public.admin_set_user_active($1, false)`, [M2]), { commit: true });

    const out = await asUser(db, M2, async (q) => ({
      tasks: await q(`select id from public.tasks`),
      dir: await q(`select id from public.task_directory()`),
      profiles: await q(`select id from public.profiles`),
    }));
    expect(out.tasks).toEqual([]);
    expect(out.dir).toEqual([]);
    expect(out.profiles).toEqual([]);
    await expectError(
      asUser(db, M2, (q) => q(`select public.create_task(p_team_id => $1, p_title => 'x')`, [IDS.team])),
      "not_authorized",
    );

    const kept = await asUser(db, IDS.manager, (q) =>
      q(`select t.title from public.tasks t join public.task_assignees a on a.task_id = t.id where a.user_id = $1`, [M2]),
    );
    expect(kept.length).toBeGreaterThan(0);

    // A deactivated person can no longer be given new work.
    await expectError(
      asUser(db, IDS.manager, (q) =>
        q(`select public.create_task(p_team_id => $1, p_title => 'x', p_assignee_ids => array[$2]::uuid[])`, [IDS.team, M2]),
      ),
      "assignee_not_in_team",
    );

    await asUser(db, IDS.admin, (q) => q(`select public.admin_set_user_active($1, true)`, [M2]), { commit: true });
    const back = await asUser(db, M2, (q) => q(`select id from public.tasks`));
    expect(back.length).toBeGreaterThan(0);
  });

  it("admin cannot deactivate themselves", async () => {
    await expectError(
      asUser(db, IDS.admin, (q) => q(`select public.admin_set_user_active($1, false)`, [IDS.admin])),
      "cannot_deactivate_self",
    );
  });
});

describe("create_task business rules", () => {
  const create = (user: string, args: string, params: unknown[] = []) =>
    asUser(db, user, (q) => q<{ id: string }>(`select public.create_task(p_team_id => $1, ${args}) as id`, [IDS.team, ...params]));

  it("member can only create work for themselves and cannot mark it urgent", async () => {
    await expectError(
      create(M1, `p_title => 'x', p_assignee_ids => array[$2]::uuid[]`, [M2]),
      "member_can_only_self_assign",
    );
    await expectError(create(M1, `p_title => 'x', p_is_urgent => true`), "member_cannot_mark_urgent");
  });

  it("member-created task notifies both Manager and Director", async () => {
    const kinds = await asUser(db, M3, async (q) => {
      const [{ id }] = await q<{ id: string }>(`select public.create_task(p_team_id => $1, p_title => 'งานของพิม') as id`, [IDS.team]);
      await q(`reset role`);
      return q<{ user_id: string; kind: string }>(`select user_id, kind from public.notifications where task_id = $1`, [id]);
    });
    expect(kinds.map((k) => k.user_id).sort()).toEqual([IDS.director, IDS.manager].sort());
    expect(new Set(kinds.map((k) => k.kind))).toEqual(new Set(["member_created_task"]));
  });

  it("Director must use the urgent path to assign a Member directly; Manager is notified", async () => {
    await expectError(
      create(IDS.director, `p_title => 'x', p_assignee_ids => array[$2]::uuid[]`, [M4]),
      "director_direct_assignment_requires_urgent",
    );
    const notes = await asUser(db, IDS.director, async (q) => {
      const [{ id }] = await q<{ id: string }>(
        `select public.create_task(p_team_id => $1, p_title => 'ด่วน', p_assignee_ids => array[$2]::uuid[], p_is_urgent => true) as id`,
        [IDS.team, M4],
      );
      await q(`reset role`);
      return q<{ user_id: string; kind: string }>(`select user_id, kind from public.notifications where task_id = $1 order by kind`, [id]);
    });
    expect(notes).toEqual([
      { user_id: IDS.manager, kind: "urgent_direct_assignment_notice" },
      { user_id: M4, kind: "urgent_task_assigned" },
    ]);
  });

  it("supports multiple primary co-owners", async () => {
    const rows = await asUser(db, IDS.manager, async (q) => {
      const [{ id }] = await q<{ id: string }>(
        `select public.create_task(p_team_id => $1, p_title => 'co-own', p_assignee_ids => array[$2, $3, $4]::uuid[], p_primary_ids => array[$2, $3]::uuid[]) as id`,
        [IDS.team, M1, M2, M6],
      );
      return q<{ user_id: string; is_primary: boolean }>(`select user_id, is_primary from public.task_assignees where task_id = $1 order by user_id`, [id]);
    });
    expect(rows).toEqual([
      { user_id: M1, is_primary: true },
      { user_id: M2, is_primary: true },
      { user_id: M6, is_primary: false },
    ]);
  });

  it("rejects assignees outside the team", async () => {
    await expectError(
      create(IDS.manager, `p_title => 'x', p_assignee_ids => array[$2]::uuid[]`, [IDS.admin]),
      "assignee_not_in_team",
    );
  });
});

describe("absence privacy", () => {
  it("others see the absence dates but never the reason", async () => {
    const out = await asUser(db, M1, async (q) => ({
      rows: await q(`select * from public.member_absences where user_id = $1`, [M3]),
      cal: await q(`select * from public.absence_calendar(current_date, current_date + 30)`),
    }));
    expect(out.rows).toEqual([]);
    expect(out.cal).toHaveLength(1);
    expect(Object.keys(out.cal[0])).not.toContain("reason");
    expect(JSON.stringify(out.cal)).not.toContain("CONFIDENTIAL");
  });

  it("the member, Manager, Director and Admin can see the reason", async () => {
    for (const user of [M3, IDS.manager, IDS.director, IDS.admin]) {
      const rows = await asUser(db, user, (q) => q<{ reason: string }>(`select reason from public.member_absences where user_id = $1`, [M3]));
      expect(rows[0]?.reason, `user ${user}`).toContain("CONFIDENTIAL-SEED");
    }
  });

  it("members can record their own leave but not someone else's", async () => {
    await asUser(db, M1, (q) =>
      q(`insert into public.member_absences (org_id, user_id, starts_on, ends_on, part) values ($1, $2, current_date, current_date, 'am')`, [IDS.org, M1]),
    );
    await expectError(
      asUser(db, M1, (q) =>
        q(`insert into public.member_absences (org_id, user_id, starts_on, ends_on) values ($1, $2, current_date, current_date)`, [IDS.org, M2]),
      ),
      "row-level security",
    );
  });
});

describe("archive immutability and append-only audit", () => {
  it("archived tasks cannot be modified, even by the database owner", async () => {
    const id = await taskId("ปรับปรุงคู่มือการใช้งานภายใน");
    await db.query(
      `update public.tasks set status = 'completed', completed_at = now(), archived_at = now(), archived_by = $2 where id = $1`,
      [id, IDS.manager],
    );
    await expectError(db.query(`update public.tasks set title = 'x' where id = $1`, [id]), "task_archived_immutable");
    await expectError(db.query(`delete from public.tasks where id = $1`, [id]), "task_archived_immutable");
    await expectError(
      db.query(`insert into public.task_assignees (task_id, org_id, user_id) values ($1, $2, $3)`, [id, IDS.org, M1]),
      "task_archived_immutable",
    );
  });

  it("audit logs are append-only", async () => {
    await expectError(db.query(`update public.task_audit_logs set action = 'x'`), "append_only_table");
    await expectError(db.query(`delete from public.task_audit_logs`), "append_only_table");
  });
});

describe("notifications", () => {
  it("users only see and mark their own notifications", async () => {
    const out = await asUser(db, IDS.manager, async (q) => ({
      mine: await q<{ user_id: string }>(`select user_id from public.notifications`),
      marked: await q<{ n: number }>(`select public.mark_notifications_read() as n`),
    }));
    expect(out.mine.length).toBeGreaterThan(0);
    expect(out.mine.every((n) => n.user_id === IDS.manager)).toBe(true);
    expect(out.marked[0].n).toBe(out.mine.length);
  });
});
