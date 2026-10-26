# Implementation Progress

## 2026-10-24 — Game-style redesign: characters, rendering, HUD, pets — VERIFIED (local, Chromium)

Owner request: feel like a polished 3D game or desktop app, with realistic characters, smooth animation, better lighting and a premium environment.

### Completed
- **Characters** (`src/components/office/office-character.tsx`):
  - Jointed rig with realistic proportions.
  - Faces with blinking eyes, brows, ears and cheeks; all catalog hair, outfit, shoe and accessory options.
  - Fabric, denim, knit, hair and leather textures.
  - Poses by place: typing at the desk, talking in meetings, a cup in the lounge, standing at the door or home area. People wave when selected and walk between places.
- **Pets** (`office-pet.tsx`): smooth breed-aware dogs and cats with tail wag or sway, breathing, head tilts, and a hop on alerts.
- **Rendering** (`office-scene.tsx`, `office-effects.tsx`):
  - In-scene sky and image-based light.
  - Lazy post-processing in "best visuals": AO, bloom, neutral tone mapping, SMAA, vignette.
  - A battery-saver mode (default on touch and narrow screens).
  - A steady frame pace only while the tab is visible.
- **HUD** (`src/components/shell/world-hud.tsx`, `src/app/world-hud.css`):
  - Player card, a hotbar with keys 1–9 and count badges, a minimap with place pins and people, and a vertical camera rail.
  - An Esc keycap on windows; Esc steps back to the office. M toggles the map and T opens team search.
- **Shared floor plan** in `src/lib/office/layout.ts`, used by the scene and the minimap.

### Verification
| Command | Result |
|---|---|
| `npx supabase db reset` + `npx vitest run` | ✅ 144/144 (16 files) |
| `tsc --noEmit` / `eslint .` | ✅ |
| `next build` / `npm run check:bundle` | ✅ 37 client files, no secrets |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| Bundle | 3D core 234 KB gzip; effects 158 KB gzip, loaded only in "best visuals" |

Browser (in-app Chromium, dev, desktop pane and 375×812):
- **Keyboard:** key 2 opened Tasks (camera on the task board, slot 2 highlighted); Esc returned to the office.
- **Minimap:** shows 9 people and 8 place pins.
- **Effects:** the chunk loaded in best-visuals mode.
- **Models:** a seated Manager at the desk; the `/me` preview shows the fuller character and the new shiba.
- **Phone:** no horizontal overflow, and the hotbar sits beside the chat button.

### Not verified / limits
- **Devices and performance:** no real-device or GPU frame-time measurement; 9 animated characters plus AO was not profiled on low-end hardware.
- **Animation checks:** walking was not observed in the browser, because no one changed location during the session. Animations were judged from still captures only, since the Browser pane was hidden.
- **Preview:** the character preview on `/me` still renders on demand (no idle animation there).
- **Models:** still procedural; no GLB or skinned meshes.

## 2026-10-24 — 3D app shell: every page lives inside the 3D office — VERIFIED (local, Chromium)

Owner request: no dashboard look; the whole app should feel like a program inside the 3D office, with the menus hidden in the room.

### Completed
- `src/app/(app)/layout.tsx` renders `WorldShell` (`src/components/shell/world-shell.tsx`): a full-screen scene plus a small HUD (home, notifications, hidden places menu with account and sign-out). The sidebar layout is gone.
- Pages open as a window over the room (`.world-window`) with a close button back to the office, a widen toggle, and tabs for the admin pages. Phones get a bottom sheet with the room above it.
- New clickable objects (`src/components/office/office-hotspots.tsx`): task board, wall calendar, chart stand, mailbox (flag up when there are unread notifications), mirror and IT rack. The viewer's own desk, the pinboard and the meeting-room screen are doors too. Floor rings and screen-size labels mark them, and only objects for the viewer's pages are drawn.
- The camera flies to the object of the open page and keeps it in the free part of the screen (`setViewOffset`); with reduced motion it jumps instead.
- `/office` is the landing page after sign-in (root, login, password reset, email confirm).
- Office controls moved into a bottom dock (views, zoom, light, names, team search, 2D, help); the person card and team drawer float on the left.
- 2D lobby (no WebGL, or chosen): all places as cards plus the team directory.
- `src/lib/office/destinations.ts` with `tests/unit/destinations.test.ts` (route-to-object mapping, objects per role).

### Verification
Browser (in-app Chromium, dev, 1280×800 and 375×812):
- **Admin:** clicked the IT rack → accounts window with the three admin tabs; the camera kept the rack in view on the left.
- **Manager:** `/tasks` window with the task board in view. Menu → "โต๊ะของฉัน" opened the dashboard, closed the menu and focused the window title.
- **Phone:** calendar as a bottom sheet with the wall calendar above it; no horizontal overflow.
- **2D lobby:** 9 places and 9 people listed, no canvas.

Commands: see the session report (full vitest, tsc, eslint, build, bundle check).

