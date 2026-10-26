# Technical Decisions & Assumptions

Format: **ID — Decision.** Context / reason. Status.

## Stack

**D-001 — Next.js 16 (App Router) + React 19 + TypeScript 5.9 + Tailwind v4.** Repo was empty; this matches the Blueprint's proposed stack. TypeScript pinned to 5.x because npm's latest (7.x native) is not yet a supported Next.js type-checker. Accepted.

**D-002 — Supabase (Postgres 17, Auth, Storage, Realtime) via `@supabase/ssr`.** Matches Blueprint; RLS is the security boundary. Local stack runs on ports **554xx** (`supabase/config.toml`) because another local Supabase project already used 543xx on this machine. Accepted.

**D-003 — Hand-written shadcn-style primitives (`src/components/ui.tsx`) instead of running the shadcn CLI.** Keeps dependencies minimal for Milestone A; can be swapped for generated shadcn components later without API changes. Accepted.

**D-004 — System font stack with Thai coverage (Leelawadee UI / Thonburi / Noto Sans Thai) instead of `next/font/google`.** `next/font/google` failed to resolve under Turbopack dev in this non-ASCII project path; system fonts also avoid a build-time network fetch. Revisit if a brand font is required. Accepted.

## Security model

**D-010 — Deny by default.** Every public table has RLS; `anon` has no grants; `authenticated` gets SELECT plus explicit column-level UPDATE where self-service is allowed. Default privileges revoked so future tables/functions start closed. Accepted.

**D-011 — Business mutations only through SECURITY DEFINER RPCs.** e.g. `create_task` validates role rules, writes task + assignees + audit + notifications in one transaction. No INSERT/UPDATE/DELETE grants on `tasks`. Atomic and impossible to bypass from the client. Accepted.

**D-012 — Private tasks: full row only via `private.can_view_task()`; title-only projection via `public.task_directory()`.** RLS hides the whole row from unrelated members (so REST filters like `description ilike` return nothing); the directory function returns `id, team_id, title, is_private, redacted` and NULL for everything else. Assignees, audit logs, notifications and storage objects reuse the same predicate. Accepted.

**D-013 — Who sees a private task title:** members of the task's team (and leaders). Members of other teams see nothing. Interpretation of "คนทั่วไปเห็นได้แค่ชื่อหัวข้อ" scoped to the team for multi-team readiness. Assumption — confirm with owner.

**D-014 — Invite-only enforced in the database.** Public sign-up is disabled in Auth config, *and* a BEFORE INSERT trigger on `auth.users` requires `user_metadata.invite_token`; it hashes it (SHA-256), matches a pending, unexpired, unrevoked invite for the same email, strips the token, and the AFTER trigger creates the profile/team membership and consumes the invite in the same transaction. Rationale: GoTrue writes `app_metadata` only after the insert (found by the live test), and a token check stays safe even if sign-up were accidentally enabled. Role always comes from the invite row, never from metadata. Accepted.

**D-015 — The first Admin is an invite created with service-level access (`invited_by = null`).** No special "bootstrap" code path to attack. Seed does this; production bootstrap = insert invite row with the service role, then accept the link. Accepted.

**D-016 — Invite tokens are 256-bit random, stored only as SHA-256 hex, shown once to the Admin.** Admin shares the link through a secure channel (no SMTP dependency for onboarding). Admins never see or set passwords. Accepted.

**D-017 — Password reset uses Supabase recovery email with a `token_hash` template** (`supabase/templates/recovery.html` → `/auth/confirm` → `/reset-password`), so links work cross-device without a PKCE verifier and the Admin-triggered reset never exposes a token. Same response for unknown emails (no enumeration). Accepted.

**D-018 — Deactivation = `profiles.is_active=false` (immediate RLS denial, even for a still-valid JWT) + Auth ban (no new sign-in).** `auth.users` → `profiles` FK is `on delete restrict` so accounts cannot be hard-deleted while history exists. Accepted.

**D-019 — Password policy: ≥10 chars with letters and digits** (Auth config + zod). No MFA per current requirement — **risk recorded**; recommend optional TOTP MFA before production. Open risk.

**D-020 — Storage path convention `task-files/{org_id}/{task_id}/…`**, private bucket, policies call `can_view_task`; no update/delete policies (versioning by new upload in C; archived tasks read-only). Signed URLs can only be minted by someone who can already read the object. Accepted.

**D-021 — Realtime: tasks are not in the `supabase_realtime` publication.** Milestone B will use private Broadcast channels with ids-only payloads and RLS-based refetch, so no row content is ever pushed. Live test asserts nothing leaks today. Accepted (B to implement).

