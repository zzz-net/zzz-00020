import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbDir = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const dbPath = path.join(dbDir, 'clinic.db');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const initSql = `
CREATE TABLE IF NOT EXISTS doctor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  title TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patient (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  id_card TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  medical_record_no TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS doctor_slot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  period TEXT NOT NULL CHECK(period IN ('morning','afternoon')),
  total_capacity INTEGER NOT NULL,
  used_capacity INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (doctor_id) REFERENCES doctor(id),
  UNIQUE(doctor_id, date, period)
);

CREATE TABLE IF NOT EXISTS recheck_application (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  doctor_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  expected_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_triage',
  slot_id INTEGER,
  appointment_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT NOT NULL,
  FOREIGN KEY (patient_id) REFERENCES patient(id),
  FOREIGN KEY (doctor_id) REFERENCES doctor(id),
  FOREIGN KEY (slot_id) REFERENCES doctor_slot(id)
);

CREATE TABLE IF NOT EXISTS appointment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  patient_id INTEGER NOT NULL,
  doctor_id INTEGER NOT NULL,
  slot_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_confirm',
  cancel_reason TEXT,
  capacity_released INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at TEXT,
  cancelled_at TEXT,
  attendance_status TEXT CHECK(attendance_status IN ('arrived','late','no_show')),
  attendance_remark TEXT,
  attendance_handled_by TEXT,
  attendance_handled_at TEXT,
  FOREIGN KEY (application_id) REFERENCES recheck_application(id),
  FOREIGN KEY (patient_id) REFERENCES patient(id),
  FOREIGN KEY (doctor_id) REFERENCES doctor(id),
  FOREIGN KEY (slot_id) REFERENCES doctor_slot(id)
);

CREATE TABLE IF NOT EXISTS reschedule_request (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL,
  old_slot_id INTEGER NOT NULL,
  new_slot_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  initiated_by_role TEXT NOT NULL,
  initiated_by_name TEXT NOT NULL,
  decided_by_role TEXT,
  decided_by_name TEXT,
  reject_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT,
  FOREIGN KEY (appointment_id) REFERENCES appointment(id),
  FOREIGN KEY (old_slot_id) REFERENCES doctor_slot(id),
  FOREIGN KEY (new_slot_id) REFERENCES doctor_slot(id)
);

CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  operator_role TEXT NOT NULL,
  operator_name TEXT NOT NULL,
  remark TEXT,
  reschedule_id INTEGER,
  old_slot_id INTEGER,
  new_slot_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (appointment_id) REFERENCES appointment(id),
  FOREIGN KEY (reschedule_id) REFERENCES reschedule_request(id),
  FOREIGN KEY (old_slot_id) REFERENCES doctor_slot(id),
  FOREIGN KEY (new_slot_id) REFERENCES doctor_slot(id)
);

CREATE TABLE IF NOT EXISTS waitlist_record (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  doctor_id INTEGER,
  department TEXT NOT NULL,
  reason TEXT NOT NULL,
  acceptable_date_from TEXT NOT NULL,
  acceptable_date_to TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK(urgency IN ('normal','urgent','emergency')),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','matched','confirmed','abandoned')),
  application_id INTEGER,
  appointment_id INTEGER,
  matched_slot_id INTEGER,
  matched_at TEXT,
  confirmed_at TEXT,
  abandoned_at TEXT,
  abandon_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT NOT NULL,
  FOREIGN KEY (patient_id) REFERENCES patient(id),
  FOREIGN KEY (doctor_id) REFERENCES doctor(id),
  FOREIGN KEY (application_id) REFERENCES recheck_application(id),
  FOREIGN KEY (appointment_id) REFERENCES appointment(id),
  FOREIGN KEY (matched_slot_id) REFERENCES doctor_slot(id)
);

CREATE TABLE IF NOT EXISTS waitlist_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  waitlist_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  operator_role TEXT NOT NULL,
  operator_name TEXT NOT NULL,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (waitlist_id) REFERENCES waitlist_record(id)
);

CREATE INDEX IF NOT EXISTS idx_slot_doctor_date ON doctor_slot(doctor_id, date);
CREATE INDEX IF NOT EXISTS idx_appt_patient ON appointment(patient_id);
CREATE INDEX IF NOT EXISTS idx_appt_status ON appointment(status);
CREATE INDEX IF NOT EXISTS idx_history_appt ON status_history(appointment_id);
CREATE INDEX IF NOT EXISTS idx_reschedule_appt ON reschedule_request(appointment_id);
CREATE INDEX IF NOT EXISTS idx_reschedule_status ON reschedule_request(status);
CREATE INDEX IF NOT EXISTS idx_waitlist_patient ON waitlist_record(patient_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist_record(status);
CREATE INDEX IF NOT EXISTS idx_waitlist_department ON waitlist_record(department);
CREATE INDEX IF NOT EXISTS idx_waitlist_log ON waitlist_log(waitlist_id);
`;

db.exec(initSql);

// attendance_log 表需要在迁移后创建（避免旧库因缺列导致主初始化脚本失败）
const attendanceTableSql = `
CREATE TABLE IF NOT EXISTS attendance_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('register','revoke')),
  old_status TEXT CHECK(old_status IN ('arrived','late','no_show')),
  new_status TEXT CHECK(new_status IN ('arrived','late','no_show')),
  old_remark TEXT,
  new_remark TEXT,
  operator_role TEXT NOT NULL,
  operator_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (appointment_id) REFERENCES appointment(id)
);
`;
db.exec(attendanceTableSql);

