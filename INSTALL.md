# คู่มือการติดตั้งระบบเช็กชื่อเข้าแถว

คู่มือนี้อธิบายการติดตั้ง 2 แบบ:

- **ติดตั้งใช้งานจริงบนเซิร์ฟเวอร์** (Ubuntu 24.04 + Docker): หัวข้อ 1–8
- **ติดตั้งในเครื่องนักพัฒนา** (Windows / macOS / Linux): หัวข้อ 9

ระบบประกอบด้วย 4 container ที่ทำงานร่วมกันด้วย Docker Compose:

| Container | หน้าที่ |
| --- | --- |
| `db` | MySQL 8.4 เก็บข้อมูลทั้งหมด |
| `app` | Node.js (API) + หน้าเว็บ Vue ที่ build แล้ว |
| `nginx` | รับ HTTPS พอร์ต 443, ต่ออายุใบรับรอง Let's Encrypt |
| `backup` | สำรองฐานข้อมูลอัตโนมัติ 00:00 น. หลังวันทำการ เก็บ 60 วัน |

---

## 1. สิ่งที่ต้องเตรียม

| รายการ | ขั้นต่ำ | แนะนำ |
| --- | --- | --- |
| เซิร์ฟเวอร์ / VM | 2 vCPU, RAM 2 GB, ดิสก์ 20 GB | 2 vCPU, RAM 4 GB, ดิสก์ 40 GB |
| ระบบปฏิบัติการ | Ubuntu Server 24.04 LTS | |
| IP สาธารณะ | 1 IP เปิดพอร์ต 80 และ 443 จากอินเทอร์เน็ต | |
| โดเมน | เช่น `lineup.example.ac.th` | |
| ไฟล์รายชื่อบุคลากร | Excel จากระบบสารบรรณฯ หรือ `personnel.json` | |

ระบบรองรับบุคลากรประมาณ 200 คนเช็กชื่อพร้อมกันได้สบายบนสเปกขั้นต่ำ

## 2. ตั้งค่า DNS

สร้างระเบียน **A** ให้โดเมนชี้ไปที่ IP ของเซิร์ฟเวอร์ เช่น `lineup.example.ac.th → 203.0.113.10`

ถ้าใช้ Cloudflare ให้ตั้งเป็น **DNS only** (เมฆสีเทา) ไม่ต้องเปิด proxy เพื่อให้ขอใบรับรอง Let's Encrypt ได้

ตรวจว่า DNS ใช้ได้แล้ว:

```bash
nslookup lineup.example.ac.th
```

## 3. ดาวน์โหลดโค้ดลงเซิร์ฟเวอร์

เข้าเซิร์ฟเวอร์ด้วย SSH แล้วรัน:

```bash
sudo apt-get update && sudo apt-get install -y git
sudo git clone https://github.com/kruoakai/lineup_activity_2569-2.git /opt/lineup
```

## 4. เตรียมรายชื่อบุคลากร

ไฟล์รายชื่อบุคลากรเป็นข้อมูลส่วนบุคคล **จึงไม่ได้อยู่ใน GitHub** ต้องสร้าง `backend/data/personnel.json` เองด้วยวิธีใดวิธีหนึ่ง

### วิธี ก: แปลงจาก Excel ระบบสารบรรณฯ (GDCC e-Office)

ไฟล์ Excel ต้องมีคอลัมน์ `ชื่อ-สกุล`, `อีเมล`, `รหัสพนักงาน`, `โครงสร้างระดับที่ 2` (ฝ่าย), `โครงสร้างระดับที่ 3` (แผนก/งาน)

คัดลอกไฟล์ Excel ขึ้นเซิร์ฟเวอร์ (เช่นด้วย WinSCP) ไว้ที่ `/opt/lineup/staff.xlsx` แล้วแปลงด้วย container ชั่วคราว (ไม่ต้องติดตั้ง Node.js บนเซิร์ฟเวอร์):

```bash
sudo docker run --rm -v /opt/lineup:/src -w /src/backend node:22-alpine sh -c "npm ci --omit=dev --no-audit && node scripts/import-excel.js /src/staff.xlsx data/personnel.json && rm -rf node_modules"
```

