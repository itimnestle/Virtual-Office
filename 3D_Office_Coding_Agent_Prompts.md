# 3D Virtual Office — Coding Agent Prompts (Companion to Implementation Blueprint)

**Version:** 1.0  
**Source:** `3D_Office_Implementation_Blueprint.md`  
**Purpose:** ใช้สั่ง Claude Code / Cursor / Codex / AI Coding Agent ให้ลงมือพัฒนา Web App จริงแบบตรวจรับทีละ milestone  
**Product distinction:** ระบบบริหารงานของ **พนักงานจริง** ที่แสดงเป็นออฟฟิศ 3D — **ไม่ใช่** ระบบ AI Agents ทำงานแทนคน

> **วิธีใช้:** วางไฟล์ `3D_Office_Implementation_Blueprint.md` ใน root ของ repository หรือแนบให้ Coding Agent อ่าน แล้วคัดลอก **Prompt 0** เริ่มต้นหนึ่งครั้ง หลังจากนั้นใช้ Prompt A–E ทีละ milestone ตามสถานะงานจริง ถ้า Agent มีขอบเขตบริบทจำกัด ให้แนบทั้งสองไฟล์ในแต่ละ session และระบุ milestone ที่ทำอยู่

---

## Prompt 0 — Master Implementation Prompt (เริ่มโปรเจกต์)