### Not verified / limits
- **Screenshots:** the Browser pane was hidden, so screenshots were partly stale. Label size and camera framing were judged from a few captures only.
- **Devices:** no real-device test (iPhone, Edge).
- **Page layouts:** pages keep their previous layout inside the window and were not redesigned for a narrower width (the widen button helps on desktop).
- **Auth pages:** sign-in, invite and reset pages are still 2D.

## 2026-10-24 — Milestone E: reports, Admin-only ranking, exports, production readiness — VERIFIED (local); NOT release-ready

See `docs/release-readiness.md` for the gate-by-gate checklist, blockers and prioritized fixes.

### Completed
- **Migration** `supabase/migrations/20261028000001_reporting.sql`
  - `report_tasks(from, to)`: tasks the caller may open (`can_view_task`) with activity in the window (≤ 731 days), including the approved submission time and assignee ids.
  - `log_export(kind, format, rows, filters)`: writes an `export` row to `admin_audit_logs` (no content).
- **Reports** (`/reports`, every role)
  - Period presets (7/30/90 days, this month) and a custom range.
  - Six tiles: open (urgent), in review, overdue, completed, on-time % (on time / late), open estimated hours.
  - Bar lists for status, category and open hours per person, each with tooltip, keyboard focus and a table view.
  - Per-person table. **Admin only:** ranking table (on-time, completed, late, overdue; shared ranks).
- **Exports** `GET /api/export/tasks|report?format=csv|xlsx|pdf`
  - Built from the same RLS-scoped loaders as the pages; `/tasks` export keeps the current filters.
  - Private tasks the exporter cannot open: title + 🔒 only.
  - CSV with BOM, XLSX (frozen header), PDF A4 landscape with embedded Sarabun (Thai), page numbers.
  - Formula-injection neutralization in all formats; every export audited.
- **Operations**
  - `/admin/health` (Admin): last run per job, failures in 7 days, pending chat-media deletions, recent runs.
  - `scripts/restore-drill.sh`: dump → empty DB → restore → compare counts + marker. **PASS.**
  - Docs: `docs/runbook.md` (deploy, env, Supabase config, bootstrap, jobs, rotation, backups, incidents), `docs/pilot-playbook.md` (1 Director, 1 Manager, 7 Members, Admin; scenario + Blueprint QA 1–9 with pass/fail columns), `docs/release-readiness.md`.
  - `src/lib/integrations/contracts.ts`: future-only M365 calendar and AI meeting-extraction interfaces, not implemented.
  - `npm audit --omit=dev`: 0 vulnerabilities (uuid override for exceljs).

### Verification (commands actually run)
| Command | Result |
|---|---|
| `npx supabase db reset` | ✅ 7 migrations + seed |
| `npx vitest run` | ✅ **141/141** (15 files; new: `tests/unit/reports.test.ts` 7, `tests/unit/export-formats.test.ts` 4, `tests/db/reporting.test.ts` 4, `tests/live/exports.test.ts` 3) |
| `tsc --noEmit` / `eslint .` | ✅ |
| `next build` / `npm run check:bundle` | ✅ (26 routes); 3D chunk 249 KB gzip, lazy on `/office` and `/me` only; no secrets in 34 client files |
| `bash scripts/restore-drill.sh` | ✅ PASS (counts identical, marker restored) |

Browser (in-app Chromium, dev):
- **Manager `/reports` (90 days):** 50% on time (1 on time, 1 late) matches the seed; no ranking section.
- **Admin `/reports`:** ranking shown (Mali 1st; Kanok and Pim tied 2nd).
- **Exports:** all five endpoints returned 200 with correct content types and filenames through a real session. The PDF opened in the browser viewer with correct Thai vowels and tone marks. This check found a blank trailing page (footer written below the margin), fixed and covered by a test.
- **Admin `/admin/health`:** chat purge run listed as succeeded, 0 failures, 0 pending files.

### Issues found and fixed during E
1. Blank second PDF page from the page-number footer → margin lowered while writing; test asserts a one-page sample.
2. `uuid` advisory through exceljs → npm override; XLSX round-trip test still passes.
3. Restore drill on Git Bash: path rewriting and the container `/tmp` wiped by reset → `MSYS_NO_PATHCONV=1`, dump kept on the host.

### Not verified / limits (honest list)
- **No real devices:** no physical iPhone Safari or Windows Edge test of anything, including 3D touch controls (Blueprint QA 8).
- **No hosted deployment:** staging/production were never deployed; the runbook is untested against a real Supabase/Vercel project.
- **Placeholder 3D models** (procedural, labelled), no presence/animations.
- **Password-reset email** round trip not clicked through end-to-end.
- **No MFA**, no external alerting, Admin audit gaps for category/tag/team-name edits.
- **Reports** are not paginated/cached; fine for one team, unmeasured beyond the seed.


## 2026-10-24 — Milestone D: avatar & pet editors, state-based 3D positions, 24-hour chat — VERIFIED (local), with device caveats

Built on top of the parallel "office visual refresh" (see `docs/office-visual-refresh.md`). Its furniture, camera, lighting and directory code was kept; avatar/pet models moved into a shared module so the editor preview and the office render the same thing.

