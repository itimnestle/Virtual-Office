#!/usr/bin/env bash
# Loads scripts/demo-data.sql into the LOCAL Supabase database (never production).
set -euo pipefail
export MSYS_NO_PATHCONV=1
DB=${DB_CONTAINER:-supabase_db_virtual-office}
docker exec -i "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q < "$(dirname "$0")/demo-data.sql"
