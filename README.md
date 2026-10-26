# 3D Virtual Office

Work assignment and tracking for real teams (Director, Manager, Members, Admin), with a 3D office as a visual layer over the same database as the dashboard. Not an AI-agent system.

- Requirements: `3D_Office_Implementation_Blueprint.md` (owner's document)
- Plan, schema, permission matrix, milestones: [`docs/implementation-plan.md`](docs/implementation-plan.md)
- Decisions: [`docs/decisions.md`](docs/decisions.md) · Progress: [`docs/implementation-progress.md`](docs/implementation-progress.md)

## Stack
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres + RLS, Auth, Storage, Realtime) · React Three Fiber + Three.js · Vitest + PGlite.

## 3D workspace

Open `/office` after signing in. The detailed office includes camera presets,
daylight/evening lighting, clickable people, searchable team directory, workload
details, and a 2D alternative. It uses the same authorized data as the rest of
the app. See [visual refresh notes](docs/office-visual-refresh.md) for interaction,
rendering details, and verification. Desktop, mobile, and sign-in previews are
saved in `artifacts/`.

## Local setup

Requirements: Node 20+ (tested on 24), Docker Desktop running.

```bash
npm install
```

```bash
npx supabase start -x vector,logflare,imgproxy,edge-runtime,supavisor
```

```bash
npx supabase db reset
```

Create `.env.local` from `.env.example`; `npx supabase status -o env` prints the local URL, publishable key and secret key. Then:

```bash
npm run dev
```

Open http://localhost:3000. Local Supabase Studio: http://127.0.0.1:55423 · Mailpit (reset emails): http://127.0.0.1:55424

### Synthetic seed accounts (local only)
All use password `VirtualOffice2026`: `admin@example.com`, `director@example.com`, `manager@example.com`, `member1@example.com` … `member7@example.com`. These are fake people for development; never seed real employee data.

### First Admin in a real environment
Insert one `invites` row with the service role (`role = 'admin'`, `invited_by = null`, `token_hash = sha256(token)`), then open `/invite/{token}`. After that, all accounts are created from the Admin screen.

## Checks

```bash
npm test
```
Runs DB security tests in PGlite (always) and live API tests against local Supabase (skipped if it is not running).

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm run build
```

```bash
npm run check:bundle
```
(after build) fails if a server secret ever appears in the browser bundle.

## Security notes
- Authorization is enforced in PostgreSQL (RLS + SECURITY DEFINER RPCs). UI hiding is never relied on.
- `SUPABASE_SECRET_KEY` is server-only; never prefix it with `NEXT_PUBLIC_`.
- No MFA in the current requirement — recommended before production.
- Do not deploy or run migrations against a hosted project without explicit approval and credentials.