// ---------- 数据库迁移：兼容旧库，自动添加缺失字段 ----------
// SQLite 支持 ALTER TABLE ADD COLUMN；已有列会静默跳过（通过 PRAGMA table_info 先检查）
function columnExists(table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some(r => r.name === column);
}
function addColumnIfMissing(table: string, column: string, definition: string) {
  if (!columnExists(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[db-migrate] 表 ${table} 新增列 ${column}`);
  }
}

// 为旧库 status_history 补齐改期相关 3 个字段（核心根因修复）
addColumnIfMissing('status_history', 'reschedule_id', 'INTEGER');
addColumnIfMissing('status_history', 'old_slot_id', 'INTEGER');
addColumnIfMissing('status_history', 'new_slot_id', 'INTEGER');

// 为旧库 reschedule_request 补齐新版字段（如果旧库是早期版本的 reschedule_request）
addColumnIfMissing('reschedule_request', 'initiated_by_role', 'TEXT');
addColumnIfMissing('reschedule_request', 'initiated_by_name', 'TEXT');
addColumnIfMissing('reschedule_request', 'decided_by_role', 'TEXT');
addColumnIfMissing('reschedule_request', 'decided_by_name', 'TEXT');

// 为旧库 appointment 补齐字段（防止早期版本缺失）
addColumnIfMissing('appointment', 'capacity_released', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('appointment', 'pending_reschedule_id', 'INTEGER');
addColumnIfMissing('appointment', 'reschedule_count', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('appointment', 'from_waitlist', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('appointment', 'waitlist_id', 'INTEGER');
addColumnIfMissing('appointment', 'waitlist_matched_at', 'TEXT');
addColumnIfMissing('appointment', 'waitlist_handled_by', 'TEXT');
addColumnIfMissing('appointment', 'attendance_status', 'TEXT');
addColumnIfMissing('appointment', 'attendance_remark', 'TEXT');
addColumnIfMissing('appointment', 'attendance_handled_by', 'TEXT');
addColumnIfMissing('appointment', 'attendance_handled_at', 'TEXT');

// 补齐索引（旧库可能没有）
function indexExists(name: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?").get(name);
  return !!row;
}
if (!indexExists('idx_reschedule_appt')) db.exec('CREATE INDEX idx_reschedule_appt ON reschedule_request(appointment_id)');
if (!indexExists('idx_reschedule_status')) db.exec('CREATE INDEX idx_reschedule_status ON reschedule_request(status)');
if (!indexExists('idx_history_appt')) db.exec('CREATE INDEX idx_history_appt ON status_history(appointment_id)');
if (!indexExists('idx_waitlist_patient')) db.exec('CREATE INDEX idx_waitlist_patient ON waitlist_record(patient_id)');
if (!indexExists('idx_waitlist_status')) db.exec('CREATE INDEX idx_waitlist_status ON waitlist_record(status)');
if (!indexExists('idx_waitlist_department')) db.exec('CREATE INDEX idx_waitlist_department ON waitlist_record(department)');
if (!indexExists('idx_waitlist_log')) db.exec('CREATE INDEX idx_waitlist_log ON waitlist_log(waitlist_id)');
if (!indexExists('idx_appt_attendance')) db.exec('CREATE INDEX idx_appt_attendance ON appointment(attendance_status)');
if (!indexExists('idx_attendance_log_appt')) db.exec('CREATE INDEX idx_attendance_log_appt ON attendance_log(appointment_id)');

// 归一化旧版状态值
const upd = db.prepare("UPDATE reschedule_request SET status = 'pending' WHERE status = 'pending_patient'").run();
if (upd.changes > 0) console.log(`[db-migrate] 归一化 ${upd.changes} 条 reschedule_request status: pending_patient → pending`);

// ---------- 迁移结束 ----------

function seedIfEmpty() {
  const doctorCount = db.prepare('SELECT COUNT(*) as c FROM doctor').get() as { c: number };
  if (doctorCount.c === 0) {
    const insertDoctor = db.prepare(
      'INSERT INTO doctor (name, department, title) VALUES (?, ?, ?)',
    );
    insertDoctor.run('张伟明', '心内科', '主任医师');
    insertDoctor.run('李雪华', '内分泌科', '副主任医师');
    insertDoctor.run('王建国', '骨科', '主治医师');
  }
  const patientCount = db.prepare('SELECT COUNT(*) as c FROM patient').get() as { c: number };
  if (patientCount.c === 0) {
    const insertPatient = db.prepare(
      'INSERT INTO patient (name, id_card, phone, medical_record_no) VALUES (?, ?, ?, ?)',
    );
    insertPatient.run('陈大海', '110101198001011234', '13800138001', 'MR20240001');
    insertPatient.run('刘小美', '110101199203054567', '13800138002', 'MR20240002');
    insertPatient.run('赵强', '110101197508127890', '13800138003', 'MR20240003');
  }
  const slotCount = db.prepare('SELECT COUNT(*) as c FROM doctor_slot').get() as { c: number };
  if (slotCount.c === 0) {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const d1 = new Date(today);
    const d2 = new Date(today);
    d2.setDate(today.getDate() + 1);
    const d3 = new Date(today);
    d3.setDate(today.getDate() + 2);
    const insertSlot = db.prepare(
      'INSERT INTO doctor_slot (doctor_id, date, period, total_capacity) VALUES (?, ?, ?, ?)',
    );
    insertSlot.run(1, fmt(d1), 'morning', 20);
    insertSlot.run(1, fmt(d1), 'afternoon', 15);
    insertSlot.run(1, fmt(d2), 'morning', 20);
    insertSlot.run(2, fmt(d1), 'morning', 25);
    insertSlot.run(2, fmt(d2), 'afternoon', 20);
    insertSlot.run(3, fmt(d3), 'morning', 30);
  }
}

seedIfEmpty();

export default db;