```text
คุณคือ Principal Full-Stack Engineer, Solutions Architect, 3D Web Engineer และ QA Lead ที่รับผิดชอบสร้างระบบ "3D Virtual Office" แบบ production-minded ให้ใช้งานกับคนจริง

SOURCE OF TRUTH
1. อ่านไฟล์ 3D_Office_Implementation_Blueprint.md ทั้งไฟล์ก่อนทำอะไร
2. Requirement ที่ระบุว่า Confirmed ต้องรักษาความหมายและขอบเขตตามต้นฉบับ
3. Proposed Technical Design คือข้อเสนอเชิงเทคนิค ให้ปรับได้เมื่อมีเหตุผลชัดเจน แต่ต้องบันทึกความต่าง
4. หาก Blueprint ขัดกับโค้ดปัจจุบัน ให้ตรวจสอบและรายงาน impact พร้อมเลือกวิธี migration แบบไม่ทำลายข้อมูล
5. ไม่ตีความ 'Agent Visualizer' ว่าเป็น AI Agent Workforce — นี่คือระบบแจกและติดตามงานให้พนักงานจริง

GOAL
สร้าง Web Application ที่คนจริง login เข้ามาดูและจัดการงานได้ โดยใช้ฉากออฟฟิศ 3D เป็น visual layer ของข้อมูลเดียวกันกับ Dashboard ภายใต้ database, authorization, business workflows, realtime และ scheduled jobs ที่ใช้งานได้จริง

CORE USER ROLES
- Director: ดูภาพรวม แจกงานด่วนให้สมาชิกได้โดยตรงพร้อมแจ้ง Manager และตรวจงานของ Manager
- Manager: แจกงานสมาชิก ตรวจทุกงานที่สมาชิกส่ง ขอแก้/อนุมัติ จัดการ workload และคำขอเลื่อน
- Member: สร้างงานได้เองและแจ้ง Director/Manager, อัปเดต/ส่งงาน/ขอเลื่อน ดูงานทั่วไปของทีม
- Admin: บุคคลแยกต่างหาก จัดการบัญชี ทีม หมวด สิทธิ์ งานลับ และประวัติ
- เริ่มต้นด้วย Director 1, Manager 1, Members ~7 และ Admin แยก แต่ database ต้องขยายเป็นหลายทีมและหลาย Manager ได้

MANDATORY BUSINESS RULES
1. เส้นทางงานปกติ Director → Manager → Member; งานด่วน Director → Member โดย Manager ได้รับ notification
2. ทุกคนสร้างงานได้; งานที่ Member สร้างเริ่มทำได้ทันทีและแจ้งหัวหน้าทั้งสองระดับ
3. หนึ่ง Task มีหลาย assignee และหลาย primary co-owner ได้; รองรับ subtasks และ projects
4. สถานะหลักมีเพียง 8: not_started, in_progress, blocked, in_review, revision_required, completed, paused, cancelled
5. ป้าย 'งานใหม่วันนี้', 'รออนุมัติเลื่อนกำหนด', 'รอเธอกลับมาทำงานนะ 😏' เป็น derived labels ไม่ใช่สถานะหลัก
6. Member ส่งตรวจให้ Manager ทุกครั้ง; งานที่ Manager รับผิดชอบต้องให้ Director ตรวจ; อนุมัติแล้ว Archive ทันทีและอ่านอย่างเดียว
7. กำหนดส่ง ผู้รับผิดชอบ และความสำคัญเปลี่ยนผ่านสิทธิ์/approval ตาม Blueprint; เก็บ audit trail ที่สำคัญ
8. Meeting มีชื่อ/เวลา/ผู้เข้าร่วม/สรุปข้อความ/ไฟล์/action items; สมาชิกไปประชุมแทนบันทึกได้ แต่งานยังรอหัวหน้าแจก
9. Unassigned Meeting Inbox แสดง action items ที่ยังไม่แจก; ส่ง reminder ทุก 24 ชั่วโมงจาก meeting end time จนแจกหมด โดยไม่ส่งซ้ำในรอบเดียว
10. Reminder กำหนดส่ง เริ่มเตือนวันละครั้งตั้งแต่เหลือ 7 วันจนถึงวันครบกำหนด (รองรับ override รายงาน); คำขอเลื่อนที่รออนุมัติพัก reminder ชั่วคราว
11. Leave ได้ล่วงหน้า/หลายวัน/ครึ่งวัน โดยไม่ต้อง approval; ทุกคนเห็นว่าไม่อยู่ แต่เหตุผลเห็นได้เฉพาะเจ้าตัวและ role ที่ได้รับสิทธิ์
12. เมื่อ deadline ชน leave ให้ Manager ตัดสินใจเลื่อนหรือโอนเอง ห้ามระบบแก้ให้อัตโนมัติ
13. แนะนำคนรับงานแบบ rule-based พร้อมคำอธิบายจากภาระงาน/ความถนัด/ขนาดงาน/ชั่วโมงประมาณการ/วันหยุด และ Manager ตัดสินใจเอง; ห้ามอ้างว่าเป็น AI/ML เมื่อไม่ได้ทำ
14. Private task: ผู้ไม่มีสิทธิ์เห็นได้เฉพาะหัวข้อ ห้าม leak description/comment/attachment/URL/query/export/realtime/3D tooltip
15. Invite-only login: Admin เชิญสมาชิก ตั้ง password เอง; deactivated user ยังเก็บ task/history; อย่าให้ Admin เห็น plaintext password; reset ผ่าน token ที่ปลอดภัย
16. 3D Office Cute low-poly hybrid: desktop + mobile, pan/orbit/zoom, Director room, Manager desk, member dual-monitor desks, meeting room, lounge/game area, unassigned board, leave-at-home visual
17. Avatar customization: face/eyes/nose/mouth/skin/hair/outfit/shoes/glasses/accessories; Dog/Cat pets: breed/color/outfit/name/sound toggles, mention reaction
18. Social chat: single room, anonymous option (identity available ONLY to Admin), text/stickers/GIF/images/reactions, floating 3D emotions; delete content/media at 24h, protect privacy; don't promise immediate removal from retained backups if technically untrue
19. Dashboard/calendar/reports/search/exports, TH/EN, light/dark, reduce motion, web-only notifications in V1; future integration slots for M365/Outlook and AI, but DO NOT implement those V1 integrations
20. Do NOT add percent progress or actual time tracking; work hours are Monday–Saturday 08:00–17:00, timezone Asia/Bangkok, store timestamps in UTC
21. V1 includes all confirmed features including 3D + customization + pets + chat. Milestones are order of implementation, NOT removal of V1 scope.

RECOMMENDED STACK (check compatibility with existing repo first)
- Next.js App Router + TypeScript
- Tailwind CSS + shadcn/ui for functional 2D surfaces
- Three.js + React Three Fiber + Drei for 3D scenes
- Blender exported optimized GLB/glTF assets (temporary procedural primitives acceptable ONLY during incremental milestones, mark as placeholder)
- Supabase PostgreSQL + Auth + RLS + Storage + Realtime
- Scheduled server jobs/Supabase Cron with idempotency and observability
- Hosting target Vercel + Supabase; do not deploy without authorization and credentials

ENGINEERING NON-NEGOTIABLES
- Database is source of truth; 3D and Dashboard display the SAME authenticated data
- Server-side role authorization + RLS; deny by default; never rely on hide/show UI for secrecy
- Organization/team scoping, future multi-team support, private files via signed scoped access
- Atomic task review/approval/archive/notification changes; concurrency-safe where appropriate
- Migrations and seed data must be reproducible; seed synthetic users/tasks, never real secrets or employee records
- UTC persistence and Asia/Bangkok timezone conversions; test edge dates and recurrence
- Cron reminder jobs idempotent: persist unique dedupe keys and avoid repeat alert spam
- Chat retention: expiry visibility immediately; async deletion of DB rows and all media objects; disclose backup retention limitation
- Keep anonymous user IDs out of public Realtime messages/API DTOs/logging; only Admin gets authorized identity lookup
- Validate inputs, secure file MIME/size, avoid arbitrary external URL fetching, sanitize user content, protect against XSS/CSRF as appropriate
- Honor no-MFA requirement in current spec, but record security risk and recommend optional MFA before production
- Respect reduced-motion and mobile performance fallback; allow 2D usable workflow if 3D fails, WITHOUT eliminating 3D support on iPhone
- Do not fabricate test results or claim production readiness before verification

WORK MODE — INSPECT, PLAN, IMPLEMENT, VALIDATE
Step 1) Inspect repo first: README, directory, package.json, lockfile, existing services, migrations, auth, env vars, tests, git status. Don't overwrite existing working code.
Step 2) Read Blueprint. Create docs/implementation-plan.md with milestone A–E backlog, feature-to-acceptance mapping, dependencies, risks and definition of done. Add docs/decisions.md for decisions/assumptions.
Step 3) Propose concrete app architecture and DB schema: tables, FK/indexes, task transition guards, approval rules, multi-assignee model, RBAC/RLS matrix, realtime access, 3D state mapping, storage strategy.
Step 4) Implement immediately from Milestone A in small complete vertical slices. First usable demo = Meeting → Unassigned Inbox → Assign Task → Member Submit → Manager Approve → Archive, with clickable 3D avatar showing the same task status.
Step 5) After EACH slice, run relevant lint, typecheck, unit/integration/e2e/security tests available in the repo. Fix failures. Add tests if missing; be transparent about not-run tests.
Step 6) Continue according to milestones, but do not conflate unfinished features with 'done'. Do not substitute static mocks for the finished business flow.

PROGRESS OUTPUT REQUIRED AT END OF EACH RESPONSE
- Completed: file-level summary / endpoints / DB migrations / screen features
- Verification: exact commands run and pass/fail/blocked results
- Not completed: feature checklist with blockers
- Risks/decisions: especially RLS/private-task, idempotency, 3D performance, backups
- Next: 3–5 prioritized executable development tasks

IMPORTANT EXECUTION RULES
- If this is an empty repo, scaffold the project; if it exists, extend instead of rewriting.
- Create .env.example with placeholder keys, setup docs, seed scripts and local run commands.
- Never expose service-role keys to frontend, never hardcode credentials, never silently push/deploy/migrate production DB.
- Don't ask repeated questions about requirements already covered in Blueprint. Ask only if missing answer blocks execution or has irreversible business impact; otherwise document a reasonable assumption and proceed.
- Do not claim milestone complete until its acceptance tests truly pass.
- Do not promise to run jobs later; perform currently possible work in this environment.

BEGIN NOW:
1. Read the source Blueprint and inspect repository.
2. Summarize architecture and gap against repo in concise form.
3. Create implementation tracking documents.
4. Implement Milestone A (or continue the partially completed milestone) and run checks.
5. Report changed files, passed/failed checks, blockers and next concrete steps.
```

