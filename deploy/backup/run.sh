#!/usr/bin/env bash
# บริการสำรองและกู้คืนข้อมูล (รันใน container mysql:8.4)
# - สำรองอัตโนมัติเวลา 00:00 น. ของวันตาม BACKUP_DAYS (ค่าเริ่มต้น 2-6 = อังคาร–เสาร์ คือหลังจบวันทำการ จ.–ศ.)
# - สำรองทันทีเมื่อแอปสร้างไฟล์ /backups/.request (ผู้ดูแลกดปุ่ม "สำรองตอนนี้")
# - กู้คืนเมื่อแอปสร้างไฟล์ /backups/.restore-request (ผู้ดูแลกด "กู้คืนระบบ") — สำรองข้อมูลปัจจุบันก่อนเสมอ
# - เก็บไฟล์ไว้ BACKUP_KEEP_DAYS วัน (ค่าเริ่มต้น 60)
#
# กู้คืนด้วยคำสั่ง (กรณีหน้าเว็บใช้งานไม่ได้):
#   docker compose exec backup bash /run.sh restore db-20261108-1536.sql.gz [uploads-20261108-1536.tar.gz]
#   (ชื่อไฟล์อยู่ในโฟลเดอร์ deploy/backups/ — ไฟล์ "สำรองทั้งระบบ" .tar ให้แตกไฟล์ใส่โฟลเดอร์นั้นก่อน)
set -u
DIR=/backups
DAYS="${BACKUP_DAYS:-2,3,4,5,6}"
KEEP="${BACKUP_KEEP_DAYS:-60}"
APP_UID="${APP_UID:-1000}"
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-lineup}"
UPLOADS_DIR="${UPLOADS_DIR:-/uploads}"
MYSQL=(mysql -h "$DB_HOST" -P "$DB_PORT" -uroot -p"$MYSQL_ROOT_PASSWORD")

mkdir -p "$DIR"
chown "$APP_UID:$APP_UID" "$DIR" 2>/dev/null
chmod 750 "$DIR" 2>/dev/null