### Completed
- **Migration** `supabase/migrations/20261027000001_social.sql`
  - **Catalog constraints.** Avatar parts (skin, face, eyes, nose, mouth, hair, hair color, top, bottom, shoes, glasses, accessory) and pets (breed per species, color, outfit) are CHECK-constrained. A DB test keeps `src/lib/office/catalog.ts` in sync with them.
  - **Office status.** `office_status` is self-service (RLS) with values working / focus / break / offsite, an optional note, and an `until` time (defaults to 17:00 Bangkok).
  - **Chat tables.** `chat_messages` (text / sticker / image, `is_anonymous`, mentions, `expires_at` ≤ created + 24 h by CHECK), `chat_reactions` (6 emoji) and `chat_media_tombstones`.
    - **No table grants for users.** All access goes through RPCs (`chat_feed`, `send_chat_message`, `react_chat_message`), so `sender_id` cannot be selected directly.
    - **Anonymity.** For anonymous rows, `chat_feed` returns no sender id or name, only `is_mine` for the author.
    - **Admin lookup.** `admin_chat_identity` is Admin-only and audited (who looked, which message; never the content).
    - **Mentions.** A notification carries no chat text, has a null actor for anonymous messages, and is deleted together with the message.
    - **Sending rules.** Rate limit of 20 messages per minute. Images must be the sender's own upload in the org's `chat-media` folder; object names are `{org}/{random}.{ext}`, never the user id.
  - **24-hour deletion.**
    - Every read path filters `expires_at > now()`, so content disappears at expiry.
    - `run_chat_purge` (pg_cron, every 10 minutes) deletes rows, reactions and mention notifications, and queues image paths.
    - `/api/jobs/chat-purge` (bearer `CRON_SECRET`; `vercel.json` cron every 10 minutes) deletes the queued objects from Storage.
    - The Storage read policy only allows media of a live message.
  - **Bucket.** `chat-media` is private, 5 MB, PNG/JPEG/GIF/WebP only.
  - **Realtime.** Chat, reaction and status changes send content-free `{entity}` signals.
  - **Preferences.** `profiles.sound_enabled` and `chat_effects` were added.
- **3D**
  - `office-avatar.tsx` holds the shared Avatar (all catalog parts), Pet (breeds, outfits, @mention "❗@" alert, click sound), canvas-sprite labels and `FloatingEmote`. The emote animates only while visible (on-demand rendering); with reduced motion it shows statically.
  - `office-extras.tsx` adds a game corner (arcade + foosball) and an "out of office" doorway.
  - **Location precedence:** leave → home, live meeting → meeting room, offsite → doorway, break → lounge/game corner, otherwise desk (`deriveOfficeState`, unit-tested). Status badges 🎧/☕/🚗 sit next to names.
  - **Chat effects in the scene.** Sticker and emoji-only messages float above the sender's avatar; anonymous ones float above the pinboard, so an effect never points at an anonymous author.
  - **Sounds.** Synthesized pet sounds and a mention chime (Web Audio, no files). They respect the viewer's mute setting and each pet's own sound toggle.
- **UI**
  - `/me` "ตัวละครของฉัน" (Director/Manager/Member): avatar editor with live 3D preview, pet editor, skill self-assessment (1–5), current status, and a "finish" button that completes onboarding.
  - Invite acceptance now lands on `/me?welcome=1`. This completes the Blueprint flow: password → nickname → avatar → pet → skills → office.
  - Chat panel (bottom-right on every app page): named or anonymous posting, stickers, images/GIF, @mention picker, reactions, per-message "deletes in N h", a backup-retention disclosure, mute/unmute, an effects toggle, an unread badge and a mobile bottom sheet. The Admin sees a "reveal sender" button on anonymous messages.
  - The office directory and filters understand lounge/offsite ("away" = leave or offsite); the person panel shows the status note.

### Verification (commands actually run)
| Command | Result |
|---|---|
| `npx supabase db reset` | ✅ 6 migrations + seed; cron: chat-purge, due-reminders, recurrences, unassigned-meeting-reminders; buckets task-files, chat-media |
| `npx vitest run` | ✅ see final run in the session report (new: `tests/db/social.test.ts` 11, `tests/live/social.test.ts` 3, unit precedence test) |
| `tsc` / `eslint` / `next build` / `check:bundle` (now also scans for `CRON_SECRET`) | ✅ see final run |

Prompt D checks:
- **Anonymous chat:**
  - Members and the Admin can't read chat tables directly.
  - Anonymous rows carry no sender in the feed, for anyone including the Admin's regular feed.
  - Only `admin_chat_identity` reveals the sender, and each lookup is audited (DB + live API).
- **Expiry:**
  - Expired messages are absent from the feed at once, and reactions are refused.
  - Media can no longer be signed.
  - The purge deletes rows, reactions and mention notifications. A retry is a no-op. Lifetime over 24 h is impossible.
- **Media purge:** live test uploaded a real image, expired it, called the job route (401 without the secret), and confirmed the object is gone from Storage.
- **No private task data in 3D:** unchanged snapshot path; the existing live snapshot test still passes.