ผลลัพธ์ เช่น `บันทึก 179 คน 36 แผนก/งาน → data/personnel.json` แล้วลบไฟล์ Excel ทิ้งได้

หรือแปลงในเครื่องคอมพิวเตอร์ที่มี Node.js แล้วอัปโหลดเฉพาะ `personnel.json`:

```bash
cd backend && npm install
node scripts/import-excel.js "รายชื่อครู.xlsx" data/personnel.json
```

### วิธี ข: เขียน JSON เอง

ดูรูปแบบจาก `backend/data/personnel.example.json`

```json
[
  { "employee_code": "1001", "full_name": "นายตัวอย่าง ทดสอบ", "email": "teacher1@example.ac.th", "division": "ฝ่ายวิชาการ", "department": "แผนกวิชาเทคโนโลยีสารสนเทศ" }
]
```

`employee_code` คือชื่อผู้ใช้สำหรับเข้าระบบ ต้องไม่ซ้ำกัน ส่วน `email` เว้นว่างได้

## 5. ติดตั้ง

```bash
sudo bash /opt/lineup/deploy/install.sh lineup.example.ac.th admin@example.ac.th
```

สคริปต์ทำงานเองทั้งหมดประมาณ 5–10 นาที:

1. ตั้งเขตเวลา Asia/Bangkok ติดตั้ง Docker และเปิด firewall (SSH, 80, 443)
2. สุ่มรหัสผ่านฐานข้อมูลและ secret ลง `deploy/.env` (สิทธิ์ 600)
3. Build และเริ่มทุก container
4. สร้างตารางฐานข้อมูลและนำเข้าบุคลากรจาก `personnel.json`
5. ขอใบรับรอง HTTPS จาก Let's Encrypt (ถ้าไม่สำเร็จ ระบบจะลองใหม่ทุก 30 นาทีจนได้)

เมื่อเสร็จ เปิด `https://lineup.example.ac.th` ได้เลย

### รหัสผ่านเริ่มต้น

- **ครูทุกคน:** ชื่อผู้ใช้ = รหัสพนักงาน · รหัสผ่าน = `12345678` เข้าครั้งแรกระบบบังคับให้ตั้งรหัสใหม่และยอมรับเงื่อนไข PDPA
- **บัญชี `admin`:** รหัสผ่านสุ่มอยู่ในไฟล์ `/opt/lineup/deploy/initial-passwords.csv` ดาวน์โหลดเก็บไว้แล้ว**ลบไฟล์ทิ้ง**

```bash
sudo cat /opt/lineup/deploy/initial-passwords.csv | grep admin
sudo rm /opt/lineup/deploy/initial-passwords.csv
```

เปลี่ยนรหัสเริ่มต้นของครูได้ด้วยตัวแปร `INITIAL_PASSWORD` ใน `deploy/.env` ก่อนติดตั้ง

## 6. ตั้งค่าหลังติดตั้ง (ทำในหน้าเว็บด้วยบัญชี admin)

- [ ] เปลี่ยนรหัสผ่าน `admin`
- [ ] ☰ → ⚙️ ตั้งค่า: เวลาเปิด-ปิด, วันเข้าแถว, **ปักหมุดพื้นที่เข้าแถวบนแผนที่**, วิธีเช็กชื่อ (แนะนำ "GPS หรือ QR")
- [ ] ☰ → 👤 ผู้ใช้และสิทธิ์: กำหนดหัวหน้าแผนก ผู้บริหาร งานกิจกรรม ตัวแทนเช็กชื่อ และผู้ไม่ต้องเข้าแถว
- [ ] ☰ → 🖋 แบบรายงาน: ตรวจผู้ลงนาม 3 ลำดับและหน่วยงาน 16 หน่วย
- [ ] ☰ → 🗓 ปฏิทิน: ภาคเรียน วันหยุดนักขัตฤกษ์
- [ ] ทดสอบตาม `docs/คู่มือการทดสอบระบบเช็กชื่อเข้าแถว (UAT).pdf` แล้วล้างข้อมูลทดสอบก่อนใช้จริง