## Domain rules (interpretations)

**D-030 — Director assigning a Member directly must be marked urgent** (`director_direct_assignment_requires_urgent`), which notifies the team's Managers. Normal path = Director assigns the Manager. Assumption — confirm.

**D-031 — Members create work only for themselves and cannot mark it urgent;** both Director and the team's Managers are notified. Members' tasks start immediately (no approval). Accepted per Blueprint 2.1.

**D-032 — Default primary co-owners:** if the creator doesn't choose, every assignee is a primary co-owner. Accepted.

**D-033 — Archive immutability is a trigger** (blocks UPDATE/DELETE of archived tasks and their assignees, even for the DB owner). Audit logs are append-only by trigger. Accepted.

**D-034 — Absences need no approval;** reason visible to self, Director, Admin and Managers who lead a team the person belongs to. Others use `absence_calendar()` (no reason column). Half-day requires a single date. Accepted.

**D-035 — Notifications store `kind + payload`, rendered in TH/EN on read;** `dedupe_key` unique per user for idempotent jobs. Accepted.

## Testing

**D-040 — Two test layers.** (1) `tests/db` runs the real migrations + seed in **PGlite** (Postgres-in-WASM) on a minimal Supabase shim (roles, `auth.users`, `auth.uid()`), so RLS/RBAC tests run anywhere without Docker. (2) `tests/live` runs against the local Supabase stack (GoTrue, PostgREST, Storage, Realtime) and auto-skips if it is not running. Vitest uses the `threads` pool because PGlite's WASM compile OOMs in forked workers on Windows. Accepted.

**D-041 — Initial migration was edited in place during Milestone A** (invite trigger redesign) because no environment besides disposable local DBs had applied it. From now on, schema changes go in new migration files. Accepted.

## Milestone B

**D-050 — Review routing.** `review_level` is fixed at submission time: if any assignee is a Manager or Director → Director reviews; otherwise the team's active Managers (falls back to the Director when the team has none). The Director does not review Member work while a Manager exists. Accepted.

**D-051 — Approve = complete + archive in one transaction.** A unique `(submission_id)` on reviews plus a row lock makes double/concurrent approvals fail cleanly (verified live with two parallel calls). Accepted.

**D-052 — Status transitions (work states)** are a fixed table in `update_task_status`; `in_review`/`completed` only via submit/review; leads may cancel non-review work. Milestone C may refine (for example reopen rules) via a new migration. Assumption.

**D-053 — Realtime carries no domain data.** Broadcast payload is `{entity}`; clients refetch through RLS. Topics are private and authorized by RLS on `realtime.messages`. Trade-off: one extra fetch per change, accepted for confidentiality. Accepted.

**D-054 — Files upload browser → Storage directly** (Storage RLS checks the task), then `submit_task` records them after verifying the object exists under `{org}/{task}/`. Avoids server-action body limits for 50 MB files. Storage keys are ASCII-sanitized; the original (Thai) filename is kept in `task_attachments.file_name`. Downloads use 60 s signed URLs minted with the user's session. Accepted.

**D-055 — Reminder scheduling via pg_cron hourly + dedupe key per 24 h cycle** instead of an exact-time scheduler; reminders arrive within about 1 h after each 24 h boundary. Recipients: team leads + meeting creator if a leader. Assumption — confirm whether Directors should also receive them.

**D-056 — 3D scene:** React Three Fiber with procedural low-poly primitives (placeholder), `frameloop="demand"` (no idle rendering), DPR ≤ 1.75, canvas-sprite labels instead of DOM overlays, camera auto-fit for portrait. Admin is not placed in the office (separate role, not part of the team). WebGL detection + error boundary → 2D view of the same snapshot. Accepted.

**D-057 — Inbox shows workload, not recommendations.** Counts/hours/leave-today per person come from the office snapshot; no ranking is presented until Milestone C's rule-based, explained scoring. Accepted.

**D-058 — Workflow migration edited in place during Milestone B** (added `can_review_task`) before it was applied anywhere but disposable local DBs. Same rule as D-041 from here on: new changes go in new migration files. Accepted.

## Milestone C

**D-060 — Extension decider = the task's reviewer** (Member work → team Manager; Manager-owned → Director). Urgent tasks also notify the Director on request. One pending request per task. Accepted.

**D-061 — Reminders pause only for the task with a pending extension**; they resume automatically on decision (no stored "pause" state to get out of sync). Accepted.