Browser (in-app Chromium, dev, hidden pane):
- **Mali in `/me`:** changed hair/glasses/accessory/eyes/shoes and the pet (dog → corgi, bandana), saved, and the DB confirmed the values. This found a stale-state bug (only the last of several quick choices was saved), now fixed.
- **Status:** set to "break" with a note → the office directory shows her in the lounge.
- **Chat as Mali:** sent anonymous text and a sticker; the author sees "นิรนาม (คุณ)".
- **Mention from Kanok** (separate session): the sticker appeared live with "@กล่าวถึงคุณ", and the notification reads "กนก กล่าวถึงคุณในแชทออฟฟิศ" without copying text.
- **Admin:** "ดูตัวตน (Admin)" revealed "ผู้ส่ง: มะลิ".

### Not verified / limits (honest list)
- **Not visually checked:** the floating 3D emote animation and the pet "❗@" bubble. The Browser pane was hidden, so WebGL frames were throttled and screenshots too small. The logic is in place and type-checked, but neither is visually confirmed.
- **No device testing:** nothing has been tested on a physical iPhone or Windows Edge. Touch was only checked by earlier mobile-viewport emulation.
- **Placeholder models:** all models are still procedural placeholders, as labelled in the UI; GLB assets are pending.
- **Purge timing:** `/api/jobs/chat-purge` must be scheduled in production (`vercel.json` provided). Until it runs, expired images are invisible (Storage policy) but their bytes remain. Text is deleted by pg_cron regardless.
- **Backups:** database backups may retain chat content until their retention period ends. This is disclosed in the chat panel; the actual backup retention depends on the hosting plan and is not configured here.
- **Not built:** online presence (who is currently connected) and walk/idle animations.
- **Admin in the office:** the Admin has no `/me` page and is not placed in the office (separate role, as before).

## 2026-10-23 — Milestone C completion: file versions, checklists, tags, Admin config, search — VERIFIED (local)

### Completed
- **Migration** `supabase/migrations/20261026000001_task_extras.sql`
  - **File versions.**
    - `task_attachments` gets `file_key` (lower-cased, trimmed name) and `version`, set by a trigger. Same task + same name = next version, unique per (task, file_key, version). Existing rows are backfilled.
    - Everyone who can open the task sees only the **latest** version (RLS); older versions are **Admin-only**.
    - The Storage read policy uses the same rule (`private.storage_object_visible`), so old versions cannot be downloaded or signed by non-admins either.
    - New `add_task_files` RPC adds working files outside a submission, for editors only, never on archived tasks.
  - **Checklists.** `task_checklist_items` with `add_checklist_item`, `set_checklist_item_done` and `remove_checklist_item`, for editors (assignees, creator, leads). An archive guard applies. No percent-progress is shown or stored.
  - **Tags and category.**
    - `task_tags` is the Admin-managed vocabulary (name, color, active). `task_tag_links` with `set_task_tags` is for editors.
    - `set_task_category` is for the creator and leads ("แก้ไขได้โดยผู้มีสิทธิ์"). Both are audited.
  - **Admin config through RLS.** Only Admins may insert/update teams, categories and tags (column-limited grants). Team membership and lead flags use the existing audited `admin_set_team_membership`.
  - **Directory v3** adds `tag_ids` (null for redacted rows).
  - **Search.** `search_tasks(query, statuses, category, tag, assignee, priority, urgent, include_archived)`:
    - Titles match for every listable row. Description, comment and checklist text match **only on tasks the caller can open**.
    - Every filter uses columns that are NULL on redacted rows, so filtering by tag, assignee or status can't reveal anything about a private task.
    - LIKE wildcards are escaped, and results are capped at 300.
  - The demo seed adds 3 tags.
- **UI**
  - Task page:
    - Files section: latest versions; the Admin also sees older ones, labelled. Upload or new-version form, with sizes and uploaders shown.
    - Checklist (add / tick / remove) and category + tags editor.
    - Submission files show their version.
  - `/tasks`: search box plus status, priority, category, tag, assignee, urgent-only and include-archived filters (default hides archived), a result count, and tag chips in the list.
  - `/admin/config` (Admin nav "ตั้งค่าองค์กร"): create/rename teams; add/remove members; set/unset lead; categories (add, activate/deactivate); tags (add with color, activate/deactivate).
  - Shared `src/lib/upload-client.ts` (browser → Storage) now used by both submit and add-files forms.

### Verification (commands actually run)
| Command | Result |
|---|---|
| `npx supabase db reset` | ✅ 5 migrations + seed |
| `npx vitest run` | ✅ **108/108** (9 files; new `tests/db/extras.test.ts` 10 tests, new live Storage version test) |
| `tsc` / `eslint` / `next build` / `check:bundle` | ✅ see final run in the session report |