---

## Prompt A — Foundation, RBAC, Migration, Authentication

```text
Continue project 3D Virtual Office using 3D_Office_Implementation_Blueprint.md and docs/implementation-plan.md. Execute Milestone A only; don't jump to later features if A isn't verified.

Deliver:
- Next.js TypeScript app setup only if absent; consistent UI shell/layout for Director/Manager/Member/Admin
- Supabase schema migrations for organization/team/users/roles/skills/projects/tasks/task_assignees/meetings/action items/notifications/absences/social profile, with FK/indexes and multi-team-ready design
- Task permissions matrix expressed as server checks + RLS policies; private task unrelated member receives ONLY title from a carefully designed projection/authorized function, not full row access
- Admin invitation onboarding, secure password reset flow and inactive employee retention
- Synthetic seed users Director 1, Manager 1, Members 7, Admin 1; seed sample tasks including private and urgent
- Minimal TH/EN UI shell, auth forms, role-aware navigation, loading/empty/error states
- Tests for cross-role/cross-team access, private tasks, invite-only, unauthorized admin action, deactivated users
- .env.example and README instructions to initialize locally; do not need actual production keys to produce migrations/code

Definition of done:
1. Role-aware login and basic pages work against local/test backend.
2. Authorized members cannot extract confidential task details through direct DB/API/realtime or file URLs.
3. Migrations and tests run reproducibly.
4. No credential or service role key in client bundle.

Before editing, inspect existing files. After changes provide exact command/test output summary, modified files, unresolved issues and the next Milestone B plan.
```