**D-062 — Due reminders: daily from `reminder_days` (default 7) through the due date; recipients = assignees + decider + Directors.** The Blueprint says "ผู้รับงานทุกคน/Manager/ผู้อำนวยการ". Sundays are skipped except the due date; tasks in review are skipped (work already submitted). Overdue tasks get no further reminders (spec: "until the due date"). Assumption — confirm Sunday/overdue behavior and whether Directors want every daily reminder.

**D-063 — Leave conflicts notify the decider only** (Member work → Manager, Manager work → Director) and never touch the task. Dedupe per (task, person, leave, due date) so editing a leave or moving a due date re-notifies only when the conflict is new. Accepted.

**D-064 — Mentions are filtered server-side to people who can open the task**, so mentioning someone can never reveal a private task. Comment notifications go to mentioned people only (no "every comment" spam). Accepted.

**D-065 — Recurrence works on Bangkok calendar dates;** the template task is occurrence #1, instances are created on their occurrence date (06:30 BKK) with `due_time` in Bangkok. Missed occurrences older than 7 days are skipped, not back-filled. Instances copy title/description/assignees/priority/size/hours/privacy; editing the template affects future instances. Assumption.

**D-066 — Assignment suggestions are a fixed, explained formula** (capacity 40, light workload 25, skill 20, not on leave at due 15) shown with its arithmetic. It is labelled "not AI" in the UI, never pre-selects anyone and never assigns. Weights are constants in SQL for now (Admin-tunable later). Accepted.

**D-067 — Functions are closed by default globally** (`alter default privileges revoke execute on functions from public`), because a per-schema revoke cannot remove PUBLIC's default EXECUTE. Found when the directory function was recreated. A DB test asserts anon can execute no public function. Accepted.

**D-068 — Operations migration edited in place during Milestone C** (tie-breakers, leave-conflict routing, `is_task_reviewer`, directory `category_id`) before being applied anywhere but disposable local DBs. Rule D-041 applies from here on. Accepted.

## Milestone C completion

**D-070 — File versions are keyed by task + case-insensitive file name.** Uploading the same name (via submission or "add files") creates the next version; the latest is visible to everyone who can open the task, older versions to Admin only — enforced in both the table RLS and the Storage read policy. Files are never overwritten or deleted. Assumption: "same name = same document".

**D-071 — Checklists show items only, no counts or percentages,** because V1 explicitly excludes progress tracking. Editors = assignees, creator, team leads.

**D-072 — Tags: Admin owns the vocabulary, editors apply tags; category: creator or leads.** Deactivated tags/categories stay on existing tasks but cannot be newly applied.

**D-073 — Search is a security-definer function over the directory.** Free text matches titles for listable rows and details (description, comments, checklist) only for openable tasks; structured filters only match columns that are NULL on redacted rows. This prevents "filter oracle" inference about private tasks. Accepted.

**D-074 — Admin configuration uses RLS write policies + column grants** rather than RPCs (simple CRUD, no side effects); membership changes keep using the audited RPC. Admin audit for category/tag/team-name edits is a known gap.

## Milestone D

**D-080 — Chat tables have no user grants; every read/write is an RPC.** Row-level security cannot hide one column, so the only way to keep an anonymous sender's id away from members is to never expose the table. The Admin uses a separate, audited RPC; even the Admin's normal feed is anonymous. Accepted.

**D-081 — 24-hour deletion is layered:** (1) every read filters `expires_at` (content disappears at expiry), (2) pg_cron deletes rows, reactions and mention notifications every 10 minutes, (3) an app job deletes media bytes via the Storage API (the DB cannot), protected by `CRON_SECRET`. A CHECK makes a lifetime > 24 h impossible. Backups are disclosed in the UI as a limitation. Accepted.

**D-082 — Chat media object names never contain the sender** (`{org}/{random}.{ext}`) and attaching requires being the uploader (Storage `owner_id`). Floating effects for anonymous messages appear at the pinboard, not above a person. Mention notifications carry no text and no actor for anonymous messages. Accepted.

**D-083 — Office location precedence:** approved leave > live meeting > self-reported offsite > self-reported break > desk. Self-reported status lapses at 17:00 Bangkok. "Focus" keeps people at their desk with a 🎧 badge. Assumption — confirm.

**D-084 — Pet signals only for the viewer's own unread @mentions** (task comments or chat), as a "❗@" bubble plus an optional chime; sounds are synthesized and obey both the viewer's mute and the pet's sound toggle. Accepted.

**D-085 — Avatar/pet catalogs are enforced by DB CHECK constraints and mirrored in TypeScript,** with a test that fails on drift. Adding an option = migration + catalog + model.

