#!/usr/bin/env bash
# Mode simulasi penuh: Kosku + simulator WhatsApp (Fonnte) & Midtrans, tanpa akun apa pun.
#
#   pnpm sim           jalankan (database simulasi dibuat otomatis bila belum ada)
#   pnpm sim --reset   kosongkan database simulasi lalu isi ulang data contoh
#
# Butuh PostgreSQL lokal. Tidak membaca/mengubah .env.local untuk hal yang diatur di sini:
# semua variabel diberikan lewat shell, dan Next.js tidak menimpa variabel shell.
set -euo pipefail
cd "$(dirname "$0")/../.."

SIM_DB="${SIM_DATABASE_URL:-postgres://${USER}@localhost:5432/kosku_sim}"
APP_PORT="${APP_PORT:-3000}"
SIM_PORT="${SIM_PORT:-3200}"
OWNER_EMAIL="pemilik@sim.kosku.local"
SECRETS=.data/sim.env

case "$SIM_DB" in
  *localhost*|*127.0.0.1*) ;;
  *) echo "Menolak: SIM_DATABASE_URL harus database lokal." >&2; exit 1 ;;
esac
command -v psql >/dev/null || { echo "psql tidak ditemukan. Pasang PostgreSQL dulu." >&2; exit 1; }

# Kunci simulasi tetap sama antar-jalan (link portal & NIK bergantung padanya).
mkdir -p .data
if [ ! -f "$SECRETS" ]; then
  {
    echo "PORTAL_SECRET=$(openssl rand -hex 32)"
    echo "CRON_SECRET=$(openssl rand -hex 32)"
    echo "NIK_ENCRYPTION_KEY=$(openssl rand -base64 32)"
    echo "FONNTE_WEBHOOK_SECRET=$(openssl rand -hex 16)"
  } > "$SECRETS"
fi
set -a
# shellcheck disable=SC1090
. "$SECRETS"
set +a

db_name="${SIM_DB##*/}"
admin_db="${SIM_DB%/*}/postgres"
fresh=0
if ! psql "$admin_db" -XAtc "select 1 from pg_database where datname='${db_name}'" | grep -q 1; then
  psql "$admin_db" -Xqc "create database \"${db_name}\""
  fresh=1
fi
if [ "$fresh" = 1 ] || [ "${1:-}" = "--reset" ]; then
  echo "▶ Menyiapkan database simulasi ${db_name}…"
  DATABASE_URL="$SIM_DB" bash scripts/db/reset-local.sh >/dev/null
  psql "$SIM_DB" -Xqc "insert into auth.users (email) values ('${OWNER_EMAIL}')"
  DATABASE_URL="$SIM_DB" SEED_OWNER_EMAIL="$OWNER_EMAIL" pnpm -s db:seed
fi
OWNER_ID=$(psql "$SIM_DB" -XAtc "select id from auth.users where email='${OWNER_EMAIL}'" | head -1)
[ -n "$OWNER_ID" ] || { echo "Akun pemilik simulasi tidak ada. Jalankan: pnpm sim --reset" >&2; exit 1; }

export DATABASE_URL="$SIM_DB"
export APP_URL="http://localhost:${APP_PORT}"
export NEXT_PUBLIC_SUPABASE_URL="" NEXT_PUBLIC_SUPABASE_ANON_KEY="" SUPABASE_SERVICE_ROLE_KEY=""
export KOSKU_DEV_PREVIEW_USER_ID="$OWNER_ID"
export FONNTE_TOKEN="sim-fonnte-token"
export FONNTE_API_URL="http://localhost:${SIM_PORT}/fonnte/send"
export MIDTRANS_SERVER_KEY="SB-Mid-server-SIMULASI"
export MIDTRANS_IS_PRODUCTION=false
export MIDTRANS_BASE_URL="http://localhost:${SIM_PORT}/midtrans"
export SIM_PORT

pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

node scripts/sim/server.mjs & pids+=($!)
pnpm -s next dev -p "$APP_PORT" & pids+=($!)

# Pengganti cron (Vercel/pg_cron): kirim antrean pesan tiap 30 detik.
(
  until curl -s -o /dev/null "$APP_URL/login"; do sleep 1; done
  while true; do
    curl -s -o /dev/null -H "Authorization: Bearer ${CRON_SECRET}" "$APP_URL/api/cron/send-messages" || true
    sleep 30
  done
) & pids+=($!)

cat <<EOF

  ┌────────────────────────────────────────────────────────────┐
  │  Kosku (mode simulasi)      $APP_URL
  │  Simulator WhatsApp         http://localhost:${SIM_PORT}
  │  Job harian (tagihan, denda, pengingat):
  │    curl -H "Authorization: Bearer \$CRON_SECRET" $APP_URL/api/cron/daily
  │    (CRON_SECRET ada di $SECRETS)
  └────────────────────────────────────────────────────────────┘

EOF
wait
