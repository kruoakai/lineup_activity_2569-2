const fs = require('fs');
const path = require('path');
const db = require('../src/db');

// การเปลี่ยนโครงสร้างฐานข้อมูลหลังรุ่นแรก — รันครั้งเดียวต่อฐานข้อมูล (บันทึกใน schema_migrations)
// เพิ่มรายการใหม่ต่อท้ายเสมอ ห้ามแก้รายการที่ deploy ไปแล้ว
const MIGRATIONS = [
  {
    id: '2026-11-08-01-profile',
    sql: [
      `ALTER TABLE users
         ADD COLUMN position_title VARCHAR(150) NOT NULL DEFAULT '' AFTER full_name,
         ADD COLUMN phone VARCHAR(30) NOT NULL DEFAULT '' AFTER position_title,
         ADD COLUMN avatar_path VARCHAR(255) NULL AFTER phone,
         ADD COLUMN signature_path VARCHAR(255) NULL AFTER avatar_path,
         ADD COLUMN proxy_until DATETIME NULL AFTER can_proxy`,
    ],
  },
  {
    id: '2026-11-08-02-demo-flag',
    sql: [
      'ALTER TABLE attendance ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0, ADD KEY idx_demo (is_demo)',
      'ALTER TABLE attendance_events ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0',
    ],
  },
  {
    id: '2026-11-08-03-photos',
    sql: [
      `CREATE TABLE IF NOT EXISTS attendance_photos (
         id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
         attendance_id  BIGINT UNSIGNED NOT NULL,
         path           VARCHAR(255) NOT NULL,
         uploaded_by    INT UNSIGNED NOT NULL,
         created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         KEY idx_attendance (attendance_id),
         CONSTRAINT fk_photo_att FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `INSERT INTO attendance_photos (attendance_id, path, uploaded_by, created_at)
         SELECT id, photo_path, checked_by, checked_at FROM attendance WHERE photo_path IS NOT NULL`,
      'UPDATE attendance SET photo_path = NULL',
    ],
  },
  {
    id: '2026-11-08-04-password-resets',
    sql: [
      `CREATE TABLE IF NOT EXISTS password_resets (
         id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
         user_id     INT UNSIGNED NOT NULL,
         token_hash  CHAR(64) NOT NULL,
         expires_at  DATETIME NOT NULL,
         used_at     DATETIME NULL,
         ip          VARCHAR(64) NULL,
         created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         UNIQUE KEY uq_token (token_hash),
         KEY idx_user (user_id),
         CONSTRAINT fk_pr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ],
  },
  {
    id: '2026-11-08-05-report-groups',
    sql: [
      `ALTER TABLE departments
         ADD COLUMN report_group VARCHAR(150) NULL AFTER division,
         ADD COLUMN report_order INT NOT NULL DEFAULT 999 AFTER report_group`,
      // กำหนดหน่วยงานรายงานรายบุคคลได้ (เช่น เจ้าพนักงานราชการ) ทับค่าของแผนก
      'ALTER TABLE users ADD COLUMN report_group VARCHAR(150) NULL AFTER department_id',
    ],
    after: async () => require('../src/services/reportGroups').applyDefaults(),
  },
  {
    id: '2026-11-08-06-report-docs',
    sql: [
      `CREATE TABLE IF NOT EXISTS report_docs (
         id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
         title         VARCHAR(255) NOT NULL,
         period_from   DATE NOT NULL,
         period_to     DATE NOT NULL,
         snapshot      JSON NOT NULL,
         snapshot_hash CHAR(64) NOT NULL,
         steps         JSON NOT NULL,
         current_step  TINYINT NOT NULL DEFAULT 1,
         status        ENUM('pending','approved','returned') NOT NULL DEFAULT 'pending',
         is_demo       TINYINT(1) NOT NULL DEFAULT 0,
         created_by    INT UNSIGNED NOT NULL,
         created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         KEY idx_status (status)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS report_signatures (
         id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
         doc_id          INT UNSIGNED NOT NULL,
         step            TINYINT NOT NULL,
         action          ENUM('sign','return') NOT NULL,
         signer_id       INT UNSIGNED NOT NULL,
         signature_path  VARCHAR(255) NULL,
         comment         VARCHAR(500) NOT NULL DEFAULT '',
         ip              VARCHAR(64) NULL,
         signed_at       DATETIME NOT NULL,
         KEY idx_doc (doc_id),
         CONSTRAINT fk_sig_doc FOREIGN KEY (doc_id) REFERENCES report_docs(id) ON DELETE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ],
  },
  {
    id: '2026-11-08-07-remember-me',
    // 0 = ไม่ติ๊ก "จำฉันไว้" → cookie หมดเมื่อปิดเบราว์เซอร์
    sql: ['ALTER TABLE refresh_tokens ADD COLUMN persistent TINYINT(1) NOT NULL DEFAULT 1'],
  },
  {
    id: '2026-11-08-08-peer-calendar',
    // proxy_peer = เพื่อนในแผนกเช็กแทน (โหมดเช็กแทนกันได้ทั้งแผนก)
    // special = กิจกรรมพิเศษ (นับเป็นวันเข้าแถว) · public_holiday = วันหยุดนักขัตฤกษ์
    sql: [
      "ALTER TABLE attendance MODIFY method ENUM('self_gps','self_qr','proxy_dept','proxy_peer','proxy_activity','admin') NOT NULL",
      "ALTER TABLE assembly_days MODIFY status ENUM('normal','special','cancelled','holiday','public_holiday') NOT NULL",
    ],
  },
  {
    id: '2026-11-08-09-self-tap',
    // self_tap = กดปุ่มเช็กชื่อ (โหมด "ไม่ต้องตั้งค่า" ไม่ตรวจ GPS/QR)
    sql: ["ALTER TABLE attendance MODIFY method ENUM('self_gps','self_qr','self_tap','proxy_dept','proxy_peer','proxy_activity','admin') NOT NULL"],
  },
  {
    id: '2026-11-08-10-line-login',
    // บัญชี LINE ที่ผูกไว้ (sub จาก LINE Login) — หนึ่งบัญชี LINE ต่อหนึ่งผู้ใช้
    sql: [
      'ALTER TABLE users ADD COLUMN line_user_id VARCHAR(64) NULL, ADD COLUMN line_name VARCHAR(100) NULL, ADD COLUMN line_linked_at DATETIME NULL',
      'ALTER TABLE users ADD UNIQUE KEY uq_users_line (line_user_id)',
    ],
  },
];

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const statements = sql
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
  for (const st of statements) await db.query(st);

  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(100) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const done = new Set((await db.query('SELECT id FROM schema_migrations')).map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    for (const st of m.sql) await db.query(st);
    if (m.after) await m.after();
    await db.query('INSERT INTO schema_migrations (id) VALUES (?)', [m.id]);
    console.log(`migrate: applied ${m.id}`);
  }
}

module.exports = { migrate, MIGRATIONS };

if (require.main === module) {
  migrate()
    .then(() => { console.log('migrate: done'); return db.close(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