Browser (in-app Chromium, dev):
- **Mali:** added and ticked a checklist item, uploaded `สรุปยอดขาย.csv` twice and saw only v2, then tagged the task #ไตรมาส4.
- **Search:** text from the checklist item finds her task. Her search for "CONFIDENTIAL" (present only in private descriptions) returns 0.
- **Admin:** sees v1 labelled "เวอร์ชันเก่า (Admin)". `/admin/config` renders teams/members/leads, and a new tag created there appears in the list.

### Remaining limits
- **Lists:** tasks are not paginated beyond 300 search results, and archived tasks are hidden by default on `/tasks` (tick "include archived").
- **Teams and admin audit:** teams can't be deleted (by design, history is kept). Category/tag rename beyond add and toggle is not in the UI. Category/tag/team-name changes are not written to `admin_audit_logs` (only team membership is).
- **Subtasks/projects:** creation is still API-only, with no screens.
- **Devices:** not tested on a real iPhone or Windows Edge.
- **Concurrent edits:** during this session another editor changed `src/app/(app)/nav-links.tsx`, `src/app/(app)/office/page.tsx` and added `src/components/icon.tsx`. Those changes were left untouched and compile with this work.

## 2026-10-23 — Milestone C: Work operations — VERIFIED (local), with listed gaps

### Completed
- **Migration** `supabase/migrations/20261025000001_operations.sql`
  - **Extension requests.** `task_change_requests` allows one pending request per task. `request_due_change` is for assignees and requires a reason and a future date. `decide_due_change` is for the reviewer: Member work → Manager, Manager work → Director. While a request is pending, the task shows the "รออนุมัติเลื่อนกำหนด" label and due reminders pause. Approving moves the due date. Every step is audited and notified.
  - **Director notices on urgent tasks.** A trigger notifies the Director whenever the due date, priority or status of an urgent task changes.
  - **Direct edits by leads.** `update_task_details` (leads only, audited) changes due/priority/size/hours/`reminder_days`. Members must request an extension instead.
  - **Due reminders.** `run_due_reminders(now)` sends one reminder per day, from `reminder_days` (default 7, 0 = off) before the due date through the due date. Recipients: assignees, the person who decides on the work, and Directors. Sundays are skipped except on the due date. Tasks in review or with a pending extension are skipped. Dedupe key: `due:{task}:{date}`. pg_cron runs it at 08:00 BKK.
  - **Leave conflicts.** Triggers on leave insert/update, due-date change and new assignee notify the decider: Member work → team Manager, Manager work → Director. They never change the task. The leave reason is never included.
  - **Company holidays.** `company_holidays` is Admin-managed and used by the capacity calculation and the calendar.
  - **Comments.** `task_comments` is append-only and blocked on archived tasks. `add_task_comment` keeps only mentions of people who can open the task (`private.can_user_view_task`), so a mention can never leak a private task.
  - **Recurrence.** `task_recurrence_rules` supports daily, weekly (weekdays + every N weeks), monthly (day clamped to month end), yearly (Feb 29 → Feb 28) and custom (every N days).
    - `private.next_occurrence` works on Bangkok calendar dates; `due_time` is applied in Asia/Bangkok.
    - `run_recurrences(now)` is idempotent via a unique index on (rule, occurrence). It catches up at most 7 days of missed occurrences and stops at `until_on`. pg_cron runs it at 06:30 BKK.
  - **Suggestions.** `suggest_assignees` is a deterministic, explained score (leads only, never assigns): capacity 40 + light workload 25 + skill 20 + not on leave at due 15.
    - Capacity uses Mon–Sat 8h days minus holidays and leave (half day = 4h), minus open estimated hours.
    - Ties break by most free hours, then fewest open tasks.
  - **Directory v2.** Adds `has_pending_extension`, `assignee_absent_today` ("รอเธอกลับมาทำงานนะ 😏"), `is_recurring` and `category_id`. These are null for redacted rows.
  - **Privileges.** Global `alter default privileges … revoke execute on functions from public`; anon can execute no public function; job functions are not callable by users. A DB test now guards this.
- **UI**
  - Task page: pending-extension panel (request form for assignees; approve/decline for the reviewer), lead "adjust details" form, recurrence editor with stop button, comments with an @mention picker, extension history, and new labels.
  - Task list: labels for pending extension / assignee on leave 😏 / recurring.
  - `/calendar`: Today/Week/Month views, Mine/Team, person and category filters. Shows due tasks, leave (name + part only), meetings and holidays, with Sundays highlighted. Also has the leave form (full/AM/PM, multi-day, private reason, no approval) and "my leave" with remove.
  - Inbox / meeting page: rule-based suggestion panel that re-ranks live when size, hours, due date or skill change. It shows the score breakdown, and clicking a row ticks the person; the lead still presses Assign.
  - Admin: company holidays management.
  - Notifications: new kinds rendered in TH/EN.

### Verification (commands actually run)
| Command | Result |
|---|---|
| `npx supabase db reset` | ✅ 4 migrations + seed; cron has `due-reminders`, `recurrences`, `unassigned-meeting-reminders` |
| `npx vitest run` | ✅ see final run in the session report (DB + unit + live) |
| `tsc` / `eslint` / `next build` / `check:bundle` | ✅ see final run |