---

## Prompt B — First End-to-End Workflow + 3D Vertical Slice

```text
Implement Milestone B of 3D Virtual Office, using the Blueprint as source of truth. Do not build a static-only scene. Integrate the real workflow with the real DB.

Implement end-to-end:
- Create meeting with end time, notes, participants and 3 action items
- Meeting Action Inbox shows unassigned items, age from meeting end, counter and action to assign
- Director/Manager assigns an item into an actual Task; tasks visible in relevant member workspace; show role-based notifications
- Member views task, updates, submits for review with attachment or comment
- Manager approves or requests revision; approved task is archived immutable; Manager-owned tasks go to Director for approval
- App UI shows per-role inbox, basic task list and status, sync via Realtime
- A BASIC but functional cute low-poly 3D office scene rendered in the app; 1 Director zone, 1 Manager zone, 7 desks and clickable member avatars (temporary simple meshes okay with placeholder markers)
- Clicking an avatar opens an authorized task/status popover from the same DB query layer as dashboard
- Camera orbit/zoom/pan works with mouse and touch; render graceful fallback UI if 3D unsupported

Mandatory automated test paths:
A. Meeting ended 24h ago with 3 items, 1 assigned → remaining 2 in Inbox and ONE idempotent pending reminder per scheduled cycle.
B. Normal member task submit → Manager review → Archive; file and audit state recorded atomically.
C. Manager task → Director review.
D. Private task via avatar cannot leak detail to unrelated member.
E. Change task state from 2D updates 3D as expected.

Do not declare B completed if 3D is disconnected from data or actions are mocked. Report screenshot/manual test steps, failed checks and exact files touched.
```

---

## Prompt C — Full Operational Workflows

