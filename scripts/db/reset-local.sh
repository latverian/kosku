#!/usr/bin/env bash
# Reset database PostgreSQL LOKAL (bukan Supabase) lalu jalankan migrasi.
# Pakai: DATABASE_URL=postgres://... pnpm db:reset-local
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL wajib diisi}"
case "$DATABASE_URL" in
  *localhost*|*127.0.0.1*) ;;
  *) echo "Menolak: db:reset-local hanya untuk database lokal." >&2; exit 1 ;;
esac
psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS drizzle CASCADE;
DROP SCHEMA IF EXISTS auth CASCADE;
CREATE SCHEMA public;
SQL
psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$(dirname "$0")/supabase-shim.sql"
pnpm drizzle-kit migrate
