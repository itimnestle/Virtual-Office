#!/usr/bin/env bash
# Local backup/restore drill (LOCAL STACK ONLY — never point this at production).
#  1. adds a marker row so the restore cannot be confused with the seed
#  2. records row counts, dumps public + auth data (pg_dump, data only)
#  3. resets the database to migrations only (no seed) — an empty database
#  4. restores the dump and compares counts + marker
# Storage object BYTES are not part of a database dump (see docs/runbook.md).
set -euo pipefail
# Git Bash on Windows would rewrite container paths like /tmp/... — disable that.
export MSYS_NO_PATHCONV=1
DB=${DB_CONTAINER:-supabase_db_virtual-office}
PSQL="docker exec -i $DB psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -tA"
COUNTS="select string_agg(t || '=' || n, ' ' order by t) from (
  select 'auth.users' t, count(*) n from auth.users union all
  select 'profiles', count(*) from public.profiles union all
  select 'tasks', count(*) from public.tasks union all
  select 'task_assignees', count(*) from public.task_assignees union all
  select 'audit', count(*) from public.task_audit_logs union all
  select 'notifications', count(*) from public.notifications union all
  select 'meetings', count(*) from public.meetings union all
  select 'absences', count(*) from public.member_absences union all
  select 'avatars', count(*) from public.avatar_appearance) x;"

echo "== 1. marker"
MARKER="restore-drill-$(date +%s)"
$PSQL -c "insert into public.task_categories (org_id, name_th, name_en) values ('00000000-0000-4000-8000-000000000001', '$MARKER', '$MARKER');" >/dev/null

echo "== 2. counts before + dump"
BEFORE=$($PSQL -c "$COUNTS")
echo "before: $BEFORE"
docker exec "$DB" pg_dump -U supabase_admin -d postgres --data-only --disable-triggers \
  --schema=public --schema=auth --exclude-table=auth.schema_migrations -f /tmp/drill.sql
# The reset recreates the container, so keep the dump on the host.
mkdir -p .test-output && HOST_DUMP=".test-output/drill.sql"  # git-ignored
docker cp "$DB:/tmp/drill.sql" "$HOST_DUMP"
echo "dump bytes: $(wc -c < "$HOST_DUMP")"

echo "== 3. reset to an empty database (migrations only)"
npx supabase db reset --no-seed >/dev/null 2>&1
echo "after reset: $($PSQL -c "$COUNTS")"

echo "== 4. restore"
docker cp "$HOST_DUMP" "$DB:/tmp/drill.sql"
docker exec "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -f /tmp/drill.sql >/dev/null
AFTER=$($PSQL -c "$COUNTS")
echo "after:  $AFTER"
FOUND=$($PSQL -c "select count(*) from public.task_categories where name_en = '$MARKER';")
docker exec "$DB" rm -f /tmp/drill.sql
rm -f "$HOST_DUMP"

if [[ "$BEFORE" == "$AFTER" && "$FOUND" == "1" ]]; then
  echo "RESTORE DRILL: PASS (counts identical, marker restored)"
else
  echo "RESTORE DRILL: FAIL"; exit 1
fi