**D-086 — Parallel work:** another session refreshed the office visuals (`docs/office-visual-refresh.md`). Milestone D extended those files (moved Avatar/Pet into `office-avatar.tsx`, added props) instead of replacing them.

## Milestone E

**D-090 — Reports count only tasks the viewer may open.** `report_tasks` filters through `can_view_task`, so a private task never contributes to anyone's numbers unless they could open it; a Manager and a Member may therefore see different totals for the same period. The page states this. Accepted.

**D-091 — "On time" = the approved submission was sent on or before the due date** (falls back to `completed_at` when there is no submission). Review delay does not count against the member. Overdue = open and past due. Assumption — confirm with the owner.

**D-092 — Ranking is Admin-only, computed from the same report data** (on-time desc, completed desc, late asc, overdue asc, shared ranks on ties). It is not shown or exported for Director/Manager/Member. Accepted (Blueprint).

**D-093 — Exports reuse the RLS-scoped loaders and redact like the UI:** a private task the exporter cannot open keeps its title and a 🔒 label, every other column is empty. Every export writes `admin_audit_logs` (`export`, kind/format/rows/filters, never content). Spreadsheet formula injection is neutralized (`'` prefix for cells starting with `= + - @ TAB CR`) in CSV, XLSX and the PDF text. Accepted.

**D-094 — PDF uses the Sarabun font (OFL, from `@expo-google-fonts/sarabun`) embedded by pdfkit,** traced into the serverless bundle via `outputFileTracingIncludes`. Thai shaping was checked visually. Accepted.

**D-095 — exceljs' vulnerable `uuid` dependency is overridden to `^11.1.1`** (npm `overrides`); XLSX write/read is covered by tests. Revisit when exceljs updates. Accepted.

**D-096 — Job observability is an Admin page over `job_runs`** (last run per job, 7-day failures, pending media tombstones) rather than an external monitor; external alerting is a pre-production follow-up. Accepted.

**D-097 — M365/Outlook and AI meeting extraction exist only as TypeScript interfaces** (`src/lib/integrations/contracts.ts`, `FUTURE_INTEGRATIONS_ENABLED = false`); nothing implements or calls them. Accepted (Blueprint: future only).

## 3D app shell (2026-10-24)

**D-100 — The signed-in app is one 3D office, not a dashboard with a 3D page.** The scene lives in the `(app)` layout and stays mounted between pages. Every page opens as a window over the room from an object: own desk → my desk (dashboard), task board → tasks, pinboard → unassigned inbox, meeting-room screen → meetings, wall calendar → calendar, chart stand → reports, mailbox → notifications, mirror → my character, IT rack → admin pages (tabs). The camera flies to the object and keeps it in the part of the screen the window leaves free (`setViewOffset`); phones get a bottom sheet. The sidebar is gone; a small HUD keeps home, notifications and a hidden "menu" list of the same places (keyboard and screen-reader path). Owner request. Accepted.

**D-101 — URLs and pages are unchanged.** Each window is the existing route rendered inside the shell, so deep links, back/forward, server actions, RLS and tests keep working; `/office` is the landing page after sign-in. Objects are only drawn for pages the role may open (`navFor`), which is still navigation only — authorization stays in the database.

**D-102 — A 2D lobby replaces the scene when WebGL is missing or on request** (all places as cards + team directory). Reduced motion turns camera flights into jumps and disables the window animation.

**D-103 — Cost: the 3D bundle (~250 KB gzip) now loads on every signed-in page,** once per session (the scene is not reloaded between pages). The sign-in, invite and password pages stay 2D so the first screen is fast.

**D-104 — The office is light by default.** Owner request: bright, friendly tone. With the "system" theme, the office shell and its windows stay light even when the OS is in dark mode (`world-bright.css`); choosing Dark explicitly in Settings still gives a dusk version. Accepted.

**D-105 — Each place has its own colour** (`SPOT_COLOR` in `src/lib/office/destinations.ts`): label pill with emoji tile and count bubble in the room, floor ring, menu icon tile, window header tint and lobby card. Text uses the place's dark `ink` shade on its pale `soft` shade, never the bright colour on white. Hovered objects lift slightly; frames are requested only while they move. Accepted.

## Game-style redesign (2026-10-24)

**D-106 — Characters are jointed, stylised-realistic figures** (`office-character.tsx`, about 7½ heads tall). They are built from primitives with locally generated fabric, denim, knit, hair and leather textures, and every catalog option still renders, so saved avatars keep their look. The rig is posed every frame: breathing, blinking, glancing, typing at the desk, talking in meetings, sipping in the lounge, waving when selected, and walking to a new place instead of teleporting. Desk chairs were raised to seated height. With motion off (user setting or OS), people hold a still pose. Accepted.

