# Release Readiness — V1

**Status (2026-10-24): NOT ready for production.** All Milestones A–E are built and verified on the **local** stack, but there are blockers that need things only the owner can provide or authorize: a hosted staging deployment, real devices, production email/backups, and confirmation of a few business-rule assumptions. The project is not "complete" until §4 is cleared.

Evidence legend: **T** = automated test (file), **B** = checked by hand in the in-app browser (dev server, Chromium), **D** = documented only, **—** = no evidence.

## 1. Prompt E completion gates

| Gate | State | Evidence |
|---|---|---|
| No placeholders or demo-only mock actions in core flows | ✅ for the workflows, ⚠️ visually | All actions call real RPCs/RLS (T: `tests/db/*`, `tests/live/*`). The 3D avatars, pets and furniture are procedural placeholder models (labelled in the UI); subtasks/projects have a schema and API but no screens. |
| All role permissions verified at server/data level | ✅ | T: `tests/db/rls.test.ts`, `workflow`, `operations`, `extras`, `social`, `reporting` (RLS as each role); `tests/live/api.test.ts` through the real API |
| Critical QA scenarios documented with pass/fail and evidence | ✅ (local) | §3 below; real-people pass/fail columns in `docs/pilot-playbook.md` |
| All migrations reproducible on a fresh environment | ✅ local | `npx supabase db reset` from zero: 7 migrations + seed, every run of this milestone. Not yet applied to a hosted project. |
| Windows and iPhone 3D interactions tested, or caveat recorded | ⚠️ caveat recorded | Only Chromium on Windows and mobile-viewport emulation (B). **No physical iPhone Safari or Windows Edge test.** |
| Data deletion behaviour and backup caveat documented to Admin | ✅ | Chat panel disclosure (B), `docs/runbook.md` §8, `/admin/health` pending deletions (B) |
| Deploy only with explicit credentials and permission | ✅ respected | Nothing was deployed. |

## 2. V1 feature checklist

| Area | State | Evidence |
|---|---|---|
| Invite-only accounts, roles (Director/Manager/Member/Admin), deactivation | ✅ | T `rls.test.ts`, `api.test.ts`; B Milestone A |
| Password reset, Thai/English email template | ⚠️ built, not checked end-to-end | Pages + template + Admin "send reset email" exist; the email → link → new password round trip was not clicked through (local Mailpit at :55424). Production SMTP not configured |
| Meetings → Unassigned Inbox → assign (with 24 h reminders) | ✅ | T `workflow.test.ts`; B Milestone B |
| Task lifecycle: 8 states, submit, review, revision, archive (immutable) | ✅ | T `workflow`, `operations` §1/§7; B |
| Urgent direct assignment, extensions with reminder pause, leave collisions | ✅ | T `operations` §2–§4; B Milestone C |
| 7-day due reminders, recurrence (Bangkok dates) | ✅ | T `operations` §6, recurrence math |
| Calendar (today/week/month, mine/team), leave, holidays | ✅ | T `tests/unit/calendar.test.ts`; B |
| Comments + @mentions, checklists, tags, file versions (older = Admin only) | ✅ | T `extras.test.ts`, live Storage version test; B |
| Private-aware search and filters | ✅ | T `extras.test.ts` (filter-oracle cases); B |
| Rule-based assignment suggestions (explained, "not AI") | ✅ | T `operations`; B |
| Admin config: teams/leads, categories, tags, holidays | ✅ | B; audit gap for category/tag/team-name edits |
| 3D office: zones, state-based positions, directory, 2D alternative, WebGL fallback | ✅ functional / ⚠️ visual | T `office-state.test.ts`; B. Placeholder models; no presence or walk animation |
| Avatar + pet editors, onboarding flow | ✅ | T catalog sync (`social.test.ts`); B Milestone D |
| 24 h chat: stickers, images, reactions, @mentions, anonymous mode, Admin reveal (audited), purge | ✅ | T `social.test.ts` (DB + live, incl. Storage purge); B |
| Role-specific home view | ✅ | `/dashboard` differs for Admin / leads / Member (B) |
| Reports: tiles, status/category/hours bars, per-person table, time filters | ✅ | T `reports.test.ts`, `reporting.test.ts`; B |
| Ranking — Admin only | ✅ | T `reporting.test.ts`, `exports.test.ts`; B (Manager has none, Admin has it) |
| Exports CSV/XLSX/PDF, confidentiality, audit | ✅ | T `export-formats.test.ts`, `exports.test.ts` (member export redacted in all formats); B all 5 endpoints, Thai PDF viewed |
| Thai/English UI, light/dark, reduced motion, mobile layout | ✅ | B across milestones; reduced motion: CSS + static 3D emotes |
| Error boundary + loading state | ✅ | `src/app/(app)/error.tsx`, `loading.tsx`; 3D scene has its own loading/fallback |
| Job observability | ✅ | `/admin/health` (B) over `job_runs` (T in each job test) |
| Backup/restore drill | ✅ local | `bash scripts/restore-drill.sh` → PASS |
| Runbook, staging deployment guide, pilot playbook | ✅ D | `docs/runbook.md`, `docs/pilot-playbook.md` |
| M365/Outlook, AI meeting extraction | future-only by design | Interfaces only: `src/lib/integrations/contracts.ts` |

## 3. Blueprint critical QA scenarios (local evidence)