Prompt C tests:
1. **States:** 8 states, invalid transitions rejected (`tests/db/operations.test.ts` §1).
2. **Urgent:** Manager notice on the Director's direct assignment; Director notice on later changes; members cannot edit details (§2).
3. **Extensions:**
   - A pending request pauses reminders; rejection keeps the date and resumes; approval moves the date; the audit sequence is checked (§3, plus live API).
   - Sunday/override rules (§3).
4. **Leave collision:** the leads are notified, due date and assignees are unchanged, and the reason is not leaked; Manager-owned work notifies the Director (§4).
5. **Confidentiality:**
   - Private-task comments, mentions, change requests and directory labels are not visible to unrelated members.
   - Suggestions are leads-only; holidays are Admin-only.
   - Covered by §5 and live tests.
6. **Cron retries:** due reminders and recurrence create nothing new on retry (§6 + recurrence).
7. **Archive:** comments, extensions and detail edits are rejected on archived tasks, including a direct table insert (§7).
- Recurrence math: month ends, leap years, every-2-weeks Mon/Thu, every-3-days, quarterly, catch-up window, end date.

Browser (in-app Chromium, dev):
- **Mali:** requested an extension → pending label and panel appear, with no approve buttons for her. Then commented with @มานะ.
- **Manager:** received the mention and the extension notifications, approved → due moved 28 Oct → 6 Nov, with history and audit shown.
- **Manager:** set weekly-Friday recurrence → next occurrence 13 Nov.
- **Inbox:** suggestions ranked. Changing the size to XL with a Saturday due date re-ranked them with visible arithmetic.
- **Calendar week:** shows the Manager-visible private due item, Pim's leave without reason, and the Sunday due date highlighted.
- **Leave conflict:** the Manager recorded leave on his own task's due date and got a conflict notice. This exposed the routing flaw, which was fixed: the notice now goes to the Director, with a test added.

### Not done / gaps (honest list)
- **File versions:**
  - Not implemented: "latest for users, older versions Admin-only".
  - Current state: attachments are per submission and immutable, and every version stays visible to people who can open the task.
- **Checklists and tags:** not implemented (`task_checklist_items`, `task_tags`).
- **Admin config for teams, categories, tags and policies:** not implemented; only company holidays are done.
- **Subtask/project UI:** not built. The schema and the `create_task` parameters exist, but there are no screens.
- **Search across tasks:** only the task list exists; no private-aware search box yet.
- **Calendar person/category filters:** they apply to due tasks. Leave is filtered by person only; meetings are hidden when a category filter is active.
- **Not tested on a real iPhone or Windows Edge.**

### Next (prioritized)
1. File versions (latest visible; older Admin-only) + checklists + tags.
2. Admin config screens: teams/membership, categories, tags, reminder policy defaults.
3. Private-aware search + filters on `/tasks`; subtask/project creation UI.
4. Milestone D: avatar/pet editors, full 3D rooms + animation, ephemeral chat with anonymous mode and 24h purge.

## 2026-10-23 — Milestone B: End-to-end workflow + basic 3D — VERIFIED (local)

### Completed
- **Migration** `supabase/migrations/20261024000001_workflow.sql`
  - Tables: `task_submissions` (with `review_level`), `task_reviews` (one decision per submission), `task_attachments`, `job_runs`. All append-only, with RLS through `can_view_task`.
  - RPCs: `create_meeting`, `add_meeting_notes` (leads + proxy attendees; proxies cannot assign), `assign_action_item` (row lock, reuses `create_task` rules, links item ↔ task), `dismiss_action_item`, `update_task_status` (guarded transition table), `submit_task` (assignee only, note or file required, file path must be under `{org}/{task}/` and exist in Storage), `review_task` (approve → completed + archived in the same transaction / revise with required comment; Member work → team Manager, Manager-owned → Director), `can_review_task`.
  - Reminder job `run_unassigned_meeting_reminders(now)`: 24h cycles from `ends_at`, `dedupe_key = meeting_unassigned:{meeting}:cycle:{n}`, `on conflict do nothing`, recorded in `job_runs`. Scheduled hourly with **pg_cron**.
  - Realtime: triggers send **content-free** broadcasts (`{entity}` only) to private topics `org:{org_id}` and `user:{user_id}`. RLS on `realtime.messages` allows only your own org or your own user topic.
  - Storage bucket MIME allow-list (Office/PDF/images/video/ZIP/text).