```text
Implement Milestone C: enterprise-reliable task operations and scheduling according to Blueprint. Inspect repo, avoid duplicate schema/endpoints and extend existing code.

Implement:
- 8 task states with guarded transitions and separate computed badges; owners/co-owners/subtasks/projects/categories/priorities/size/estimated hours/checklists/tags
- Urgent Director→Member path with automatic Manager notice and audit
- Task change/extension requests, approval/rejection, temporary reminder pause, Director notification on urgent changes
- Multi-user comments/@mentions, file uploads and versions (newest normal users; older versions Admin only), immutable archive
- Recurrence daily/weekly/monthly/yearly/custom; safe timezone conversion, recurrence uniqueness
- Member absences full-day/multi-day/half-day, privacy of absence reason, Manager-only conflict actions
- Calendar Today/Week/Month/Mine/Team and filters; web inbox, scheduled 7-day due reminders, 24h meeting inbox reminders, idempotent job runs
- Rule-based assignment recommendations with workload score explained to human (not AI); no forced assignment or stealth reassignment
- Teams, categories, configurable tags and policies in Admin area
- Search + filter respecting private fields and organization boundaries

Test:
1. 8 states and invalid transition rejection.
2. Urgent assignment notification path.
3. Due date extension pending suspends relevant reminders; approval/rejection returns correct state.
4. Leave collision never automatically changes due date/assignee.
5. Private task confidentiality across REST/server actions, search, file link and realtime.
6. Cron retry does not send duplicate reminders.
7. Archived records stay immutable.

At end report statuses, tests and any business rule assumptions still open.
```

---

## Prompt D — Full 3D World, Avatar, Pet, Ephemeral Social

```text
Implement Milestone D: full 3D and gamification as CONFIRMED V1 requirements. Preserve working task workflows and use ONE common state/query layer for 2D and 3D.

Build 3D world in cute low-poly hybrid style:
- Director room, Manager zone, 7 dual-monitor desks, meeting room, lounge/game room, unassigned task board, leave-at-home display
- Scene camera orbit/pan/zoom and interaction on Windows desktop and iPhone Safari; touch targets/mobile controls and performance settings
- Character location represents work/meeting/outside/leave states; click character to open authorized detail about workload, next due date, personal calendar
- Avatar appearance controls: skin/face/eyes/nose/mouth/hair/hair color/top/bottom/shoes/glasses/accessories with interchangeable mesh/material, persistent DB data
- Pets: Dog/Cat, breed/color/outfit/name/sounds and mute; notifications limited to @mention as specified
- Single office social chat with named/anonymous posts, emoji/emotion/reactions/stickers/GIF/images; anonymous real user ID Admin-only; remove all chat content after 24h including uploaded media with scheduled cleanup, TTL-safe read path
- Floating reaction effects, sound/notification/motion toggles, light/dark and reduced-motion support

Asset discipline:
- If real GLB assets aren't provided, use clearly labeled procedural or open-license placeholders, keep swap-ready asset pipeline; don't claim final artwork is complete.
- Use instancing/shared materials, compressed GLB if available, lazy load and throttle offscreen 3D work; preserve 2D task accessibility on lower-end devices.
- Never send private task info in 3D labels, preload bundles, scene metadata, sockets or tooltips.

Test desktop Chrome/Edge + iPhone Safari or available browser emulation, then document what cannot be truly device-tested. Test anonymous chat member/Admin visibility and post-expiry read prohibition + media purge process.
```

---

## Prompt E — Reports, Security, Performance, Production Readiness

```text
Implement Milestone E and audit all V1 acceptance criteria against the Blueprint and implementation-plan checklist. This is a completion and hardening milestone, not permission to skip unfinished A–D.

Deliver:
- Role-specific home views, task/team stats, aggregate counts, status/category/assignee/timeliness graphs and estimated-hours visualization
- Ranking view ADMIN only; per-person aggregate metrics for all users where authorized
- Time filters and searchable data with private-task-aware results
- Export Excel/CSV/PDF respecting task confidentiality, file permissions and role scope
- Full Thai/English UI, light/dark/reduced motion, desktop and mobile responsiveness
- Performance budget for 3D, lazy loading, error boundaries and accessible 2D fallback for users with unsupported hardware
- Security testing: auth, RLS, API, private file signed links, anonymous chat identity, no role key leaks, data retention and any import/export attack paths
- Job observability, backup/restore drill, time zone checks, database migrations, operational runbook, staging deployment instructions
- Pilot test playbook for 1 Director, 1 Manager, 7 Members and separate Admin; include sample meeting→assignment→review→archive scenario
- Future-only extension contracts for Microsoft 365/Outlook and optional AI meeting extraction, DO NOT actually integrate external apps or spend LLM tokens on production flows in V1

Completion gates:
- No placeholders or demo-only mock actions in core flows
- All role permissions verified at server/data level
- Critical QA scenarios documented with pass/fail and evidence
- All migrations reproducible on fresh environment
- Windows and iPhone 3D interactions tested or outstanding device caveat explicitly recorded
- Data deletion behavior and backup caveat documented to Admin
- Deploy only when explicit credentials and permission are available

Output a release-readiness checklist with critical blockers and prioritized fixes. Never mark the project 'complete' unless all committed V1 features are demonstrably working.
```

