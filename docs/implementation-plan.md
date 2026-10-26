# 3D Virtual Office — Implementation Plan

Source of truth for requirements: `3D_Office_Implementation_Blueprint.md` (Confirmed sections).
Execution prompts and acceptance tests: `3D_Office_Coding_Agent_Prompts.md`.
This document is the engineering plan; progress lives in `docs/implementation-progress.md`, decisions in `docs/decisions.md`.

> Product: a work assignment and tracking system for **real employees**, with a 3D office as a visual layer of the **same database** as the dashboard. It is **not** an AI-agent workforce.

---

## 1. System architecture

```
Browser (Windows Chrome/Edge, iPhone Safari)
 ├─ Next.js 16 App Router (React 19, TypeScript, Tailwind v4)
 │   ├─ Server Components + Server Actions  ── run as the signed-in user (cookie session)
 │   ├─ src/proxy.ts  ── refreshes session, gates non-public routes
 │   ├─ 2D surfaces: dashboard, tasks, meetings inbox, calendar, admin
 │   └─ 3D surface (Milestone B+): React Three Fiber scene reading the SAME query layer
 │
 ├─ Supabase
 │   ├─ PostgreSQL 17  ── source of truth, RLS on every table, SECURITY DEFINER RPCs for mutations
 │   ├─ Auth (GoTrue)  ── email+password, public sign-up disabled, invite-only trigger
 │   ├─ Storage        ── private bucket `task-files`, policies reuse private.can_view_task()
 │   ├─ Realtime       ── (B) private Broadcast channels carrying ids only, clients re-fetch via RLS
 │   └─ Cron           ── (B/C) idempotent reminder + purge jobs with dedupe keys
 │
 └─ Server-only service role (src/lib/supabase/admin.ts): invite acceptance, auth ban on deactivation
```

**Principles**
1. PostgreSQL is the only source of truth. 3D never stores real state.
2. Authorization lives in the database (RLS + RPC checks). UI hiding is cosmetic.
3. Every business mutation is one SQL function (one transaction: row + assignees + audit + notifications).
4. One shared query layer (`src/lib/data/*`) feeds dashboard, task pages and the 3D scene.
5. Timestamps are `timestamptz` (UTC). Business logic uses `Asia/Bangkok`, Monday–Saturday 08:00–17:00.

## 2. Database schema (Milestone A, `supabase/migrations/20261023000001_foundation.sql`)

| Area | Tables | Notes |
|---|---|---|
| Identity / org | `organizations`, `teams`, `profiles`, `team_members` (`is_lead`), `skills`, `member_skills`, `invites`, `admin_audit_logs` | Composite FKs `(x_id, org_id)` make cross-org links impossible. Multiple teams/managers supported from day one. |
| Work | `projects`, `task_categories`, `tasks`, `task_assignees` (`is_primary`), `task_audit_logs` | Multi-assignee + multiple primary co-owners; subtasks via `parent_task_id`; 8-state enum; `is_private`, `is_urgent`; archive guard trigger. |
| Meetings | `meetings`, `meeting_attendees` (`is_proxy`), `meeting_action_items` (status independent of tasks) | Unassigned inbox = items with `status = 'unassigned'`. |
| Notifications | `notifications` (`kind`, `payload`, `dedupe_key` unique per user) | Rendered in TH/EN client-side; dedupe key makes reminder jobs idempotent. |
| Absences | `member_absences` (`full_day` / `am` / `pm`, `reason`) | Reason only for self/leaders; everyone else uses `absence_calendar()`. |
| Social profile | `avatar_appearance`, `pets` | Filled by seed; editor UI in Milestone D. |

Added in Milestone B: `task_submissions`, `task_reviews`, `task_attachments`, `job_runs`.

Planned later (not yet created): `task_checklist_items`, `task_tags`, `task_comments`, attachment versions, `task_change_requests`, `task_recurrence_rules`, `company_holidays`, `notification_preferences`, `reminder_runs`, `job_runs`, `presence`/`office_positions`, `chat_messages`, `chat_media`, `reaction_events`, `settings`, `export_jobs`, `integration_connections` (placeholder only).

### Enums
- `task_status`: `not_started, in_progress, blocked, in_review, revision_required, completed, paused, cancelled` (exactly 8)
- Derived labels are **computed**, not states: `is_new_today` (in `task_directory`), "pending extension" (C), "waiting for return 😏" (C, absence-based).
- `task_priority`: `low, medium, high` · `task_size`: `xs…xl` · `app_role`: `director, manager, member, admin`.

### Authorization helpers (`private` schema, not exposed by the API)
`my_org_id()`, `my_role()`, `is_admin()`, `is_org_leader()` (Director/Admin), `leads_team(team)`, `is_team_member(team)`, `leads_user(user)`, `can_view_task(task)`, `can_view_meeting(meeting)`. All return "no access" for deactivated users.

### RPC surface (public, `authenticated` only)
`task_directory`, `absence_calendar`, `create_task`, `mark_notifications_read`, `admin_create_invite`, `admin_revoke_invite`, `admin_set_user_active`, `admin_set_user_role`, `admin_set_team_membership`.

