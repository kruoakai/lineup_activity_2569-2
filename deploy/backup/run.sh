#!/usr/bin/env bash
# บริการสำรองข้อมูล (รันใน container mysql:8.4)
# - สำรองอัตโนมัติเวลา 00:00 น. ของวันตาม BACKUP_DAYS (ค่าเริ่มต้น 2-6 = อังคาร–เสาร์ คือหลังจบวันทำการ จ.–ศ.)
# - สำรองทันทีเมื่อแอปสร้างไฟล์ /backups/.request (ผู้ดูแลกดปุ่ม "สำรองตอนนี้")
# - เก็บไฟล์ไว้ BACKUP_KEEP_DAYS วัน (ค่าเริ่มต้น 60)
set -u
DIR=/backups
DAYS="${BACKUP_DAYS:-2,3,4,5,6}"
KEEP="${BACKUP_KEEP_DAYS:-60}"
APP_UID="${APP_UID:-1000}"

mkdir -p "$DIR"
chown "$APP_UID:$APP_UID" "$DIR"
chmod 750 "$DIR"

backup() {
  local reason="$1" ts out ok=1
  ts=$(date +%Y%m%d-%H%M)
  out="$DIR/db-$ts.sql.gz"
  echo "$(date '+%F %T') backup start ($reason)"
  if mysqldump -h db -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --no-tablespaces lineup 2>/tmp/dump.err | gzip > "$out.part" \
     && [ "${PIPESTATUS[0]}" -eq 0 ]; then
    mv "$out.part" "$out"
  else
    ok=0; rm -f "$out.part"; cat /tmp/dump.err
  fi
  if [ -d /uploads ]; then tar -czf "$DIR/uploads-$ts.tar.gz" -C / uploads 2>/dev/null || true; fi
  chown "$APP_UID:$APP_UID" "$DIR"/*.gz 2>/dev/null; chmod 600 "$DIR"/*.gz 2>/dev/null
  find "$DIR" -maxdepth 1 -name '*.gz' -mtime +"$KEEP" -delete
  printf '{"at":"%s","reason":"%s","ok":%s,"file":"%s"}\n' "$(date -Iseconds)" "$reason" "$([ $ok = 1 ] && echo true || echo false)" "$(basename "$out")" > "$DIR/last.json"
  chown "$APP_UID:$APP_UID" "$DIR/last.json"
  echo "$(date '+%F %T') backup done ok=$ok"
}

last_auto=""
while true; do
  if [ -f "$DIR/.request" ]; then
    rm -f "$DIR/.request"
    backup "manual"
  fi
  dow=$(date +%u); hm=$(date +%H%M); today=$(date +%F)
  if [ "$hm" = "0000" ] && [ "$last_auto" != "$today" ] && echo ",$DAYS," | grep -q ",$dow,"; then
    last_auto="$today"
    backup "scheduled"
  fi
  sleep 15
done
