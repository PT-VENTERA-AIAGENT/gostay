#!/usr/bin/env bash
# GoStay HMS — run the balance/payout ("tarik saldo") trigger regression against
# a throwaway Postgres. Sibling of run.sh (which covers RLS). It builds a scratch
# cluster, applies migrations 030 + 031 VERBATIM on top of minimal stand-ins, and
# walks a hotel's money through income → payout → reject → refund → guard.
#
#   ./supabase/tests/run_balance.sh
#
# Needs initdb/pg_ctl/psql on PATH. Never touches an existing cluster — it makes
# its own on 55434 (distinct from run.sh's 55433, so both can run at once).
set -uo pipefail

PORT="${PGPORT_TEST:-55434}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG="$DIR/../migrations"
TMP="$(mktemp -d)"
# Guards against a suite that aborts early and reports a vacuous success.
EXPECTED=63
trap 'pg_ctl -D "$TMP/pgdata" stop -m immediate >/dev/null 2>&1; rm -rf "$TMP"' EXIT

echo "==> initdb ($TMP)"
initdb -D "$TMP/pgdata" -U postgres -A trust --encoding=UTF8 >"$TMP/init.log" 2>&1 || { cat "$TMP/init.log"; exit 1; }
pg_ctl -D "$TMP/pgdata" -o "-p $PORT" -l "$TMP/pg.log" start >/dev/null 2>&1
for _ in $(seq 1 30); do
  psql -h 127.0.0.1 -p "$PORT" -U postgres -c 'select 1' >/dev/null 2>&1 && break
  sleep 1
done

export PGOPTIONS='--client-min-messages=warning'
run_su() { psql -h 127.0.0.1 -p "$PORT" -U postgres -q -v ON_ERROR_STOP=1 -f "$1"; }

echo "==> roles + prereqs + migrations 030, 031, 032, 036, 055–058"
run_su "$DIR/setup.sql"          # roles (authenticated/anon/service_role) + auth stub
run_su "$DIR/balance_prereq.sql" # enum/helpers + FK-target stand-ins
run_su "$MIG/030_payment_gateway.sql" || { echo "migration 030 FAILED"; exit 1; }
run_su "$MIG/031_hotel_balance.sql"   || { echo "migration 031 FAILED"; exit 1; }
run_su "$MIG/032_hotel_payment_mode.sql" || { echo "migration 032 FAILED"; exit 1; }
run_su "$MIG/036_platform_fee_7pct.sql" || { echo "migration 036 FAILED"; exit 1; }
# 055 mengganti credit_hotel_balance() dengan versi yang memakai tarif per hotel
# (0% untuk hotel langganan), jadi yang diuji di bawah adalah versi terbaru.
run_su "$MIG/055_billing_mode_subscription.sql" || { echo "migration 055 FAILED"; exit 1; }
# 056 menambah jejak invoice Xendit pada tagihan langganan; diuji di sini karena
# pelunasannya TIDAK BOLEH menggerakkan saldo hotel.
run_su "$MIG/056_subscription_online_payment.sql" || { echo "migration 056 FAILED"; exit 1; }
run_su "$MIG/057_subscription_gateway_note.sql" || { echo "migration 057 FAILED"; exit 1; }
# 058: buku pembayaran + gerbang tunggakan. Diuji di sini karena status tagihan
# kini DITURUNKAN dari buku itu, dan saldo hotel tetap tidak boleh tersentuh.
run_su "$MIG/058_subscription_payment_log_and_gate.sql" || { echo "migration 058 FAILED"; exit 1; }
run_su "$DIR/helpers.sql"        # tests.eq / tests.blocked / tests.allowed

echo "==> balance/payout flow"
OUT="$(psql -h 127.0.0.1 -p "$PORT" -U postgres -X -q -t -A -f "$DIR/balance.sql" 2>&1 | grep -v '^$')"
echo "$OUT"

echo
PASSES="$(grep -c 'pass' <<<"$OUT" || true)"
FAILS="$(grep -c 'FAIL' <<<"$OUT" || true)"
if [ "$FAILS" -gt 0 ]; then
  echo "RESULT: FAILED — $FAILS case(s) above"
  exit 1
fi
if [ "$PASSES" -lt "$EXPECTED" ]; then
  echo "RESULT: FAILED — only $PASSES checks ran, expected $EXPECTED (suite aborted early?)"
  exit 1
fi
echo "RESULT: all $PASSES checks passed"
