# Operations Runbook

Scope: deploying and operating 3D Virtual Office on **Vercel (Next.js)** + **Supabase (Postgres, Auth, Storage, Realtime, pg_cron)**.
Nothing in this document has been executed against a real staging or production project yet — every step below was exercised on the local stack only (see `docs/release-readiness.md`). Production deploys and migrations require explicit owner authorization.

## 1. Environments

| Environment | Supabase | App | Data |
|---|---|---|---|
| Local | `npx supabase start` (ports 554xx, see `supabase/config.toml`) | `npm run dev` | `supabase/seed.sql` synthetic users, password `VirtualOffice2026` |
| Staging | separate Supabase project | Vercel Preview (own env vars) | synthetic seed only — never copy production data |
| Production | separate Supabase project, region closest to Bangkok (e.g. `ap-southeast-1`) | Vercel Production | real employees |

Never point local scripts (`scripts/restore-drill.sh`, `db reset`) at a hosted project.

## 2. Environment variables

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel (all) | project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel (all) | publishable / anon key only |
| `NEXT_PUBLIC_SITE_URL` | Vercel (all) | canonical origin, used in invite and reset links |
| `SUPABASE_SECRET_KEY` | Vercel, **server only** | secret / service-role key. Used for invite acceptance, deactivation (auth ban), password-reset emails, chat-media purge, health page tombstone count |
| `CRON_SECRET` | Vercel, **server only** | ≥ 32 random chars; Vercel Cron sends it as `Authorization: Bearer …` |

`npm run check:bundle` fails the build if a secret key or `CRON_SECRET` value appears in client chunks. Run it in CI after `next build`.

## 3. Supabase project configuration (dashboard — not covered by migrations)

Mirror `supabase/config.toml`:
- **Auth → Sign In / Providers:** "Allow new users to sign up" **off** (accounts come only from invites; the DB trigger additionally rejects users without a valid invite token). Email provider on. Minimum password length 10.
- **Auth → URL configuration:** Site URL = `NEXT_PUBLIC_SITE_URL`; redirect allow-list = `https://<domain>/**` (and the staging/preview domains for staging only).
- **Auth → Email templates → Reset password:** paste `supabase/templates/recovery.html` (Thai/English, links to `/reset-password`).
- **Auth → SMTP:** configure a real SMTP provider. The built-in sender is rate-limited and not for production. SPF/DKIM on the sending domain.
- **Database → Extensions:** `pg_cron` enabled **before** migrations run, otherwise the migrations skip scheduling (they guard on the extension) and the jobs must be scheduled manually (§6).
- **Storage:** buckets `task-files` and `chat-media` and their policies are created by migrations — verify both exist and are **private**.
- **Realtime:** private channels only; migrations set up the broadcast authorization. No public channels.
- Point-in-time recovery / daily backups: see §8.

## 4. Deploying

1. **Migrations first, app second.** Migrations are additive and the app tolerates the previous schema for one deploy.
   ```bash
   npx supabase link --project-ref <ref>
   ```
   ```bash
   npx supabase db push
   ```
   Do **not** run `supabase/seed.sql` against production.
2. Regenerate types if the schema changed (`npx supabase gen types typescript --linked > src/lib/database.types.ts`) and commit.
3. Deploy the app: push to the production branch (Vercel builds with `next build`). `vercel.json` registers the Vercel cron for `/api/jobs/chat-purge`.
4. Smoke test (§10).

**Migration rules** (D-041): never edit a migration that has been applied to any shared environment; write a new one. Every migration must keep RLS enabled on new tables, revoke default grants, and come with a DB test in `tests/db`.

## 5. First Admin bootstrap (once per organization)

There is no bootstrap endpoint (D-015). With the service role (SQL editor in the dashboard):
1. Insert the organization row (`public.organizations`).
2. Generate a random token locally, store only its SHA-256 hex: insert `public.invites (org_id, email, full_name, role='admin', token_hash, invited_by=null, expires_at=now()+interval '2 days')`.
3. Open `https://<domain>/invite/<plaintext token>`, set the password. The trigger matches the token hash and creates the Admin profile.
4. The Admin invites everyone else from **จัดการบัญชี / Users**.

## 6. Scheduled jobs