## 3. Permission matrix

| Capability | Director | Manager | Member | Admin |
|---|---|---|---|---|
| See non-private team tasks | all teams | own teams | own teams | all teams |
| See private task **detail** | ✅ | ✅ (teams they lead) | only if creator/assignee | ✅ |
| See private task **title** | ✅ | ✅ | ✅ (own team) | ✅ |
| Create task for self | ✅ | ✅ | ✅ (leads notified) | ✅ |
| Assign to others | Managers; Members **only as urgent** (Manager notified) | Members of teams they lead | ❌ | ✅ |
| Mark urgent | ✅ | ✅ | ❌ | ✅ |
| Review member work (B) | — | ✅ | ❌ | — |
| Review manager work (B) | ✅ | ❌ | ❌ | — |
| Absence reason of others | ✅ | ✅ (their team) | ❌ | ✅ |
| Invite / deactivate / change role | ❌ | ❌ | ❌ | ✅ |
| Read invites / admin audit | ❌ | ❌ | ❌ | ✅ |
| Direct table INSERT/UPDATE/DELETE on tasks | ❌ (RPC only) | ❌ | ❌ | ❌ |
| Edit own profile (name, nickname, locale, theme, motion) | ✅ | ✅ | ✅ | ✅ |
| Change own role / active flag | ❌ | ❌ | ❌ | ❌ (not even self) |

Enforced by: RLS policies + column-level grants + checks inside SECURITY DEFINER RPCs. Verified by `tests/db/rls.test.ts` and `tests/live/api.test.ts`.

## 4. UX flows

**Onboarding (invite-only):** Admin → "Invite" (name, email, role, team) → one-time link shown once → invitee opens `/invite/{token}` → sets nickname + own password → signed in → dashboard. *(Avatar → Pet → Skills steps arrive with Milestones C/D; profile fields already exist.)*

**Password reset:** `/forgot-password` → same response for any email → recovery email (token_hash template) → `/auth/confirm` → `/reset-password`. Admin can trigger the same email; the Admin never sees a token or password.

**Deactivation:** Admin → Deactivate → `profiles.is_active = false` (RLS denies everything immediately) + Auth ban (no new sign-in). Tasks/history retained; Reactivate reverses both.

**Core loop (Milestone B demo):** Meeting (end time, notes, attendees, action items) → Unassigned Inbox (count + age since meeting end) → Manager/Director assigns item → Task in member workspace + notifications → Member submits → Manager approves / requests revision (Manager-owned → Director) → Archive (immutable) → same state shown on the 3D avatar popover.

### Wireframes (text, for screens built in later milestones)

```
Dashboard (Manager)                         3D Office (B/D)
┌───────────────────────────────────┐       ┌───────────────────────────────────┐
│ Hello, Mana · Manager             │       │ [Director room]   [Meeting room]  │
│ [Team open 12][In review 3]       │       │  ┌─┐┌─┐┌─┐┌─┐  [Unassigned board 2]│
│ [Due ≤7d 4][Unassigned items 2 ⚠] │       │  └─┘└─┘└─┘└─┘  [Lounge/game]      │
│ Unassigned inbox ▸ (meeting, age) │       │  ┌─┐┌─┐┌─┐     [Home: on leave]   │
│ My tasks list                     │       │ click avatar → popover (authorized│
└───────────────────────────────────┘       │ workload / next due / calendar)   │
                                            └───────────────────────────────────┘
Meeting Inbox (B)                           Task detail (A→C)
┌───────────────────────────────────┐       ┌───────────────────────────────────┐
│ ประชุมวางแผนแคมเปญ · ended 25h ago │       │ 🔒 Private · Urgent · In review    │
│ ☐ วางแผนคอนเทนต์  [Suggest ▾][Assign]│     │ Title / description               │
│ ☐ สรุปงบโฆษณา      [Suggest ▾][Assign]│     │ Owners · priority · size · due    │
│ Suggest = rule-based with reasons │       │ Submit / Approve / Request change │
└───────────────────────────────────┘       │ History (audit)                   │
                                            └───────────────────────────────────┘
Calendar (C): Today | Week | Month | Mine | Team, filters by person/category; absences show dates only.
Avatar editor (D): live 3D preview + part pickers (skin, face, eyes, nose, mouth, hair+color, top, bottom, shoes, glasses, accessory) + Pet tab.
```

### 3D state mapping (Milestone B/D)
| Data | 3D representation |
|---|---|
| Absence today (`absence_calendar`) | Avatar at "home" area |
| Attending a meeting now (`meetings` time window + attendee) | Avatar in meeting room |
| Open tasks / estimated hours | Desk monitor glow + workload badge (counts only for redacted tasks) |
| `is_urgent` open task | Red marker above desk |
| `in_review` items for a lead | Inbox tray on Manager/Director desk |
| Unassigned action items | Count on the board |
| Private task the viewer cannot open | Never rendered beyond what `task_directory` returns (title only) |

