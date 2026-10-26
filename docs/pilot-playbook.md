# Pilot Test Playbook

**Goal:** run 3D Virtual Office for 2 weeks with one real team before company-wide rollout, and find what the automated tests cannot: unclear wording, workflow friction, device problems, and trust in the privacy rules.

**Where:** a **staging** project (see `docs/runbook.md`) — real people, but only non-confidential pilot work. Do not put real confidential HR/finance tasks into the pilot.

## 1. Participants

| Role | People | Device mix (record actual) |
|---|---|---|
| Admin | 1 (IT/HR, not a team member) | Windows Chrome |
| Director | 1 | Windows Edge **and** iPhone Safari |
| Manager | 1 (team lead) | Windows Chrome + iPhone |
| Members | 7 | at least 2 on iPhone Safari, 1 on Windows Edge, 1 on an older/low-end laptop |

Pilot owner: the Manager. Feedback collector: the Admin.

## 2. Setup (day 0, Admin)

1. Bootstrap the Admin (runbook §5), sign in, open **สถานะระบบ** — all jobs listed.
2. **จัดการบัญชี:** invite the Director, Manager and 7 Members into one team; set the Manager as team lead.
3. **ตั้งค่าองค์กร:** create 3–5 categories that match the team's work, a few tags, and company holidays for the pilot period.
4. Each person accepts the invite → sets password → nickname → avatar → pet → skills (`/me`). Record how long onboarding takes and any confusion.

## 3. Core scenario: meeting → assignment → review → archive

Run this with the whole team in the first week, timed.

| # | Who | Action | Expected | Pass/Fail | Notes |
|---|---|---|---|---|---|
| 1 | Manager | Create a meeting for today 10:00–11:00 with 4 action items (one marked private, one urgent) | Meeting saved; items appear in **Inbox** with age counting from meeting end | | |
| 2 | Manager | Open Inbox, use the suggestion panel, assign 2 items (one to two people) | Score breakdown visible and labelled "not AI"; tasks created; assignees notified; Inbox count drops | | |
| 3 | — | Leave 2 items unassigned for 24 h | Manager gets a reminder; reminders repeat every 24 h until assigned | | |
| 4 | Director | Assign an urgent task directly to a Member | Member sees it at once; Manager is notified | | |
| 5 | Member A | Start the task, add a checklist item, comment with @Manager | Status "กำลังทำ"; Manager gets a mention | | |
| 6 | Member A | Submit with a file (Thai filename) | Status "รอตรวจ"; Manager notified; file downloadable | | |
| 7 | Manager | Request changes with a reason | Member notified, status "ต้องแก้ไข" | | |
| 8 | Member A | Resubmit with the same filename | Only the newest version visible to the team; Admin sees older version | | |
| 9 | Manager | Approve | Task archived, read-only, no further actions | | |
| 10 | Everyone | Open `/office` during steps 5–9 | Avatar location and task state follow the workflow without reload | | |
| 11 | Manager | `/reports` → 30 days → export PDF and XLSX | Numbers match the task list; Thai readable; no ranking for the Manager | | |
| 12 | Admin | `/reports` | Ranking table visible; exports appear in audit log | | |

## 4. Blueprint critical QA scenarios

Fill in during the pilot. "Auto evidence" is what the automated suite already proves locally; the pilot confirms it with real people and devices.

| # | Scenario | Pilot steps | Auto evidence | Pass/Fail | Notes |
|---|---|---|---|---|---|
| 1 | Forgotten meeting task | Scenario step 3 | `tests/db/workflow.test.ts` (reminder cycles, dedupe), `/admin/health` job runs | | |
| 2 | Urgent direct task | Scenario step 4; Manager then changes the due date → Director notified | `tests/db/operations.test.ts` §2 | | |
| 3 | Leave collision | Member B records leave covering a due date | Manager notified; task unchanged; reason hidden — `operations.test.ts` §4 | | |
| 4 | Private task | Member C (not assigned) checks list, search, calendar, 3D popover, export, notifications for the private item | title only, everywhere — `tests/live/*` leak tests, `exports.test.ts` | | |
| 5 | Review and archive | Scenario steps 6–9 | `workflow.test.ts`, `operations.test.ts` §7 | | |
| 6 | Extension pending | Member D requests an extension; Manager approves one, rejects another | pending label, reminders paused; audit — `operations.test.ts` §3 | | |
| 7 | Anonymous chat | Members post anonymously; ask colleagues to guess the sender; Admin reveals one and checks that the lookup is in the audit log; verify the message is gone after 24 h | `tests/db/social.test.ts`, `tests/live/social.test.ts` | | |
| 8 | Cross-device | Same task/presence/schedule viewed on Windows Chrome, Windows Edge, iPhone Safari; rotate/zoom the 3D camera by touch and mouse | **no automated or real-device evidence yet** — this pilot is the first check | | |
| 9 | No fake AI | Ask participants what they think the suggestion panel is | UI text says rule-based; formula shown | | |

## 5. Daily checks during the pilot (Admin, 5 minutes)

- `/admin/health`: no failed runs; chat purge ran in the last 20 min; pending chat files near 0.
- Any support requests → log in the issue list below with device/browser.

## 6. Feedback (end of each week)

Short form for each participant (1–5 scale + comment):
1. I always knew what I had to do next.
2. I trust that private tasks stay private.
3. The 3D office helps me see the team's situation (or: I preferred the 2D view).
4. The app was fast enough on my device.
5. Notifications were useful, not noisy.
6. Anything confusing in Thai or English wording?

## 7. Exit criteria

- All rows in §3 and §4 pass, or have an accepted workaround.
- Zero confidentiality defects (any defect in scenario 4 or 7 stops the pilot until fixed and re-tested).
- Scenario 8 passes on at least one iPhone and one Windows Edge machine.
- No job failure left unexplained for more than 24 h.
- Median feedback ≥ 4 on statements 1, 2 and 4.

## 8. Issue log

| Date | Who / device | Page | What happened | Severity | Status |
|---|---|---|---|---|---|
| | | | | | |
