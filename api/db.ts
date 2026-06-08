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
  FOREIGN KEY (application_id) REFERENCES recheck_application(id),
  FOREIGN KEY (patient_id) REFERENCES patient(id),
  FOREIGN KEY (doctor_id) REFERENCES doctor(id),
  FOREIGN KEY (slot_id) REFERENCES doctor_slot(id)
);

CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  operator_role TEXT NOT NULL,
  operator_name TEXT NOT NULL,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (appointment_id) REFERENCES appointment(id)
);

CREATE INDEX IF NOT EXISTS idx_slot_doctor_date ON doctor_slot(doctor_id, date);
CREATE INDEX IF NOT EXISTS idx_appt_patient ON appointment(patient_id);
CREATE INDEX IF NOT EXISTS idx_appt_status ON appointment(status);
CREATE INDEX IF NOT EXISTS idx_history_appt ON status_history(appointment_id);
`;

db.exec(initSql);

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