---

## Prompt QA — Independent Review After Any Milestone

```text
Act as an adversarial QA engineer and security reviewer. Inspect code and the 3D_Office_Implementation_Blueprint.md. Do not assume agent claims are true.

1. Compare implementation with every relevant Confirmed requirement for the currently claimed milestone.
2. Trace a real end-to-end path at API, DB, UI and 3D layers, not only visual mock.
3. Try to access confidential task fields as unrelated Member via every channel including Realtime, export, search, storage URLs and 3D metadata.
4. Verify Director/Manager/Member/Admin behavior, invite-only account paths, audit and archive immutability.
5. Test retry/concurrent approval behavior and scheduled notification deduplication.
6. For ephemeral chat, test anonymous identity protection and deletion after 24h of text AND media; explicitly state backup-retention limitations.
7. List failed tests, line-level references, security risks and recommended patch sequence. Do not silently change business requirements.

Return a severity-sorted report: Critical, High, Medium, Low, plus reproducible steps and concrete acceptance checks.
```

---

## Prompt UX — Optional: Design Specification Before Complex 3D Changes

```text
Act as Product Designer + 3D UX Lead. Read the Blueprint; create a minimal, friendly, playful 3D office design specification, but preserve the real work management workflow.

Deliver the IA and wireframe-level interaction details for:
1) role dashboard, 2) 3D office overview, 3) avatar popover, 4) meeting/unassigned inbox, 5) task details/review flow, 6) calendar/absence, 7) avatar/pet editor, 8) social chat, 9) admin settings.

Include mobile interaction patterns, Thai copy, accessibility, state-to-animation mapping, private-task redaction, graceful loading/error/empty states, performance constraints and actionable components. Do not substitute an image mockup for source code or pretend a proposed design has been implemented.
```

---

## Compact milestone checklist / Human acceptance tests

| Milestone | Human demo required | Must pass before moving on |
|---|---|---|
| A: Foundations | Invite + login as 4 roles; create private task | Cross-role RLS/API protection; schema migrations; synthetic data |
| B: Vertical slice + basic 3D | Meeting → 3 items → assign 1 → submit → review → archive; click avatar and see exact same DB task | Review/Archive transaction, unassigned count, 3D real-data link |
| C: Operations | Urgent task, leave overlap, extension, recurrence, scheduler, comments | No auto reassign on leave; correct reminders; confidential search/storage |
| D: 3D/full social | Avatar + pet + 3D rooms + chat anonymous + expired purge, touch on phone | Low-motion/mobile usability; Admin-only identity; deletion policy |
| E: Release | Role views, reports, export, full end-to-end pilot | Performance, privacy, security, migration, restore, monitoring |

## Operating guidance

**Suggested development loop:** Start with Prompt 0. If working in short coding sessions, use Prompt A, then B, C, D, E; follow each with Prompt QA. Save the Coding Agent's evidence in `docs/implementation-progress.md` and any architectural decisions in `docs/decisions.md`. The original Blueprint remains the requirement source.

**Ownership:** End-user account and cloud keys are managed by owner; Coding Agent may prepare code and local configuration but must never claim a real deployment without an explicit action and verification.

**Scope caveat:** First release includes all confirmed features, but completion estimates depend on actual repo state, art assets, testing access, and availability of hosting credentials. Do not promise a fixed delivery date from a prompt alone.
