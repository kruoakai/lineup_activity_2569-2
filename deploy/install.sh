#!/usr/bin/env bash
# ติดตั้งระบบเช็กชื่อเข้าแถวบน Ubuntu 24.04 (รันด้วย root)
#   sudo bash /opt/lineup/deploy/install.sh lineup.ccollege.ac.th admin-email@ccollege.ac.th
set -euo pipefail

DOMAIN="${1:-lineup.ccollege.ac.th}"
LE_EMAIL="${2:-}"
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

log() { echo -e "\n\033[1;34m==> $*\033[0m"; }

# ---------- 1. ระบบพื้นฐาน ----------
log "ตั้งเขตเวลา และติดตั้งแพ็กเกจพื้นฐาน"
timedatectl set-timezone Asia/Bangkok || true
apt-get update -y
apt-get install -y ca-certificates curl openssl ufw unattended-upgrades chrony

if ! command -v docker >/dev/null; then
  log "ติดตั้ง Docker"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

log "ตั้งค่า firewall (SSH, HTTP, HTTPS)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ---------- 2. ความลับ (.env) ----------
if [ ! -f .env ]; then
  log "สร้างรหัสผ่านฐานข้อมูลและ secret แบบสุ่ม -> deploy/.env"
  touch .env && chmod 600 .env
  cat > .env <<EOF
DOMAIN=${DOMAIN}
DB_PASSWORD=$(openssl rand -hex 24)
DB_ROOT_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 48)
QR_SECRET=$(openssl rand -hex 48)
EOF
fi

# ---------- 3. ใบรับรองชั่วคราว (self-signed) เพื่อให้ nginx เริ่มได้ ----------
mkdir -p certs certbot-www letsencrypt backups
chmod 755 certbot-www   # nginx (ไม่ใช่ root) ต้องอ่านไฟล์ challenge ได้
chmod 750 backups
if [ ! -f certs/fullchain.pem ]; then
  log "สร้างใบรับรองชั่วคราว"
  openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
    -keyout certs/privkey.pem -out certs/fullchain.pem -subj "/CN=${DOMAIN}" >/dev/null 2>&1
fi

# ---------- 4. เริ่มระบบ ----------
log "Build และเริ่มระบบ (ครั้งแรกใช้เวลาหลายนาที)"
docker compose up -d --build

log "รอ API พร้อม"
for i in $(seq 1 60); do
  if docker compose exec -T app wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then break; fi
  sleep 3
done
docker compose exec -T app wget -qO- http://127.0.0.1:3000/api/health && echo

# ---------- 5. นำเข้าบุคลากร ----------
if [ ! -f .seeded ]; then
  log "นำเข้าข้อมูลบุคลากร และสร้างรหัสผ่านเริ่มต้น"
  docker compose exec -T app node scripts/seed.js --out /app/uploads/initial-passwords.csv
  docker compose cp app:/app/uploads/initial-passwords.csv ./initial-passwords.csv
  docker compose exec -T app rm -f /app/uploads/initial-passwords.csv
  chmod 600 ./initial-passwords.csv
  touch .seeded
  echo "รหัสผ่านเริ่มต้นอยู่ที่ ${DIR}/initial-passwords.csv — ดาวน์โหลดไปแจกจ่ายแล้วลบไฟล์ทิ้ง"
fi

# ---------- 6. HTTPS จริง (Let's Encrypt) ----------
log "ขอใบรับรอง Let's Encrypt สำหรับ ${DOMAIN}"
if bash "$DIR/renew-cert.sh" issue "$DOMAIN" "$LE_EMAIL"; then
  echo "ได้ใบรับรอง HTTPS แล้ว"
else
  echo "!! ยังขอใบรับรองไม่ได้ — ตรวจสอบว่า DNS ${DOMAIN} ชี้มาที่ IP เครื่องนี้ และเปิดพอร์ต 80 จากอินเทอร์เน็ต"
  echo "   แล้วรัน: sudo bash ${DIR}/renew-cert.sh issue ${DOMAIN} ${LE_EMAIL}"
fi

# ---------- 7. งานตั้งเวลา: ต่ออายุใบรับรอง + สำรองข้อมูล ----------
log "ตั้ง cron ต่ออายุใบรับรอง"
cat > /etc/cron.d/lineup <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# ถ้ายังไม่มีใบรับรองจริง ลองขอทุก 30 นาที (สำเร็จเองเมื่อ DNS ชี้มาที่เครื่องนี้)
*/30 * * * * root [ -d ${DIR}/letsencrypt/live/${DOMAIN} ] || bash ${DIR}/renew-cert.sh issue ${DOMAIN} ${LE_EMAIL} >> /var/log/lineup-cert.log 2>&1
# ต่ออายุใบรับรอง
17 3 * * * root bash ${DIR}/renew-cert.sh renew >> /var/log/lineup-cert.log 2>&1
# การสำรองฐานข้อมูลทำโดย container "backup" (00:00 น. หลังวันทำการ) ดู deploy/backup/run.sh
EOF

log "เสร็จสิ้น — เปิด https://${DOMAIN}"
docker compose ps
