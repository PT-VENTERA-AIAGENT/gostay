#!/usr/bin/env bash
# GoStay HMS — run the RLS regression test against a throwaway Postgres.
#
# The PRD listed "RLS never verified against live Postgres" as pending; this is
# that check. It builds a scratch cluster, applies migrations 001-005, and then
# tries to break them as a customer and as an anonymous visitor.
#
#   ./supabase/tests/run.sh
#
# Needs initdb/pg_ctl/psql on PATH (any local Postgres install; no Docker, no
# network, and it never touches an existing cluster — it makes its own on 55433).
set -uo pipefail

PORT="${PGPORT_TEST:-55433}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG="$DIR/../migrations"
TMP="$(mktemp -d)"
# Guards against a suite that aborts early and reports a vacuous success.
EXPECTED=30
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

echo "==> setup + migrations 001-005"
run_su "$DIR/setup.sql"
for f in 001_initial_schema 002_rls_policies 003_sso_identity 004_user_management 005_tighten_rls; do
  run_su "$MIG/$f.sql" || { echo "migration $f FAILED"; exit 1; }
done
run_su "$DIR/seed.sql"
run_su "$DIR/helpers.sql"

echo "==> attacks (as authenticator, not superuser)"
OUT="$(PGPASSWORD=pw psql -h 127.0.0.1 -p "$PORT" -U authenticator -d postgres -X -q -t -A -f "$DIR/attacks.sql" 2>&1 | grep -v '^{' | grep -v '^$')"
echo "$OUT"

echo
PASSES="$(grep -c 'pass' <<<"$OUT" || true)"
FAILS="$(grep -c 'FAIL' <<<"$OUT" || true)"
if [ "$FAILS" -gt 0 ]; then
  echo "RESULT: FAILED — $FAILS case(s) above"
  exit 1
fi
# A suite that asserted nothing must never report success: if the attack script
# dies early (a permission error, a typo), every check silently vanishes and
# zero failures looks identical to a clean run.
if [ "$PASSES" -lt "$EXPECTED" ]; then
  echo "RESULT: FAILED — only $PASSES checks ran, expected $EXPECTED (suite aborted early?)"
  exit 1
fi
echo "RESULT: all $PASSES checks passed"
