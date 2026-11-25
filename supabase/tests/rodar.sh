#!/usr/bin/env bash
# Roda a bateria do banco num Postgres local (16+). Ex.: PGHOST=/var/tmp/pgrt PGPORT=54329 bash rodar.sh
# 1) recria o banco "rt", aplica o stub do Supabase e as migrations; 2) gera um backup com o rateio-v3.html real;
# 3) testes SQL; 4) devolve o export do banco ao rateio-v3.html e confere que nada se perdeu.
set -euo pipefail
cd "$(dirname "$0")"
OUT=${OUT_DIR:-$(mktemp -d)}
P="psql -U postgres -X -q -v ON_ERROR_STOP=1"
$P -d postgres -c "drop database if exists rt" -c "create database rt"
export PGDATABASE=rt
$P -f supabase-stub.sql
for f in ../migrations/*.sql; do echo "aplicando $(basename "$f")"; $P -f "$f"; done
node gerar-backup.cjs "$OUT/backup-v3.txt"
OUT_DIR="$OUT" node db.test.cjs "$OUT/backup-v3.txt"
node restaurar-no-v3.cjs "$OUT/backup-v3.txt" "$OUT/export-do-banco.txt"