รายละเอียดแต่ละหน้าดู `docs/คู่มือผู้ดูแลระบบ.pdf`

## 7. ตั้งค่าเสริม (ไม่บังคับ)

แก้ไฟล์ `/opt/lineup/deploy/.env` แล้วรีสตาร์ต app ทุกครั้ง:

```bash
sudo nano /opt/lineup/deploy/.env
```

```bash
cd /opt/lineup/deploy && sudo docker compose up -d app
```

### อีเมล (ลืมรหัสผ่าน และแจ้งเตือนผู้ลงนาม)

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=no-reply@example.ac.th
SMTP_PASS=รหัสผ่านแอป (App Password)
SMTP_FROM=ระบบเช็กชื่อเข้าแถว <no-reply@example.ac.th>
```

ถ้าใช้ Gmail / Google Workspace ต้องเปิด 2-Step Verification แล้วสร้าง **App Password** ใช้แทนรหัสผ่านจริง ทดสอบได้ที่ ☰ → 🖋 → ส่งอีเมลทดสอบ

### เข้าสู่ระบบด้วย LINE

1. developers.line.biz → สร้าง Provider → สร้าง **LINE Login** channel แบบ Web app
2. Callback URL: `https://lineup.example.ac.th/api/auth/line/callback`
3. เปลี่ยนสถานะ channel เป็น **Published**
4. ใส่ค่าใน `.env`:

```
LINE_CHANNEL_ID=1234567890
LINE_CHANNEL_SECRET=ค่าจากหน้า Basic settings
```

ปุ่ม "เข้าสู่ระบบด้วย LINE" จะแสดงเองเมื่อตั้งค่าครบ ครูต้องเชื่อมบัญชี LINE ที่หน้าโปรไฟล์ก่อนครั้งแรก

## 8. ดูแลระบบประจำ

| งาน | คำสั่ง |
| --- | --- |
| ดูสถานะ | `cd /opt/lineup/deploy && sudo docker compose ps` |
| ดู log ล่าสุด | `sudo docker compose logs app --tail 100` |
| สำรองทันที | ☰ → 💾 สำรองตอนนี้ หรือ `sudo bash /opt/lineup/deploy/backup.sh` |
| ไฟล์สำรอง | `/opt/lineup/deploy/backups/` (db-*.sql.gz และ uploads-*.tar.gz) |
| ต่ออายุ HTTPS | อัตโนมัติ หรือ `sudo bash /opt/lineup/deploy/renew-cert.sh renew` |

### อัปเดตเป็นเวอร์ชันใหม่

```bash
cd /opt/lineup/deploy && sudo bash backup.sh
```

```bash
cd /opt/lineup && sudo git pull
```

```bash
cd /opt/lineup/deploy && sudo docker compose up -d --build
```

ระบบปรับโครงสร้างฐานข้อมูล (migration) ให้อัตโนมัติตอนเริ่ม ข้อมูลเดิมไม่หาย

### กู้คืนฐานข้อมูลจากไฟล์สำรอง

```bash
cd /opt/lineup/deploy
gunzip -c backups/db-20261108-0000.sql.gz | sudo docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" lineup'
```

กู้รูปหลักฐาน:

```bash
sudo docker compose cp backups/uploads-20261108-0000.tar.gz app:/tmp/u.tgz
sudo docker compose exec app tar -xzf /tmp/u.tgz -C /app
```

### เพิ่มบุคลากรใหม่จาก Excel ฉบับใหม่

แปลงไฟล์ตามหัวข้อ 4 แล้วรัน (คนเดิมไม่ถูกรีเซ็ตรหัส คนใหม่ได้รหัสเริ่มต้น):

```bash
cd /opt/lineup/deploy && sudo docker compose up -d --build app
sudo docker compose exec app node scripts/seed.js --out /app/uploads/new.csv
```

## 9. ติดตั้งในเครื่องนักพัฒนา

