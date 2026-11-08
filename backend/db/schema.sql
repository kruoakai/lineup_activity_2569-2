-- ระบบเช็กชื่อเข้าแถวบุคลากร — MySQL 8 (utf8mb4)
-- เวลา (DATETIME) ทั้งหมดเก็บเป็น UTC ส่วนคอลัมน์ `day` เป็นวันที่ตามเวลาไทย (Asia/Bangkok)

CREATE TABLE IF NOT EXISTS departments (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  division    VARCHAR(150) NOT NULL DEFAULT '',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_department (division, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_code         VARCHAR(30)  NOT NULL,
  email                 VARCHAR(190) NULL,
  full_name             VARCHAR(190) NOT NULL,
  department_id         INT UNSIGNED NULL,
  role                  ENUM('staff','dept_head','activity','executive','admin') NOT NULL DEFAULT 'staff',
  can_proxy             TINYINT(1) NOT NULL DEFAULT 0,   -- ครูผู้รับมอบหมายให้เช็กแทนในแผนก
  must_assemble         TINYINT(1) NOT NULL DEFAULT 1,   -- 0 = ไม่อยู่ในเกณฑ์ต้องเข้าแถว
  active                TINYINT(1) NOT NULL DEFAULT 1,
  password_hash         VARCHAR(100) NOT NULL,
  must_change_password  TINYINT(1) NOT NULL DEFAULT 1,
  consent_at            DATETIME NULL,                   -- ยอมรับเงื่อนไข PDPA
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_employee_code (employee_code),
  UNIQUE KEY uq_email (email),
  KEY idx_department (department_id),
  CONSTRAINT fk_user_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  CHAR(64) NOT NULL,
  device_id   VARCHAR(64) NULL,
  expires_at  DATETIME NOT NULL,
  revoked_at  DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_token (token_hash),
  KEY idx_user (user_id),
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  k  VARCHAR(64) PRIMARY KEY,
  v  TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ค่าเริ่มต้น: วันจันทร์–ศุกร์เป็นวันเข้าแถว ตารางนี้ใช้ยกเว้น (งด/วันหยุด) หรือเพิ่มวันพิเศษ
CREATE TABLE IF NOT EXISTS assembly_days (
  day     DATE PRIMARY KEY,
  status  ENUM('normal','cancelled','holiday') NOT NULL,
  note    VARCHAR(255) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS semesters (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(50) NOT NULL,      -- เช่น 2/2569
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  UNIQUE KEY uq_semester (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1 แถว ต่อ 1 คน ต่อ 1 วัน (กันข้อมูลซ้ำด้วย UNIQUE)
CREATE TABLE IF NOT EXISTS attendance (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  day          DATE NOT NULL,
  status       ENUM('present','absent','official','policy','leave','pending') NOT NULL,
  method       ENUM('self_gps','self_qr','proxy_dept','proxy_activity','admin') NOT NULL,
  checked_by   INT UNSIGNED NOT NULL,
  checked_at   DATETIME NOT NULL,
  lat          DECIMAL(10,7) NULL,
  lng          DECIMAL(10,7) NULL,
  accuracy_m   INT NULL,
  distance_m   INT NULL,
  in_zone      TINYINT(1) NULL,
  qr_ok        TINYINT(1) NOT NULL DEFAULT 0,
  device_id    VARCHAR(64) NULL,
  photo_path   VARCHAR(255) NULL,
  note         VARCHAR(500) NOT NULL DEFAULT '',
  flagged      TINYINT(1) NOT NULL DEFAULT 0,
  flag_reason  VARCHAR(255) NOT NULL DEFAULT '',
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_day (user_id, day),
  KEY idx_day_status (day, status),
  KEY idx_day_device (day, device_id),
  CONSTRAINT fk_att_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_att_checker FOREIGN KEY (checked_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit log: ไม่ลบ ไม่แก้ เพิ่มอย่างเดียว
CREATE TABLE IF NOT EXISTS attendance_events (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  attendance_id  BIGINT UNSIGNED NOT NULL,
  user_id        INT UNSIGNED NOT NULL,
  day            DATE NOT NULL,
  action         ENUM('create','update','review') NOT NULL,
  old_status     VARCHAR(20) NULL,
  new_status     VARCHAR(20) NOT NULL,
  method         VARCHAR(20) NOT NULL,
  actor_id       INT UNSIGNED NOT NULL,
  reason         VARCHAR(500) NOT NULL DEFAULT '',
  detail         JSON NULL,
  ip             VARCHAR(64) NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_attendance (attendance_id),
  KEY idx_user_day (user_id, day),
  KEY idx_actor (actor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- บันทึกการกระทำของผู้ดูแล (เปลี่ยนสิทธิ์ รีเซ็ตรหัส แก้ค่าระบบ)
CREATE TABLE IF NOT EXISTS admin_logs (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id    INT UNSIGNED NOT NULL,
  action      VARCHAR(64) NOT NULL,
  target      VARCHAR(190) NOT NULL DEFAULT '',
  detail      JSON NULL,
  ip          VARCHAR(64) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_actor (actor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