- **Shared data layer**: `src/lib/office/state.ts` (pure `deriveOfficeState`), `src/lib/data/office.ts` (`getOfficeSnapshot`, built on the same `task_directory` the dashboard uses), `src/lib/data/meetings.ts`.
- **UI**
  - `/meetings`: list and create (leads), with attendees, proxies and action items.
  - `/meetings/[id]`: summary, items and status, inline assign for leads, notes form for leads and proxies.
  - `/inbox`: unassigned items grouped by meeting, age since meeting end, total counter, assign form showing each person's current workload (information only), dismiss.
  - `/tasks/[id]`: status buttons, submit with direct-to-Storage upload, review panel, submission/review history, 60-second signed download route `/tasks/[id]/files/[fileId]`, archived read-only banner, link back to the source meeting.
  - `/office`: React Three Fiber scene with the Director room, Manager desk, 7 dual-monitor desks (workload status light plus urgent marker), meeting room, lounge/game corner, unassigned board (live count), "home" for people on leave, avatars from `avatar_appearance`, and pets.
    - Clicking an avatar opens a panel from the same data. A 2D view toggle doubles as the automatic fallback when WebGL is unavailable or the scene crashes.
    - Orbit/zoom/pan works with mouse and touch. Rendering is on-demand only (no idle frames), and the camera fits portrait screens.
  - `RealtimeRefresher` in the app shell: any change → debounced `router.refresh()`.
  - Navigation and TH/EN copy updated.

### Verification (commands actually run)
| Command | Result |
|---|---|
| `npx supabase db reset` | ✅ 3 migrations + seed; `cron.job` contains `unassigned-meeting-reminders` |
| `npx vitest run` | ✅ **74/74**: DB (PGlite) 49, unit 6, live API 19 |
| `npx tsc --noEmit`, `npx eslint .`, `npx next build`, `npm run check:bundle` | ✅ see the final run in the session report |

Mandatory paths:
- **A.** Meeting ended 24h+ ago with 3 items, 1 assigned → 2 remain. Repeated job runs → exactly 1 reminder per lead per cycle; the next cycle sends again; nothing once all items are handled. Covered by `tests/db/workflow.test.ts`.
- **B.** Submit → revise → resubmit → approve → archived atomically, with audit sequence, submission/file rows, and retries rejected. Covered by `tests/db/workflow.test.ts`; Storage + concurrent approval in `tests/live/workflow.test.ts`.
- **C.** A Manager-owned task routes to the Director only. Covered by `tests/db/workflow.test.ts`.
- **D.** Private-task leak checks:
  - An unrelated member cannot act on or read submissions, files or reviews of a private task (`tests/db`).
  - The office snapshot JSON for an unrelated member contains no private detail (`tests/live`).
  - Realtime payloads carry no task id or title (`tests/live`).
- **E.** Status change → 3D state:
  - Pure derivation is covered in `tests/unit/office-state.test.ts`.
  - **Browser:** with the Manager's `/office` panel open, a separate session (as Mali) started and submitted her task. The panel switched to "in review" and the notification badge went 4→5 without a reload.

Browser demo (in-app Chromium, dev server):
- **Manager:** opened `/inbox` (3 items, aged 25h) and assigned one to Mali with a due date; the counter dropped to 2.
- **Manager, `/office`:** the 3D scene renders and the board shows 2. Clicking Mali's avatar shows 2 open tasks / 12h, with the next due item being the meeting task.
- **Manager:** requested changes with a comment.
- **Mali:** resubmitted with a CSV that has a Thai filename. The download through the signed URL returned the file content.
- **Manager:** approved. The task shows as archived, read-only, with no actions.
- **Phone viewport (375×812):** the scene fits after the camera fix.

### Issues found and fixed during B
1. drei `Html` labels raised React 19 "synchronously unmount a root" errors → replaced with canvas-texture sprite labels (system Thai fonts, no extra React roots).
2. A test called `db.query` inside an open PGlite transaction, which deadlocked (PGlite serializes queries) → ids are resolved before entering `asUser()`.
3. The new MIME allow-list rejected a type-less test upload (correct behavior) → the test now sets `text/plain`.
4. Realtime adds its own message `id` to the payload → the assertion allows exactly `{id, entity}`.

### Not done / limits
- Not tested on a physical iPhone or Windows Edge; touch was only checked via the mobile emulation in the in-app Chromium. The Browser pane was hidden during testing, so first paint was throttled. That throttling is an environment effect, not an app delay.
- 3D uses procedural placeholder models (labelled in the UI); GLB assets, animation, the full avatar/pet editors and chat are Milestone D.
- Assignment suggestions are not implemented yet (the inbox only shows workload); rule-based scoring is Milestone C.
- An orphan Storage object can remain if a user uploads but the submit RPC then fails. A cleanup job is planned in Milestone C/D.
- Live tests add rows to the local DB; `npx supabase db reset` restores the seed.

### Next (Milestone C, prioritized)
1. Change/extension requests with reminder pause, and Director notification on urgent changes.
2. 7-day due reminders (daily, idempotent), plus leave-collision notices to the Manager (never auto-reassign).
3. Absence UI + calendar views (Today/Week/Month/Mine/Team).
4. Comments/@mentions, file versions (latest for users, older ones Admin-only), checklists/tags, recurrence.
5. Rule-based assignment suggestions with explained weights; Admin config for categories/tags/teams.

## 2026-10-23 — Milestone A: Foundations — VERIFIED (local)