**D-107 — Rendering has two quality modes.** "Best visuals" adds image-based light (local Lightformers, no HDR download), ambient occlusion (N8AO), soft bloom, neutral tone mapping (keeps whites white), SMAA and a vignette. "Battery saver" skips them and lowers pixel ratio and shadow resolution. The default is battery saver on touch devices and narrow screens; the choice is a per-browser convenience in `localStorage`. Post-processing is a separate lazily loaded chunk (≈158 KB gzip), so battery saver never downloads it. Animated scenes request ≈30 fps (20 in battery saver), only while the tab is visible. New pinned dependencies: `@react-three/postprocessing@3.1.3` and `postprocessing@6.39.5`, each at least 4 weeks old. Accepted.

**D-108 — Game HUD.**
- **Player card:** who you are, a greeting, and where you are; it links to "my character".
- **Hotbar:** one slot per place, keys 1–9; the admin pages share one slot.
- **Minimap:** zones, desks, place pins and people coloured by workload; click a pin to open the place, or a person to focus them. M toggles it.
- **Camera rail:** a vertical toolbar on the right.
- **Esc:** steps back one layer (menu → help → person → team → window → office) and never closes a page while typing in a form field. T opens team search.
- **Brand:** moved into the menu.
- **Implementation:** all HUD parts are DOM, so they stay keyboard and screen-reader reachable. Floor-plan data lives in `src/lib/office/layout.ts`, shared by the scene and the minimap.

Accepted.

**D-109 — Pets are smooth, breed-aware models** (`office-pet.tsx`):
- **Ears:** pointy, floppy or folded by breed.
- **Tails:** curled, stub, pom-pom or long.
- **Body:** short legs for corgi and pug, fluffy coats for poodle and persian.
- **Colouring:** dark points for siamese and stripes for tabby.

Dogs wag and cats sway their tails, and a pet hops when its owner has an unread mention. Accepted.

**D-110 — Game UI kit for window content** (`src/app/world-game-ui.css`).
- **How it works:** pages keep their markup and authorization. Stable class hooks (`ui-btn--*`, `ui-field`, `ui-card`, `ui-badge--*`, `ui-alert`, `ui-empty`, `game-list` / `game-row[data-status]`) let one stylesheet restyle every window.
- **Look:**
  - Cards become raised panels; `<details>` become collapsible quest panels.
  - Buttons become chunky pressable keys; fields become inset slots; checkboxes become game toggles.
  - Tabs become segmented switches; lists and tables become spaced row cards (task rows get a status stripe).
  - Chips are outlined, and empty states are patterned.
- **Colours:** follow the open place.
- **Menu:** matches the owner's reference image (title, subtitle, large icon tiles, chevrons, close button), and a team-search button joins the top bar.
- **Minimap:** hides when a window needs the room.

Accepted.

**D-111 — Reports and Tasks are redesigned as game pages (owner's reference image).**
- **Reports:** a hero header with exports and a period bar.
- **KPI tiles:** each compares with the previous period of the same length (`previousRange`, `delta`); on-time compares in points.
- **Charts:** a trend chart of daily created/completed bars plus a 7-day completion average (one axis, one unit), and a status donut with counts and percentages.
- **Palettes:** checked with the dataviz validator. Donut order keeps green away from red, and every chart has a legend and a table view.
- **Tasks:** a hero header, clickable quest stats, and tasks as cards with a status ribbon and due countdown. "Done" counts archived completions, so it is not always 0.
- **Window size:** both windows open wide by default.

Accepted.

**D-112 — task_directory computes the access check once per row** (migration `20261029000001_directory_perf.sql`). With ~190 tasks the directory took ~6 s and hit the 8 s statement timeout under concurrent page loads, because the planner flattened the LATERAL subquery and re-ran `can_view_task()` at every `v.ok` reference. `offset 0` fixes it (6.0 s → 0.32 s); a unit test guards the pattern. It is still ~1.7 ms per row, so orgs with thousands of tasks need a set-based access check later. Accepted.

**D-113 — Optional demo data and a pitch video.**
- **Demo data:** `scripts/demo-data.sql` adds ~150 synthetic tasks over 60 days for demos (local or staging only, rows marked "ข้อมูลตัวอย่าง (เดโม)"). It is never part of the seed or tests.
- **Video:** `video/` is a separate package (puppeteer-core + system Chrome + FFmpeg) that captures real screens and renders a 57 s 1920×1080 showcase from an editable storyboard. Remotion was not used, because its free licence excludes companies over 3 employees.

Accepted.
