#!/usr/bin/env bash
# สำรองด้วยมือ (ปกติ container "backup" สำรองให้อัตโนมัติ) — ไฟล์อยู่ deploy/backups/
# กู้คืน: gunzip -c backups/db-YYYYmmdd-HHMM.sql.gz | docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" lineup'
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
mkdir -p backups
TS=$(date +%Y%m%d-%H%M)
docker compose exec -T db sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --no-tablespaces lineup' \
  | gzip > "backups/db-$TS.sql.gz"
docker compose exec -T app tar -czf - -C /app uploads > "backups/uploads-$TS.tar.gz" 2>/dev/null || true
chmod 600 backups/*
find backups -type f -mtime +60 -delete
echo "$(date) backup ok: db-$TS.sql.gz"