| # | Scenario | Result | Evidence | Still needs |
|---|---|---|---|---|
| 1 | Forgotten meeting task | PASS | T `workflow.test.ts` (24 h cycles from meeting end, dedupe on retry); B Inbox ages | real 24 h run on staging |
| 2 | Urgent direct task | PASS | T `operations.test.ts` §2 | — |
| 3 | Leave collision, no auto change | PASS | T `operations.test.ts` §4 (routing to Director for Manager work) | — |
| 4 | Private task: title only everywhere | PASS | T leak tests for API, search/filters, Storage, Realtime payloads, 3D snapshot, calendar, notifications, mentions, exports (`tests/live/*`, `extras`, `reporting`) | pilot check by a real member |
| 5 | Review and archive | PASS | T `workflow`, `operations` §7; B full flow | — |
| 6 | Extension pending | PASS | T `operations.test.ts` §3 + live; B | — |
| 7 | Anonymous chat + 24 h deletion | PASS | T `social.test.ts` (DB + live incl. media purge) | Vercel cron on a hosted project |
| 8 | Cross-device (Windows Chrome/Edge, iPhone Safari) | **NOT TESTED** | Chromium + mobile emulation only | physical devices — blocker B2 |
| 9 | No fake AI | PASS | UI copy + formula breakdown (B); no LLM call anywhere (`FUTURE_INTEGRATIONS_ENABLED = false`) | — |

### Security test matrix

| Attack path | Covered by |
|---|---|
| Sign-up without invite / reused or expired invite | DB trigger tests (`rls.test.ts`), live API |
| Role escalation (member edits role, team, other tasks) | RLS + column-grant tests per role |
| Private task details via API, search text, structured filters, comments, mentions | `extras.test.ts`, `operations` §5, live |
| Private files / old file versions via Storage signed URLs | live Storage tests (Milestones B/C) |
| Realtime payload content | live test: payload is exactly `{id, entity}` |
| 3D metadata | live snapshot test (no private detail) |
| Exports | `exports.test.ts` (CSV/XLSX/PDF), formula injection unit test |
| Anonymous chat identity | no table grants; feed has no sender; Admin reveal audited (DB + live) |
| Chat retention | read filter + purge + Storage policy + CHECK ≤ 24 h |
| Secret keys in client JS | `npm run check:bundle` (secret key + `CRON_SECRET`) |
| Cron endpoint | live: 401 without bearer |
| anon role executing functions | DB test: anon can execute no public function |
| Dependencies | `npm audit --omit=dev` → 0 (uuid override, D-095) |

Not covered: brute-force/rate limits of Supabase Auth (platform settings), MFA (not built), penetration test by a third party.

### Time zone
All business dates are Asia/Bangkok: reminders 08:00 BKK (`0 1 * * *` UTC), recurrences 06:30 BKK, due dates stored as timestamptz with Bangkok calendar logic (T recurrence and calendar tests, report `periodRange` tests). Server and DB run UTC.

## 4. Performance budget (measured 2026-10-24, `next build`)

| Item | Budget | Measured | State |
|---|---|---|---|
| 3D chunk (three + R3F + drei + scene), lazy | ≤ 300 KB gzip, once per session | **234 KB gzip** (2026-10-24, after the game redesign); post-processing is a separate **158 KB gzip** chunk loaded only in "best visuals" mode (D-107). Sign-in pages stay 2D | ✅ |
| All other client JS combined (27 files) | ≤ 350 KB gzip | **290 KB gzip** (≈ 945 KB raw); a page loads a subset | ✅ |
| 3D rendering | on-demand frames, no idle GPU loop | `frameloop="demand"`; emotes animate only while visible | ✅ by design, not profiled |
| Report / export query | < 1 s for one team | seed only (≈ 10 tasks) | ⚠️ not load-tested |

Not measured: real-device FPS, memory on iPhone, Lighthouse on a hosted URL, time to first 3D frame on a low-end laptop.

## 5. Critical blockers (must clear before production)

| # | Blocker | Owner action | Effort |
|---|---|---|---|
| B1 | No hosted staging deployment yet | provide a staging Supabase project + Vercel project and authorize; then follow `docs/runbook.md` §3–§4 and §10 | 0.5–1 day |
| B2 | No physical-device test (iPhone Safari, Windows Edge) — Blueprint QA 8 | run pilot scenario 8 on real devices; fix what breaks | 1–2 days incl. fixes |
| B3 | Production email: SMTP + sender domain (SPF/DKIM) | choose provider, add DNS records | 0.5 day |
| B4 | `task-files` Storage bytes are not in DB backups | schedule a bucket backup; decide retention | 0.5 day |
| B5 | Business-rule assumptions unconfirmed: D-065 (recurrence), D-083 (office location precedence), D-091 (on-time definition), D-072/D-071 | owner confirms or corrects | review |
| B6 | Pilot (`docs/pilot-playbook.md`) not run | run 2 weeks with one team on staging | 2 weeks |

## 6. Prioritized fixes after the blockers

1. **MFA for Admin** (and optionally leads) — D-019. High: the Admin can reveal anonymous senders and see every file version.
2. **External alerting** on job failures (e.g. a daily email to the Admin, or a Supabase/Vercel monitor) — today someone must open `/admin/health`.
3. **Admin audit** for category/tag/team-name changes (gap noted in Milestone C).
4. **Real 3D assets** (GLB avatars/pets/furniture) and walk/idle animations; presence (who is online).
5. **Subtask/project screens** (API exists).
6. **Load test** reports and `/tasks` search with ~5,000 tasks; add pagination beyond 300 results.
7. Vercel plan check: 10-minute cron needs Pro (or move media purge to pg_cron + pg_net).
8. Visual check of floating emotes and the pet "❗@" bubble on a visible GPU-backed window (not confirmed in the hidden pane).

## 7. How to re-verify locally

```bash
npx supabase db reset
```
```bash
npx vitest run
```
```bash
npx tsc --noEmit
```
```bash
npx eslint .
```
```bash
npx next build
```
```bash
npm run check:bundle
```
```bash
bash scripts/restore-drill.sh
```

Last run (2026-10-24): all green — 141/141 tests, 15 files.