### Completed
- **Project scaffold:** Next.js 16.4 / React 19 / TS 5.9 / Tailwind 4, ESLint flat config, Vitest, Supabase CLI config (invite-only auth, password policy, ports 554xx), `.env.example`, `.gitignore`, security headers.
- **Database** (`supabase/migrations/`):
  - `20261023000001_foundation.sql` — 20 tables (org, teams, profiles, team members, skills, invites, admin audit, projects, categories, tasks, task assignees, task audit, meetings, attendees, action items, notifications, absences, avatar, pets), enums (8 task states), composite org FKs, indexes, archive/append-only triggers, authorization helpers, invite-only triggers on `auth.users`, RPCs (`task_directory`, `absence_calendar`, `create_task`, admin RPCs, `mark_notifications_read`), RLS policies, deny-by-default grants.
  - `20261023000002_storage.sql` — private `task-files` bucket + policies tied to `can_view_task`.
- **Seed** (`supabase/seed.sql`): synthetic org/team, Admin + Director + Manager + 7 Members (all via invite tokens), 4 categories, 4 skills, 7 tasks through `create_task` (normal, co-owned, private ×2, urgent Director→Member, Director→Manager, member self-created), meeting with 3 unassigned action items, a leave with private reason, avatars, pets.
- **App** (`src/`):
  - Auth: `/login`, `/forgot-password`, `/reset-password`, `/auth/confirm`, `/auth/signout`, `/invite/[token]` (accept + set own password + nickname), `proxy.ts` session refresh and route gating, forced sign-out for deactivated accounts.
  - Shell: role-aware nav, unread badge, TH/EN, light/dark/system theme, reduce-motion, loading + error + empty states, mobile layout.
  - Pages: `/dashboard` (role-specific stats + my tasks), `/tasks` (directory with title-only private rows, create form mirroring server rules), `/tasks/[id]` (detail or title-only), `/notifications`, `/settings`, `/admin/users` (invite link shown once, revoke, role change, deactivate/reactivate with Auth ban, send reset email).
  - Shared query layer `src/lib/data/tasks.ts` (to be reused by the 3D scene).
- **Docs:** `docs/implementation-plan.md` (architecture, schema, permission matrix, UX flows/wireframes, 3D mapping, milestones A–E with acceptance), `docs/decisions.md`, this file, `README.md`.

### Verification (commands actually run)
| Command | Result |
|---|---|
| `npx supabase db reset` | ✅ both migrations + seed applied |
| `npx vitest run` | ✅ **51/51 passed** — `tests/db/rls.test.ts` 38 (PGlite), `tests/live/api.test.ts` 13 (local Supabase) |
| `npx tsc --noEmit` | ✅ no errors |
| `npx eslint .` | ✅ no problems |
| `npx next build` | ✅ 14 routes + proxy |
| `npm run check:bundle` | ✅ no server secret / `sb_secret_` / service_role JWT in `.next/static` |
| Browser (in-app, dev server) | ✅ member login; private task title-only in list and via direct URL; `/admin/users` denied for member; Admin created invite link; invitee rejected weak password (server-side), accepted with valid password, landed on dashboard; member created a private task via the form (due 17:00 BKK stored as 10:00 UTC; Director + Manager notified); TH→EN switch |

Acceptance A1–A7 (see plan §5): all covered by the tests above.

### Not done in Milestone A (by design / later milestones)
- Avatar/Pet/Skills onboarding steps (tables exist; editors in C/D).
- Realtime channels (B), meeting UI + inbox (B), review/archive flow (B), 3D scene (B).
- SMTP for production email (local uses Mailpit at http://127.0.0.1:55424).
- Not tested on a real iPhone or on Windows Edge; only the in-app Chromium browser.

### Issues found & fixed during A
1. GoTrue admin `createUser` writes `app_metadata` after the INSERT → invite trigger saw no invite id. Redesigned to token-in-user-metadata verified/hashed in DB (D-014). Caught by the live test.
2. `[auth.email] enable_signup=false` disables email login entirely in this GoTrue version → keep provider on, global sign-up off.
3. `next/font/google` unresolvable in Turbopack dev here → system Thai font stack (D-004).
4. PGlite OOM in Vitest forks pool on Windows → threads pool.

### Known limitations / risks
- No MFA (requirement) — recommend before production (D-019).
- Live tests leave a few rows (test users/tasks) in the local DB; `npx supabase db reset` restores the seed.
- Form fields reset after a failed server action (React 19 default); acceptable for now, revisit in UX pass.

### Next (Milestone B, prioritized)
1. Meeting create/edit + action items + Unassigned Inbox (count, age from `ends_at`) and `assign_action_item` RPC (atomic task creation + notifications).
2. Task lifecycle RPCs: `update_task_status`, `submit_task` (comment + attachment upload to `task-files`), `review_task` (approve → archive / request revision; Manager-owned → Director).
3. Realtime: private Broadcast channel per org with ids-only payloads + client refetch; leak test.
4. Basic R3F office scene (Director zone, Manager zone, 7 desks, clickable avatars → popover from `src/lib/data`), orbit/pan/zoom (mouse + touch), WebGL fallback.
5. Unassigned-item reminder job (24h cycles from meeting end, `dedupe_key`), with retry test.