ต้องมี [Node.js 22+](https://nodejs.org), [Docker Desktop](https://www.docker.com/products/docker-desktop/) และ Git

```bash
git clone https://github.com/kruoakai/lineup_activity_2569-2.git
cd lineup_activity_2569-2
```

เปิดฐานข้อมูล MySQL สำหรับพัฒนา (ใช้ร่วมกับการทดสอบ):

```bash
docker run -d --name lineup-mysql-test -e MYSQL_ROOT_PASSWORD=testroot -e MYSQL_DATABASE=lineup_test -e MYSQL_USER=lineup -e MYSQL_PASSWORD=lineuptest -p 33306:3306 mysql:8.4
docker exec lineup-mysql-test mysql -uroot -ptestroot -e "CREATE DATABASE IF NOT EXISTS lineup_dev CHARACTER SET utf8mb4; GRANT ALL ON lineup_dev.* TO 'lineup'@'%';"
```

ติดตั้งและเริ่มระบบ:

```bash
cd backend && npm install && cp .env.example .env
cp data/personnel.example.json data/personnel.json
npm run migrate && npm run seed
cd ../frontend && npm install && npm run build
cd ../backend && npm run dev
```

เปิด http://localhost:3000 บัญชี `admin` อยู่ในไฟล์ `backend/initial-passwords.csv`

พัฒนาหน้าเว็บแบบโหลดใหม่อัตโนมัติ: เปิดอีกหน้าต่างแล้วรัน `cd frontend && npm run dev` (http://localhost:5173 ต่อ API ที่พอร์ต 3000)

### รันชุดทดสอบ

```bash
cd backend && npm test
cd ../frontend && npm test
cd ../e2e && npm install && npm test
```

รายละเอียดดู `TESTING.md`

## 10. แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
| --- | --- |
| เปิดเว็บแล้วเบราว์เซอร์เตือนใบรับรองไม่ปลอดภัย | ยังขอ Let's Encrypt ไม่สำเร็จ ตรวจ DNS และพอร์ต 80 แล้วรัน `sudo bash deploy/renew-cert.sh issue <โดเมน> <อีเมล>` |
| `install.sh` หยุดที่ "รอ API พร้อม" | ดู `sudo docker compose logs app` มักเกิดจากไม่มี `backend/data/personnel.json` หรือ JSON ผิดรูปแบบ |
| ครูทั้งหมดเช็กชื่อไม่ได้ | ดูกล่อง "วันนี้" ในหน้าตั้งค่า ปฏิทินอาจตั้งเป็นวันหยุด/งดเข้าแถว หรือเวลาเปิด-ปิดผิด |
| GPS ขึ้น "นอกพื้นที่" ทั้งที่อยู่ที่ลาน | ตรวจหมุดและรัศมีในหน้าตั้งค่า หรือเปิดจอ QR ให้สแกนแทน |
| ลืมรหัสผ่าน admin | `cd /opt/lineup/deploy && sudo docker compose exec app node scripts/reset-password.js admin` ได้รหัสชั่วคราวใหม่ (ใช้กับผู้ใช้คนใดก็ได้ ใส่รหัสพนักงานแทน admin) |
| หน้าเว็บไม่เปลี่ยนหลังอัปเดต | ปิดแท็บแล้วเปิดใหม่ 1 ครั้ง (service worker เก็บไฟล์เก่าไว้) |
| ดิสก์เต็ม | ไฟล์สำรองเก็บ 60 วัน ลบไฟล์เก่าใน `deploy/backups/` และรูปหลักฐานลบเองตามจำนวนวันที่ตั้ง |

## ไฟล์ที่ไม่ได้อยู่ใน GitHub (ต้องเตรียมเองหรือสร้างอัตโนมัติ)

| ไฟล์ | ที่มา |
| --- | --- |
| `deploy/.env` | สร้างโดย `install.sh` (มีรหัสผ่านฐานข้อมูลและ secret) |
| `backend/.env` | คัดลอกจาก `backend/.env.example` (เฉพาะเครื่องนักพัฒนา) |
| `backend/data/personnel.json` | แปลงจาก Excel (หัวข้อ 4) เป็นข้อมูลส่วนบุคคล |
| `deploy/initial-passwords.csv` | สร้างตอนติดตั้ง ลบทิ้งหลังแจกจ่าย |
| `deploy/backups/`, `backend/uploads/` | ข้อมูลจริงบนเซิร์ฟเวอร์ |