## 5. Milestones and acceptance criteria

All features below are **V1 scope**. Milestones are implementation order, not scope cuts.

### Milestone A — Foundations ✅ (verified, see progress log)
Deliverables: Next.js + Supabase setup; schema + RLS; invite-only onboarding; password reset; deactivation with retention; synthetic seed (Admin, Director, Manager, 7 Members, private + urgent tasks, meeting with 3 unassigned items, leave); role-aware TH/EN shell with loading/empty/error states; tests.
Acceptance:
- A1 Every role can log in and only sees what it should (live test + browser check).
- A2 Private task detail does not leak via REST, RPC, search filter, Storage (download/list/sign/upload), Realtime or notifications.
- A3 Migrations + seed apply reproducibly (`supabase db reset`, PGlite harness).
- A4 No secret/service key in the client bundle (`npm run check:bundle`).
- A5 Invite-only: no account without a valid, unexpired, unrevoked, single-use token for the same email.
- A6 Non-admins cannot run admin actions; users cannot change role/active flags.
- A7 Deactivated users lose access immediately; their tasks/history remain.

### Milestone B — End-to-end vertical slice + basic 3D ✅ (verified locally, see progress log)
Deliverables: meeting CRUD with action items; Unassigned Inbox (count, age from `ends_at`); assign item → task (RPC, atomic); member update/submit with comment + attachment; review: approve/request revision; Manager-owned → Director review; archive immutable; per-role inbox; Realtime (ids-only broadcast + refetch); basic R3F office (Director zone, Manager zone, 7 desks, clickable avatars) using the shared query layer; orbit/pan/zoom on mouse+touch; 2D fallback when WebGL is unavailable; reminder job for unassigned items with `dedupe_key = meeting:{id}:cycle:{n}`.
Acceptance (automated): A. meeting ended 24h ago, 3 items, 1 assigned → 2 remain + exactly one pending reminder per cycle (retry-safe); B. submit → review → archive atomically with audit + file; C. Manager task → Director review; D. private task via avatar popover leaks nothing; E. 2D status change updates 3D.

### Milestone C — Operations ✅ verified locally (see progress log for remaining limits)
8-state transition guards; co-owners/subtasks/projects/categories/tags/checklists; urgent path audit + Director notified on urgent changes; change/extension requests with reminder pause; comments/@mentions; file versions (latest for users, older Admin only); recurrence (daily/weekly/monthly/yearly/custom, timezone-safe); absences UI + conflict notice to Manager (never auto-reassign); calendar views; 7-day due reminders (once/day, idempotent); rule-based assignment suggestions with explained weights (not AI); Admin config (teams, categories, tags, policies); private-aware search.
Acceptance: 7 tests listed in Prompt C (states, urgent, extension pause, leave collision, confidentiality across channels, cron retry dedupe, archive immutability).

### Milestone D — Full 3D, avatar, pets, social chat ✅ verified locally (device + visual caveats in progress log)
Rooms (Director, Manager, 7 dual-monitor desks, meeting room, lounge/game, unassigned board, home); location by state; avatar editor (all parts) + pets (dog/cat, breed/color/outfit/name, sound + mute, @mention reaction); single-room chat (named/anonymous; real sender id Admin-only; text/emoji/stickers/GIF/images/reactions; floating 3D emotions); 24h expiry (read path hides at `expires_at`, scheduled purge of rows + media, backup caveat disclosed); performance: instancing, shared materials, lazy-load, reduced motion, mobile settings. Placeholder procedural meshes clearly labeled until GLB assets exist.
Acceptance: onboarding/customization/status/chat on Windows + iPhone (or recorded device caveat); anonymous identity visible to Admin only; expired content unreadable + media purged; no private task data in 3D payloads.

### Milestone E — Reports & production readiness ✅ verified locally; release blocked on items in `docs/release-readiness.md`
Role home views, charts (status/category/person/timeliness/estimated hours), Admin-only ranking, exports CSV/Excel/PDF with confidentiality, full TH/EN, performance budget, error boundaries, security test pass, job observability, backup/restore drill, runbook, staging deployment guide, pilot playbook, future-only contracts for M365/Outlook and AI meeting extraction (not integrated).
Acceptance: Prompt E completion gates.

## 6. Dependencies & risks

| Risk | Mitigation |
|---|---|
| Private-task leak through a new channel (3D metadata, exports, realtime) | All reads go through `can_view_task` / `task_directory`; every new channel gets a leak test in `tests/live`. |
| Reminder spam on retries | Unique `(user_id, dedupe_key)`; jobs insert with `on conflict do nothing`. |
| Chat 24h deletion vs backups | Hide at read time immediately; purge job deletes rows + objects; docs disclose backup retention window. |
| 3D performance on iPhone | Low-poly, instancing, DPR cap, on-demand rendering, reduced-motion mode, 2D fallback. |
| No MFA (per current requirement) | Recorded risk; recommend optional MFA before production. |
| GoTrue internals (metadata ordering) | Invite verification uses the token in user metadata + DB hashing (tested live). |
