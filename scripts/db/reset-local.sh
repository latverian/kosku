#!/usr/bin/env bash
# Reset database PostgreSQL LOKAL (bukan Supabase) lalu jalankan migrasi.
# Pakai: DATABASE_URL=postgres://... pnpm db:reset-local
set -euo pipefail
# Ambil DATABASE_URL dari .env.local / .env bila belum ada di shell.
if [ -z "${DATABASE_URL:-}" ]; then
  for f in .env.local .env; do
    if [ -f "$f" ]; then
      line=$(grep -E '^DATABASE_URL=' "$f" | tail -1 || true)
      if [ -n "$line" ]; then DATABASE_URL="${line#DATABASE_URL=}"; break; fi
    fi
  done
fi
: "${DATABASE_URL:?DATABASE_URL wajib diisi (di .env.local)}"
export DATABASE_URL
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