backup() {
  local reason="$1" ts out ok=1
  ts=$(date +%Y%m%d-%H%M)
  out="$DIR/db-$ts.sql.gz"
  echo "$(date '+%F %T') backup start ($reason)"
  if mysqldump -h "$DB_HOST" -P "$DB_PORT" -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --no-tablespaces "$DB_NAME" 2>/tmp/dump.err | gzip > "$out.part" \
     && [ "${PIPESTATUS[0]}" -eq 0 ]; then
    mv "$out.part" "$out"
  else
    ok=0; rm -f "$out.part"; cat /tmp/dump.err
  fi
  if [ $ok = 1 ] && [ -d "$UPLOADS_DIR" ]; then tar -czf "$DIR/uploads-$ts.tar.gz" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")" 2>/dev/null || true; fi
  chown "$APP_UID:$APP_UID" "$DIR"/*.gz 2>/dev/null; chmod 600 "$DIR"/*.gz 2>/dev/null
  find "$DIR" -maxdepth 1 -name '*.gz' -mtime +"$KEEP" -delete
  find "$DIR/restore" -mindepth 1 -maxdepth 1 -mtime +7 -exec rm -rf {} + 2>/dev/null
  printf '{"at":"%s","reason":"%s","ok":%s,"file":"%s"}\n' "$(date -Iseconds)" "$reason" "$([ $ok = 1 ] && echo true || echo false)" "$(basename "$out")" > "$DIR/last.json"
  chown "$APP_UID:$APP_UID" "$DIR/last.json" 2>/dev/null
  echo "$(date '+%F %T') backup done ok=$ok"
  [ $ok = 1 ]
}

# เขียนผลการกู้คืนให้แอปอ่าน
restore_result() {
  local ok="$1" msg="$2" db="$3" up="$4" safety="$5" started="$6"
  msg=${msg//\"/\'}
  printf '{"started_at":"%s","finished_at":"%s","ok":%s,"db":"%s","uploads":"%s","safety_backup":"%s","message":"%s"}\n' \
    "$started" "$(date -Iseconds)" "$ok" "$db" "$up" "$safety" "$msg" > "$DIR/restore-last.json"
  chown "$APP_UID:$APP_UID" "$DIR/restore-last.json" 2>/dev/null
}

# กู้คืน: $1 = ไฟล์ฐานข้อมูล (.sql.gz) $2 = ไฟล์รูป/ลายเซ็น (.tar.gz, ไม่บังคับ) — path เทียบกับ /backups
restore() {
  local db="$1" up="${2:-}" started safety
  started=$(date -Iseconds)
  echo "$(date '+%F %T') restore start db=$db uploads=${up:-none}"
  case "$db$up" in *..*) restore_result false "ชื่อไฟล์ไม่ถูกต้อง" "$db" "$up" "" "$started"; return 1;; esac
  if [ ! -f "$DIR/$db" ]; then restore_result false "ไม่พบไฟล์ฐานข้อมูล $db" "$db" "$up" "" "$started"; return 1; fi
  if [ -n "$up" ] && [ ! -f "$DIR/$up" ]; then restore_result false "ไม่พบไฟล์รูป/ลายเซ็น $up" "$db" "$up" "" "$started"; return 1; fi
  if ! gzip -t "$DIR/$db" 2>/dev/null; then restore_result false "ไฟล์ฐานข้อมูลเสียหาย (gzip)" "$db" "$up" "" "$started"; return 1; fi

  # 1) สำรองข้อมูลปัจจุบันก่อน (ถ้าฐานข้อมูลยังอ่านได้) เพื่อย้อนกลับได้
  if backup "before-restore"; then safety=$(sed -n 's/.*"file":"\([^"]*\)".*/\1/p' "$DIR/last.json"); else safety=""; echo "safety backup failed (ฐานข้อมูลเดิมอาจเสียหาย) — กู้คืนต่อ"; fi

  # 2) ล้างฐานข้อมูลแล้วนำเข้าไฟล์สำรอง (สิทธิ์ของผู้ใช้ฐานข้อมูลอยู่ที่ระดับ DB จึงไม่หายเมื่อสร้างใหม่)
  if ! "${MYSQL[@]}" -e "DROP DATABASE IF EXISTS \`$DB_NAME\`; CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/tmp/restore.err; then
    restore_result false "สร้างฐานข้อมูลใหม่ไม่สำเร็จ: $(tail -c 300 /tmp/restore.err)" "$db" "$up" "$safety" "$started"; return 1
  fi
  if ! gunzip -c "$DIR/$db" | "${MYSQL[@]}" "$DB_NAME" 2>/tmp/restore.err; then
    restore_result false "นำเข้าฐานข้อมูลไม่สำเร็จ: $(tail -c 300 /tmp/restore.err) — กู้คืนจากไฟล์ $safety ได้" "$db" "$up" "$safety" "$started"; return 1
  fi

  # 3) คืนรูปหลักฐาน/ลายเซ็น
  if [ -n "$up" ]; then
    if [ -w "$UPLOADS_DIR" ]; then
      find "$UPLOADS_DIR" -mindepth 1 -delete
      tar -xzf "$DIR/$up" -C "$(dirname "$UPLOADS_DIR")" && chown -R "$APP_UID:$APP_UID" "$UPLOADS_DIR"
    else
      restore_result false "ฐานข้อมูลกู้คืนแล้ว แต่เขียนโฟลเดอร์รูปไม่ได้ (volume เป็น read-only)" "$db" "$up" "$safety" "$started"; return 1
    fi
  fi
  restore_result true "กู้คืนสำเร็จ" "$db" "$up" "$safety" "$started"
  echo "$(date '+%F %T') restore done"
}

if [ "${1:-}" = "restore" ]; then
  restore "${2:?ระบุไฟล์ฐานข้อมูล}" "${3:-}"
  exit $?
fi
if [ "${1:-}" = "backup" ]; then
  backup "manual-cli"
  exit $?
fi

last_auto=""
while true; do
  if [ -f "$DIR/.restore-request" ]; then
    db=$(sed -n 's/^DB=//p' "$DIR/.restore-request" | head -1)
    up=$(sed -n 's/^UPLOADS=//p' "$DIR/.restore-request" | head -1)
    rm -f "$DIR/.restore-request"
    restore "$db" "$up"
  fi
  if [ -f "$DIR/.request" ]; then
    rm -f "$DIR/.request"
    backup "manual"
  fi
  dow=$(date +%u); hm=$(date +%H%M); today=$(date +%F)
  if [ "$hm" = "0000" ] && [ "$last_auto" != "$today" ] && echo ",$DAYS," | grep -q ",$dow,"; then
    last_auto="$today"
    backup "scheduled"
  fi
  sleep 5
done
