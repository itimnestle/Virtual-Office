/**
 * In-process PostgreSQL (PGlite) harness that applies the real migrations and
 * seed on top of a minimal Supabase shim (roles, auth.users, auth.uid()).
 * Lets RLS/RBAC tests run anywhere without Docker. The live-API suite in
 * tests/live covers the real Supabase stack (GoTrue, PostgREST, Storage).
 */
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

const SUPABASE_SHIM = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema extensions;
create extension pgcrypto schema extensions;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  instance_id uuid,
  id uuid primary key,
  aud text, role text,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  banned_until timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  confirmation_token text, email_change text, email_change_token_new text, recovery_token text
);
create table auth.identities (
  id uuid primary key,
  user_id uuid references auth.users(id),
  provider_id text, identity_data jsonb, provider text,
  last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
);

create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
$$;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
`;

export const IDS = {
  org: "00000000-0000-4000-8000-000000000001",
  team: "10000000-0000-4000-8000-000000000001",
  admin: "20000000-0000-4000-8000-000000000001",
  director: "20000000-0000-4000-8000-000000000002",
  manager: "20000000-0000-4000-8000-000000000003",
  members: [11, 12, 13, 14, 15, 16, 17].map((n) => `20000000-0000-4000-8000-0000000000${n}`),
} as const;

export function migrationFiles(): string[] {
  const dir = path.join(ROOT, "supabase/migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(dir, f));
}

export async function createTestDb(opts: { seed?: boolean } = {}): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_SHIM);
  for (const file of migrationFiles()) {
    await db.exec(readFileSync(file, "utf8"));
  }
  if (opts.seed !== false) {
    await db.exec(readFileSync(path.join(ROOT, "supabase/seed.sql"), "utf8"));
  }
  return db;
}

type Row = Record<string, unknown>;

/**
 * Run statements as an authenticated API user (role `authenticated`, JWT sub
 * = userId) inside a transaction that is always rolled back unless `commit`.
 */
export async function asUser<T>(
  db: PGlite,
  userId: string | null,
  fn: (q: <R extends Row = Row>(sql: string, params?: unknown[]) => Promise<R[]>) => Promise<T>,
  opts: { commit?: boolean; role?: "authenticated" | "anon" } = {},
): Promise<T> {
  return db.transaction(async (tx) => {
    const role = opts.role ?? "authenticated";
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      userId ? JSON.stringify({ sub: userId, role }) : "",
    ]);
    await tx.exec(`set local role ${role}`);
    const q = async <R extends Row = Row>(sql: string, params: unknown[] = []) =>
      (await tx.query<R>(sql, params)).rows;
    const result = await fn(q);
    if (!opts.commit) await tx.rollback();
    return result;
  });
}

/** Expect a statement to fail with a message containing `fragment`. */
export async function expectError(p: Promise<unknown>, fragment: string): Promise<void> {
  try {
    await p;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes(fragment)) {
      throw new Error(`Expected error containing "${fragment}", got "${msg}"`);
    }
    return;
  }
  throw new Error(`Expected error containing "${fragment}", but statement succeeded`);
}