| Job | Runner | Schedule (UTC) | What it does |
|---|---|---|---|
| `unassigned-meeting-reminders` | pg_cron | `5 * * * *` | reminds leads about unassigned meeting action items |
| `due-reminders` | pg_cron | `0 1 * * *` (08:00 BKK) | 7-day / due-date reminders |
| `recurrences` | pg_cron | `30 23 * * *` (06:30 BKK) | creates recurring task instances |
| `chat-purge` | pg_cron | `*/10 * * * *` | deletes expired chat rows, reactions, mention notifications; queues media paths |
| chat media purge | Vercel Cron → `/api/jobs/chat-purge` | `*/10 * * * *` | deletes queued media objects from Storage (needs `CRON_SECRET`) |

Check: `select jobname, schedule from cron.job;` must list the four pg_cron jobs. If `pg_cron` was enabled after migrating, re-run the `cron.schedule(...)` statements found in the migrations.

**Observability:** every job writes `public.job_runs` (also failures, recorded separately from the rolled-back transaction). The Admin page **สถานะระบบ / System health** (`/admin/health`) shows the last run per job, failures in the last 7 days and pending chat media. Daily check: no job older than 2× its interval, zero failures. Vercel cron failures are also visible in Vercel → Cron Jobs.

Note: Vercel Hobby plans only allow daily crons; the 10-minute media purge needs Pro, or move it to pg_cron + `pg_net` calling the route.

## 7. Key and secret rotation

- **`CRON_SECRET`:** set the new value in Vercel, redeploy. No downtime beyond one skipped run.
- **Supabase secret key:** create a new secret key in the dashboard → update `SUPABASE_SECRET_KEY` in Vercel → redeploy → revoke the old key. If you use legacy JWT keys, rotating the JWT secret signs everyone out.
- **Publishable key:** same procedure; old browser tabs will need a reload.
- After any suspected leak: rotate, then review `admin_audit_logs` and Auth logs.

## 8. Backups and restore

- **Database:** enable daily backups (Pro) and PITR if the budget allows. Retention per company policy.
- **Storage object bytes are NOT in database backups.** `task-files` must be backed up separately (e.g. a scheduled S3-compatible sync of the bucket). `chat-media` is intentionally not backed up (24 h content).
- **Chat retention disclosure:** chat is deleted from the live database within ~10 minutes after 24 h, but may survive in database backups until the backup retention ends. The chat panel shows this disclosure; HR/legal should approve the wording.
- **Restore drill (local):** `bash scripts/restore-drill.sh` — marker row → counts → `pg_dump` (public + auth, data only) → reset to an empty schema → restore → compare. Last result: PASS (2026-10-24). Run it after any migration that adds tables to `public`/`auth` (add them to the count list).
- **Hosted restore:** restore into a *new* project, re-apply dashboard config (§3), re-point a staging deployment, verify, then swap env vars. Never restore over production in place.

## 9. Data handling rules

- Private tasks: only titles leave the database for people who cannot open them (directory, search, exports, 3D). Any new read channel needs a leak test in `tests/live`.
- Exports are audited (`admin_audit_logs`, action `export`, with kind/format/row count/filters) and neutralize spreadsheet formulas.
- Anonymous chat sender lookup is Admin-only and audited; content is never written to the audit log.
- Deactivating a user = Admin action (auth ban + profile inactive); their tasks stay and must be reassigned.

## 10. Smoke test after deploy

1. Sign in as Admin → `/admin/health` loads, cron jobs listed.
2. Invite a test user to a staging-only address (staging only) → accept → `/me` onboarding.
3. Create a task, assign, submit, approve, archive.
4. Open `/office` — scene renders, private task shows title only for a non-member.
5. Send a chat message; check it appears for a second user.
6. Download a report as CSV/XLSX/PDF; Thai text readable; audit row written.
7. `curl -i https://<domain>/api/jobs/chat-purge` without the secret → 401.

## 11. Incidents

| Symptom | First checks |
|---|---|
| Nobody can sign in | Supabase status, Auth logs, Site URL/redirects, key rotation in progress? |
| Invite links fail | invite expired/revoked; `NEXT_PUBLIC_SITE_URL`; signup trigger errors in Postgres logs |
| No reminders | `/admin/health`, `cron.job_run_details`, `pg_cron` enabled |
| Chat older than 24 h visible | should be impossible (reads filter `expires_at`); check DB clock and `chat-purge` runs |
| Media not deleted | Vercel cron logs, `CRON_SECRET`, pending tombstones on `/admin/health` |
| Possible private-task leak | disable the channel (feature flag / revert), preserve logs, run `tests/live`, notify owner |
