#!/usr/bin/env bash
# Bateria SQL do banco no CI (e localmente): Postgres 16+ limpo -> stub do Supabase -> migrations -> db.test.cjs.
# Usa um backup FIXO gerado pelo rateio-v3.html (só dados sintéticos), então não precisa do v3 nem de navegador.
# Ex.: PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres bash supabase/tests/ci.sh
set -euo pipefail
cd "$(dirname "$0")"
P="psql -U ${PGUSER:-postgres} -X -q -v ON_ERROR_STOP=1"
$P -d postgres -c "drop database if exists rt" -c "create database rt"
export PGDATABASE=rt
$P -f supabase-stub.sql
for f in ../migrations/*.sql; do echo "aplicando $(basename "$f")"; $P -f "$f" >/dev/null; done
OUT_DIR=$(mktemp -d) node db.test.cjs fixtures/backup-sintetico-v3.txt
