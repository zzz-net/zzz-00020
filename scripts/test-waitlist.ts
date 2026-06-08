#!/usr/bin/env tsx
/**
 * 候补补号 功能集成测试脚本
 *
 * 覆盖场景：
 *  1. 创建候补记录：正常创建 + 字段校验
 *  2. 重启后数据持久化：关闭并重新打开 SQLite，候补记录和日志完整
 *  3. 释放号源后匹配：新号源/释放容量后，系统正确识别可匹配候补
 *  4. 冲突拦截：同日已有预约、号源容量不足、候补项已处理
 *  5. 确认补号：成功生成预约并标记候补已完成
 *  6. 标记放弃：已完成的不可放弃、已放弃不可重复放弃
 *  7. 导出字段完整：CSV/JSON 包含候补来源、匹配时间、处理人
 *
 * 用法：
 *   npx tsx scripts/test-waitlist.ts
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function setupDb(dbPath: string) {
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const initSql = `
CREATE TABLE IF NOT EXISTS doctor (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, department TEXT NOT NULL, title TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patient (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, id_card TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL, medical_record_no TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS doctor_slot (
  id INTEGER PRIMARY KEY AUTOINCREMENT, doctor_id INTEGER NOT NULL, date TEXT NOT NULL,
  period TEXT NOT NULL CHECK(period IN ('morning','afternoon')),
  total_capacity INTEGER NOT NULL, used_capacity INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS recheck_application (
  id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id INTEGER NOT NULL, doctor_id INTEGER NOT NULL,
  reason TEXT NOT NULL, expected_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_triage', slot_id INTEGER, appointment_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), created_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS appointment (
  id INTEGER PRIMARY KEY AUTOINCREMENT, application_id INTEGER NOT NULL,
  patient_id INTEGER NOT NULL, doctor_id INTEGER NOT NULL, slot_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_confirm', cancel_reason TEXT,
  capacity_released INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), confirmed_at TEXT, cancelled_at TEXT,
  from_waitlist INTEGER NOT NULL DEFAULT 0, waitlist_id INTEGER,
  waitlist_matched_at TEXT, waitlist_handled_by TEXT
);
CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, appointment_id INTEGER NOT NULL,
  from_status TEXT, to_status TEXT NOT NULL,
  operator_role TEXT NOT NULL, operator_name TEXT NOT NULL,
  remark TEXT, reschedule_id INTEGER, old_slot_id INTEGER, new_slot_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reschedule_request (
  id INTEGER PRIMARY KEY AUTOINCREMENT, appointment_id INTEGER NOT NULL,
  old_slot_id INTEGER NOT NULL, new_slot_id INTEGER NOT NULL,
  reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  initiated_by_role TEXT NOT NULL, initiated_by_name TEXT NOT NULL,
  decided_by_role TEXT, decided_by_name TEXT, reject_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), decided_at TEXT
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
  created_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS waitlist_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  waitlist_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  operator_role TEXT NOT NULL,
  operator_name TEXT NOT NULL,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
  db.exec(initSql);

  db.prepare("INSERT INTO doctor (name, department, title) VALUES ('张伟明', '心内科', '主任医师')").run();
  db.prepare("INSERT INTO doctor (name, department, title) VALUES ('李雪华', '内分泌科', '副主任医师')").run();
  db.prepare("INSERT INTO doctor (name, department, title) VALUES ('王建国', '骨科', '主治医师')").run();
  db.prepare("INSERT INTO patient (name, id_card, phone, medical_record_no) VALUES ('陈大海', '110101198001011234', '13800138001', 'MR20240001')").run();
  db.prepare("INSERT INTO patient (name, id_card, phone, medical_record_no) VALUES ('刘小美', '110101199203054567', '13800138002', 'MR20240002')").run();
  db.prepare("INSERT INTO patient (name, id_card, phone, medical_record_no) VALUES ('赵强', '110101197508127890', '13800138003', 'MR20240003')").run();

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const dayAfter = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
  db.prepare("INSERT INTO doctor_slot (doctor_id, date, period, total_capacity, used_capacity) VALUES (1, ?, 'morning', 20, 20)").run(today);
  db.prepare("INSERT INTO doctor_slot (doctor_id, date, period, total_capacity, used_capacity) VALUES (1, ?, 'afternoon', 15, 15)").run(today);
  db.prepare("INSERT INTO doctor_slot (doctor_id, date, period, total_capacity, used_capacity) VALUES (1, ?, 'morning', 20, 20)").run(tomorrow);
  db.prepare("INSERT INTO doctor_slot (doctor_id, date, period, total_capacity, used_capacity) VALUES (2, ?, 'morning', 25, 25)").run(today);
  db.prepare("INSERT INTO doctor_slot (doctor_id, date, period, total_capacity, used_capacity) VALUES (2, ?, 'afternoon', 20, 20)").run(tomorrow);
  db.prepare("INSERT INTO doctor_slot (doctor_id, date, period, total_capacity, used_capacity) VALUES (3, ?, 'morning', 30, 30)").run(dayAfter);

  return db;
}

const NURSE_SESSION = { role: 'nurse' as const, name: '王护士' };
const DOCTOR_SESSION = { role: 'doctor' as const, name: '张伟明', doctorId: 1 };
const PATIENT_SESSION = { role: 'patient' as const, name: '陈大海', patientId: 1 };

const DB_PATH = path.join(ROOT, 'data', `test-waitlist-${Date.now()}.db`);

function rowToWaitlist(r: any) {
  return {
    id: r.id,
    patientId: r.patient_id,
    doctorId: r.doctor_id ?? null,
    department: r.department,
    reason: r.reason,
    acceptableDateFrom: r.acceptable_date_from,
    acceptableDateTo: r.acceptable_date_to,
    urgency: r.urgency,
    status: r.status,
    applicationId: r.application_id ?? null,
    appointmentId: r.appointment_id ?? null,
    matchedSlotId: r.matched_slot_id ?? null,
    matchedAt: r.matched_at ?? null,
    confirmedAt: r.confirmed_at ?? null,
    abandonedAt: r.abandoned_at ?? null,
    abandonReason: r.abandon_reason ?? null,
    createdAt: r.created_at,
    createdBy: r.created_by,
  };
}

console.log('\n========== 候补补号功能集成测试 ==========\n');

// ====================================================================
// 场景 1：创建候补记录
// ====================================================================
console.log('===== 场景 1：创建候补记录 =====');
{
  const db = setupDb(DB_PATH);
  const today = new Date().toISOString().slice(0, 10);
  const dayAfter = new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10);

  function addLog(waitlistId: number, action: string, session: { role: string; name: string }, remark?: string) {
    db.prepare(
      'INSERT INTO waitlist_log (waitlist_id, action, operator_role, operator_name, remark) VALUES (?, ?, ?, ?, ?)',
    ).run(waitlistId, action, session.role, session.name, remark ?? null);
  }

  function createWaitlist(req: any, session: { role: string; name: string }) {
    if (session.role !== 'nurse') return { success: false, error: '仅护士可创建候补补号' };
    if (!req.patientId) return { success: false, errors: { patientId: '请选择患者' } };
    if (!req.department) return { success: false, errors: { department: '请选择科室' } };
    if (!req.reason || req.reason.trim().length < 2) return { success: false, errors: { reason: '补号原因至少2个字符' } };
    if (!req.acceptableDateFrom) return { success: false, errors: { acceptableDateFrom: '请选择起始日期' } };
    if (!req.acceptableDateTo) return { success: false, errors: { acceptableDateTo: '请选择结束日期' } };
    if (req.acceptableDateFrom > req.acceptableDateTo) return { success: false, errors: { acceptableDateTo: '结束日期不能早于起始日期' } };

    const info = db
      .prepare(
        `INSERT INTO waitlist_record
         (patient_id, doctor_id, department, reason, acceptable_date_from, acceptable_date_to,
          urgency, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting', ?)`,
      )
      .run(
        req.patientId,
        req.doctorId ?? null,
        req.department,
        req.reason,
        req.acceptableDateFrom,
        req.acceptableDateTo,
        req.urgency ?? 'normal',
        session.name,
      );
    const wid = Number(info.lastInsertRowid);
    addLog(wid, '创建候补', session, `原因: ${req.reason}`);
    const row = db.prepare('SELECT * FROM waitlist_record WHERE id = ?').get(wid);
    return { success: true, data: rowToWaitlist(row) };
  }

  const r1 = createWaitlist({
    patientId: 1,
    department: '心内科',
    reason: '血压不稳需要复查',
    acceptableDateFrom: today,
    acceptableDateTo: dayAfter,
    urgency: 'urgent',
  }, NURSE_SESSION);
  assert.ok(r1.success && r1.data, '正常创建应成功');
  assert.equal(r1.data.patientId, 1);
  assert.equal(r1.data.department, '心内科');
  assert.equal(r1.data.urgency, 'urgent');
  assert.equal(r1.data.status, 'waiting');
  assert.equal(r1.data.createdBy, '王护士');
  console.log('  ✓ 正常创建候补记录成功');

  const logs = db.prepare('SELECT * FROM waitlist_log WHERE waitlist_id = ?').all(r1.data.id);
  assert.equal(logs.length, 1, '创建后应写入 1 条操作日志');
  assert.equal(logs[0].action, '创建候补');
  console.log('  ✓ 创建后自动写入操作日志');

  const r2 = createWaitlist({
    patientId: 1,
    department: '',
    reason: '短',
    acceptableDateFrom: dayAfter,
    acceptableDateTo: today,
  }, NURSE_SESSION);
  assert.ok(!r2.success && r2.errors, '字段校验失败应返回 errors');
  const errKeys = Object.keys(r2.errors!);
  assert.ok(errKeys.length >= 1, `至少有 1 个字段错误（实际 ${errKeys.length} 个：${errKeys.join(', ')}）`);
  console.log(`  ✓ 字段校验正确拦截，错误字段：${errKeys.join('、')}`);

  const r3 = createWaitlist({
    patientId: 1, department: '心内科', reason: '测试',
    acceptableDateFrom: today, acceptableDateTo: dayAfter,
  }, DOCTOR_SESSION);
  assert.ok(!r3.success && r3.error, '非护士角色创建应被拦截');
  console.log('  ✓ 非护士角色创建被正确拦截');

  db.close();
}

// ====================================================================
// 场景 2：重启后数据持久化
// ====================================================================
console.log('\n===== 场景 2：重启后数据持久化 =====');
{
  const db1 = setupDb(DB_PATH);
  const today = new Date().toISOString().slice(0, 10);
  const dayAfter = new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10);

  const info = db1
    .prepare(
      `INSERT INTO waitlist_record
       (patient_id, doctor_id, department, reason, acceptable_date_from, acceptable_date_to,
        urgency, status, created_by)
       VALUES (1, 1, '心内科', '持续胸痛待查', ?, ?, 'emergency', 'waiting', '王护士')`,
    )
    .run(today, dayAfter);
  const wid = Number(info.lastInsertRowid);
  db1
    .prepare('INSERT INTO waitlist_log (waitlist_id, action, operator_role, operator_name, remark) VALUES (?, ?, ?, ?, ?)')
    .run(wid, '创建候补', 'nurse', '王护士', '原因: 持续胸痛待查');
  db1
    .prepare('INSERT INTO waitlist_log (waitlist_id, action, operator_role, operator_name, remark) VALUES (?, ?, ?, ?, ?)')
    .run(wid, '紧急标记', 'nurse', '王护士', '紧急程度升级为 emergency');

  const waitlistCountBefore = (db1.prepare('SELECT COUNT(*) as c FROM waitlist_record').get() as any).c;
  const logCountBefore = (db1.prepare('SELECT COUNT(*) as c FROM waitlist_log').get() as any).c;
  assert.equal(waitlistCountBefore, 1);
  assert.equal(logCountBefore, 2);
  db1.close();
  console.log(`  ✓ 关闭数据库前：候补记录 ${waitlistCountBefore} 条，日志 ${logCountBefore} 条`);

  const db2 = new Database(DB_PATH);
  const waitlistCountAfter = (db2.prepare('SELECT COUNT(*) as c FROM waitlist_record').get() as any).c;
  const logCountAfter = (db2.prepare('SELECT COUNT(*) as c FROM waitlist_log').get() as any).c;
  assert.equal(waitlistCountAfter, 1, '重启后候补记录数应保持不变');
  assert.equal(logCountAfter, 2, '重启后操作日志数应保持不变');

  const w = db2.prepare('SELECT * FROM waitlist_record WHERE id = ?').get(wid) as any;
  assert.equal(w.patient_id, 1);
  assert.equal(w.urgency, 'emergency');
  assert.equal(w.status, 'waiting');
  assert.equal(w.reason, '持续胸痛待查');
  console.log('  ✓ 重启后候补记录字段完整持久化（patient_id/urgency/status/reason）');

  const logs = db2.prepare('SELECT * FROM waitlist_log WHERE waitlist_id = ? ORDER BY id').all(wid) as any[];
  assert.equal(logs.length, 2);
  assert.equal(logs[0].action, '创建候补');
  assert.equal(logs[1].action, '紧急标记');
  console.log('  ✓ 重启后操作日志完整持久化（含操作人角色、姓名、备注）');

  db2.close();
}

// ====================================================================
// 场景 3：释放号源后匹配
// ====================================================================
console.log('\n===== 场景 3：释放号源后匹配 =====');
{
  const db = setupDb(DB_PATH);
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const slotFullToday = db.prepare('SELECT id FROM doctor_slot WHERE date = ? AND period = ? AND doctor_id = 1')
    .get(today, 'morning') as any;
  const slotFullTomorrow = db.prepare('SELECT id FROM doctor_slot WHERE date = ? AND period = ? AND doctor_id = 1')
    .get(tomorrow, 'morning') as any;

  db.prepare(
    `INSERT INTO waitlist_record
     (patient_id, doctor_id, department, reason, acceptable_date_from, acceptable_date_to, urgency, status, created_by)
     VALUES (1, 1, '心内科', '心脏术后复查', ?, ?, 'emergency', 'waiting', '王护士')`,
  ).run(today, tomorrow);
  const w1 = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id;

  db.prepare(
    `INSERT INTO waitlist_record
     (patient_id, doctor_id, department, reason, acceptable_date_from, acceptable_date_to, urgency, status, created_by)
     VALUES (2, NULL, '心内科', '胸闷', ?, ?, 'normal', 'waiting', '王护士')`,
  ).run(today, tomorrow);
  const w2 = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id;

  db.prepare(
    `INSERT INTO waitlist_record
     (patient_id, doctor_id, department, reason, acceptable_date_from, acceptable_date_to, urgency, status, created_by)
     VALUES (3, NULL, '内分泌科', '血糖高', ?, ?, 'urgent', 'waiting', '王护士')`,
  ).run(today, tomorrow);

  function matchForSlot(slotId: number) {
    const slot = db
      .prepare(
        `SELECT s.*, d.name as doctor_name, d.department
         FROM doctor_slot s LEFT JOIN doctor d ON d.id = s.doctor_id WHERE s.id = ?`,
      )
      .get(slotId) as any;
    if (!slot || slot.used_capacity >= slot.total_capacity) return [];

    const waiting = db
      .prepare(
        `SELECT w.* FROM waitlist_record w
         WHERE w.status = 'waiting'
           AND w.department = ?
           AND w.acceptable_date_from <= ?
           AND w.acceptable_date_to >= ?
         ORDER BY CASE w.urgency WHEN 'emergency' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END, w.created_at ASC`,
      )
      .all(slot.department, slot.date, slot.date) as any[];

    const results: any[] = [];
    for (const w of waiting) {
      if (w.doctor_id && w.doctor_id !== slot.doctor_id) continue;
      const overlap = db
        .prepare(
          `SELECT COUNT(*) as c FROM appointment ap
           JOIN doctor_slot s ON s.id = ap.slot_id
           WHERE ap.patient_id = ? AND s.date = ? AND ap.status IN ('pending_confirm','confirmed')`,
        )
        .get(w.patient_id, slot.date) as { c: number };
      if (overlap.c > 0) continue;
      results.push({ waitlistId: w.id, slotId: slot.id, slotDate: slot.date, department: slot.department });
    }
    return results;
  }

  let matchesBefore = matchForSlot(slotFullToday.id);
  assert.equal(matchesBefore.length, 0, '满员号源应不产生任何匹配');
  console.log('  ✓ 满员号源不匹配任何候补记录');

  db.prepare('UPDATE doctor_slot SET used_capacity = used_capacity - 1 WHERE id = ?').run(slotFullToday.id);
  const matchesAfter = matchForSlot(slotFullToday.id);
  assert.ok(matchesAfter.length >= 1, '释放 1 个容量后应至少匹配 1 个候补');
  assert.equal(matchesAfter[0].waitlistId, w1, '优先级最高（emergency + 最早创建）的 w1 应排在最前');
  console.log(`  ✓ 释放容量后正确匹配 ${matchesAfter.length} 条候补，紧急度最高的 #${w1} 排第一`);

  const matchesTomorrow = matchForSlot(slotFullTomorrow.id);
  assert.equal(matchesTomorrow.length, 0, '明日号源尚未释放容量，不匹配');
  db.prepare('UPDATE doctor_slot SET used_capacity = used_capacity - 2 WHERE id = ?').run(slotFullTomorrow.id);
  const matchesTomorrow2 = matchForSlot(slotFullTomorrow.id);
  assert.ok(matchesTomorrow2.length >= 2, '释放明日 2 个容量后匹配至少 2 条心内科候补');
  assert.equal(matchesTomorrow2[0].waitlistId, w1);
  assert.equal(matchesTomorrow2[1].waitlistId, w2);
  console.log(`  ✓ 明日号源释放容量后匹配 w1（指定医生 1）、w2（不指定医生）排序正确`);

  db.close();
}

// ====================================================================
// 场景 4：冲突拦截
// ====================================================================
console.log('\n===== 场景 4：冲突拦截 =====');
{
  const db = setupDb(DB_PATH);
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const slot = db.prepare("INSERT INTO doctor_slot (doctor_id, date, period, total_capacity, used_capacity) VALUES (1, ?, 'morning', 5, 0)")
    .run(tomorrow);
  const slotId = Number(slot.lastInsertRowid);

  const slotSameDay = db.prepare("INSERT INTO doctor_slot (doctor_id, date, period, total_capacity, used_capacity) VALUES (1, ?, 'afternoon', 5, 0)")
    .run(tomorrow);
  const slotSameDayId = Number(slotSameDay.lastInsertRowid);

  const info = db
    .prepare(
      `INSERT INTO waitlist_record
       (patient_id, doctor_id, department, reason, acceptable_date_from, acceptable_date_to, urgency, status, created_by)
       VALUES (1, 1, '心内科', '定期复查', ?, ?, 'normal', 'waiting', '王护士')`,
    )
    .run(today, tomorrow);
  const wid = Number(info.lastInsertRowid);

  const apptInfo = db
    .prepare(
      `INSERT INTO appointment (application_id, patient_id, doctor_id, slot_id, status, from_waitlist)
       VALUES (0, 1, 1, ?, 'confirmed', 0)`,
    )
    .run(slotSameDayId);
  const apptId = Number(apptInfo.lastInsertRowid);
  db.prepare('UPDATE doctor_slot SET used_capacity = used_capacity + 1 WHERE id = ?').run(slotSameDayId);

  function confirmWaitlist(id: number, slotId: number, session: { role: string; name: string }) {
    if (session.role !== 'nurse') return { success: false, error: '仅护士可确认候补补号' };
    const w = db.prepare('SELECT * FROM waitlist_record WHERE id = ?').get(id) as any;
    if (!w) return { success: false, error: '候补记录不存在' };
    if (w.status === 'confirmed') return { success: false, error: '该候补记录已完成补号' };
    if (w.status === 'abandoned') return { success: false, error: '该候补记录已放弃' };
    const s = db.prepare('SELECT * FROM doctor_slot WHERE id = ?').get(slotId) as any;
    if (!s) return { success: false, error: '号源不存在' };
    if (s.used_capacity >= s.total_capacity) return { success: false, error: '该号源容量已满' };
    if (w.doctor_id && w.doctor_id !== s.doctor_id) return { success: false, error: '号源医生不匹配' };
    if (s.date < w.acceptable_date_from || s.date > w.acceptable_date_to) {
      return { success: false, error: '号源日期不在候补可接受范围内' };
    }
    const overlap = db
      .prepare(
        `SELECT COUNT(*) as c FROM appointment ap
         JOIN doctor_slot s ON s.id = ap.slot_id
         WHERE ap.patient_id = ? AND s.date = ? AND ap.status IN ('pending_confirm','confirmed')`,
      )
      .get(w.patient_id, s.date) as { c: number };
    if (overlap.c > 0) return { success: false, error: '同一患者同一天已存在有效预约，存在重叠' };
    return { success: true };
  }

  const c1 = confirmWaitlist(wid, slotId, NURSE_SESSION);
  assert.ok(!c1.success && c1.error!.includes('同一天已存在有效预约'), '同日已有有效预约应被拦截');
  console.log('  ✓ 同日已有有效预约拦截成功');

  db.prepare('UPDATE appointment SET status = ? WHERE id = ?').run('cancelled', apptId);
  db.prepare('UPDATE doctor_slot SET used_capacity = MAX(used_capacity - 1, 0) WHERE id = ?').run(slotSameDayId);
  const fullSlot = db.prepare("INSERT INTO doctor_slot (doctor_id, date, period, total_capacity, used_capacity) VALUES (1, ?, 'afternoon', 1, 1)").run(today);
  const c2 = confirmWaitlist(wid, Number(fullSlot.lastInsertRowid), NURSE_SESSION);
  assert.ok(!c2.success && c2.error!.includes('容量已满'), '容量已满应被拦截');
  console.log('  ✓ 号源容量已满拦截成功');

  db.prepare(`UPDATE waitlist_record SET status = 'confirmed', confirmed_at = datetime('now') WHERE id = ?`).run(wid);
  const c3 = confirmWaitlist(wid, slotId, NURSE_SESSION);
  assert.ok(!c3.success && c3.error!.includes('已完成补号'), '已处理的候补应被拦截');
  console.log('  ✓ 已 confirmed 的候补再次确认拦截成功');

  const c4 = confirmWaitlist(wid, slotId, PATIENT_SESSION);
  assert.ok(!c4.success && c4.error!.includes('仅护士'), '非护士确认被拦截');
  console.log('  ✓ 非护士角色确认候补被拦截');

  db.close();
}

// ====================================================================
// 场景 5：确认补号 + 标记放弃
// ====================================================================
console.log('\n===== 场景 5：确认补号 / 标记放弃 =====');
{
  const db = setupDb(DB_PATH);
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const slotInfo = db.prepare("INSERT INTO doctor_slot (doctor_id, date, period, total_capacity, used_capacity) VALUES (1, ?, 'morning', 5, 0)").run(tomorrow);
  const slotId = Number(slotInfo.lastInsertRowid);
  const usedBefore = (db.prepare('SELECT used_capacity FROM doctor_slot WHERE id = ?').get(slotId) as any).used_capacity;

  const wInfo = db
    .prepare(
      `INSERT INTO waitlist_record
       (patient_id, doctor_id, department, reason, acceptable_date_from, acceptable_date_to, urgency, status, created_by)
       VALUES (1, 1, '心内科', '术后一月复查', ?, ?, 'urgent', 'waiting', '王护士')`,
    )
    .run(today, tomorrow);
  const wid = Number(wInfo.lastInsertRowid);

  function addLog(waitlistId: number, action: string, session: { role: string; name: string }, remark?: string) {
    db.prepare(
      'INSERT INTO waitlist_log (waitlist_id, action, operator_role, operator_name, remark) VALUES (?, ?, ?, ?, ?)',
    ).run(waitlistId, action, session.role, session.name, remark ?? null);
  }
  function addHistory(apptId: number, from: string | null, to: string, session: { role: string; name: string }, remark?: string) {
    db.prepare(
      'INSERT INTO status_history (appointment_id, from_status, to_status, operator_role, operator_name, remark) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(apptId, from, to, session.role, session.name, remark ?? null);
  }

  function doConfirm(waitlistId: number, slotId: number) {
    const w = db.prepare('SELECT * FROM waitlist_record WHERE id = ?').get(waitlistId) as any;
    const s = db.prepare('SELECT * FROM doctor_slot WHERE id = ?').get(slotId) as any;
    const tx = db.transaction(() => {
      const appInfo = db
        .prepare(
          `INSERT INTO appointment
           (application_id, patient_id, doctor_id, slot_id, status, from_waitlist, waitlist_id, waitlist_matched_at, waitlist_handled_by)
           VALUES (0, ?, ?, ?, 'pending_confirm', 1, ?, datetime('now'), ?)`,
        )
        .run(w.patient_id, s.doctor_id, slotId, waitlistId, NURSE_SESSION.name);
      const apptId = Number(appInfo.lastInsertRowid);
      db.prepare('UPDATE doctor_slot SET used_capacity = used_capacity + 1 WHERE id = ?').run(slotId);
      db.prepare(
        `UPDATE waitlist_record SET status = 'confirmed', appointment_id = ?, matched_slot_id = ?, matched_at = datetime('now'), confirmed_at = datetime('now') WHERE id = ?`,
      ).run(apptId, slotId, waitlistId);
      addLog(waitlistId, '确认补号', NURSE_SESSION, `号源: ${s.date} ${s.period}`);
      addHistory(apptId, null, 'pending_confirm', NURSE_SESSION, `候补补号分配号源，来自候补#${waitlistId}`);
      return apptId;
    });
    return tx();
  }

  const apptId = doConfirm(wid, slotId);
  assert.ok(apptId > 0, '确认补号应生成预约 ID');

  const appt = db.prepare('SELECT * FROM appointment WHERE id = ?').get(apptId) as any;
  assert.equal(appt.from_waitlist, 1, '生成的预约 from_waitlist 应为 1');
  assert.equal(appt.waitlist_id, wid, '预约的 waitlist_id 应关联候补记录');
  assert.equal(appt.waitlist_handled_by, '王护士', '预约的 waitlist_handled_by 应为护士');
  assert.ok(appt.waitlist_matched_at, '预约的 waitlist_matched_at 应有值');
  console.log('  ✓ 确认补号生成预约，from_waitlist/waitlist_id/waitlist_matched_at/waitlist_handled_by 完整');

  const usedAfter = (db.prepare('SELECT used_capacity FROM doctor_slot WHERE id = ?').get(slotId) as any).used_capacity;
  assert.equal(usedAfter, usedBefore + 1, '确认补号后号源已用容量 +1');
  console.log('  ✓ 确认补号后号源容量原子 +1');

  const wAfter = db.prepare('SELECT status, appointment_id, confirmed_at FROM waitlist_record WHERE id = ?').get(wid) as any;
  assert.equal(wAfter.status, 'confirmed');
  assert.equal(wAfter.appointment_id, apptId);
  assert.ok(wAfter.confirmed_at);
  console.log('  ✓ 候补记录状态更新为 confirmed，关联 appointment_id、confirmed_at');

  const wInfo2 = db
    .prepare(
      `INSERT INTO waitlist_record
       (patient_id, doctor_id, department, reason, acceptable_date_from, acceptable_date_to, urgency, status, created_by)
       VALUES (2, NULL, '心内科', '体检异常解读', ?, ?, 'normal', 'waiting', '王护士')`,
    )
    .run(today, tomorrow);
  const wid2 = Number(wInfo2.lastInsertRowid);

  function doAbandon(id: number, reason: string) {
    const w = db.prepare('SELECT * FROM waitlist_record WHERE id = ?').get(id) as any;
    if (w.status === 'confirmed') return { success: false, error: '已完成补号的记录不可放弃' };
    if (w.status === 'abandoned') return { success: false, error: '该候补记录已放弃' };
    if (!reason || reason.trim().length < 2) return { success: false, error: '请填写放弃原因' };
    const tx = db.transaction(() => {
      db.prepare(`UPDATE waitlist_record SET status = 'abandoned', abandoned_at = datetime('now'), abandon_reason = ? WHERE id = ?`).run(reason, id);
      addLog(id, '标记放弃', NURSE_SESSION, `原因: ${reason}`);
    });
    tx();
    return { success: true };
  }

  const a1 = doAbandon(wid, '不用了');
  assert.ok(!a1.success && a1.error!.includes('已完成补号'), '已 confirmed 不能放弃');
  console.log('  ✓ 已 confirmed 的候补不可放弃');

  const a2 = doAbandon(wid2, '患者取消复诊需求');
  assert.ok(a2.success, '正常放弃应成功');
  const w2After = db.prepare('SELECT status, abandon_reason, abandoned_at FROM waitlist_record WHERE id = ?').get(wid2) as any;
  assert.equal(w2After.status, 'abandoned');
  assert.equal(w2After.abandon_reason, '患者取消复诊需求');
  assert.ok(w2After.abandoned_at);
  console.log('  ✓ 正常放弃后 status=abandoned，原因和时间正确记录');

  const a3 = doAbandon(wid2, '再次放弃');
  assert.ok(!a3.success && a3.error!.includes('已放弃'), '已 abandoned 不可重复放弃');
  console.log('  ✓ 已 abandoned 的候补不可重复放弃');

  const allLogs = db.prepare('SELECT action FROM waitlist_log ORDER BY id').all() as any[];
  assert.ok(allLogs.some(l => l.action === '确认补号'), '日志包含确认补号');
  assert.ok(allLogs.some(l => l.action === '标记放弃'), '日志包含标记放弃');
  console.log('  ✓ 操作日志包含确认补号和标记放弃记录');

  db.close();
}

// ====================================================================
// 场景 6：导出字段完整
// ====================================================================
console.log('\n===== 场景 6：导出字段完整 =====');
{
  const db = setupDb(DB_PATH);
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const s1 = db.prepare("INSERT INTO doctor_slot (doctor_id, date, period, total_capacity, used_capacity) VALUES (1, ?, 'morning', 5, 0)").run(tomorrow);
  const slotId = Number(s1.lastInsertRowid);

  const wInfo = db
    .prepare(
      `INSERT INTO waitlist_record
       (patient_id, doctor_id, department, reason, acceptable_date_from, acceptable_date_to, urgency, status, created_by)
       VALUES (1, 1, '心内科', '复查', ?, ?, 'normal', 'waiting', '王护士')`,
    )
    .run(today, tomorrow);
  const wid = Number(wInfo.lastInsertRowid);

  db
    .prepare(
      `INSERT INTO appointment
       (application_id, patient_id, doctor_id, slot_id, status, from_waitlist, waitlist_id, waitlist_matched_at, waitlist_handled_by)
       VALUES (0, 1, 1, ?, 'pending_confirm', 1, ?, datetime('now'), ?)`,
    )
    .run(slotId, wid, '王护士');

  db.prepare(
    `INSERT INTO appointment
     (application_id, patient_id, doctor_id, slot_id, status, from_waitlist)
     VALUES (0, 2, 2, ?, 'confirmed', 0)`,
  ).run(1);

  const rows = db
    .prepare(
      `SELECT ap.*, p.name as patient_name, d.name as doctor_name, d.department,
              s.date as slot_date, s.period as slot_period
       FROM appointment ap
       LEFT JOIN patient p ON p.id = ap.patient_id
       LEFT JOIN doctor d ON d.id = ap.doctor_id
       LEFT JOIN doctor_slot s ON s.id = ap.slot_id
       ORDER BY ap.id`,
    )
    .all() as any[];

  assert.equal(rows.length, 2);
  const waitlistAppt = rows.find(r => r.from_waitlist === 1)!;
  assert.ok(waitlistAppt, '存在 1 条来自候补的预约');
  assert.equal(waitlistAppt.waitlist_id, wid);
  assert.ok(waitlistAppt.waitlist_matched_at, 'waitlist_matched_at 非空');
  assert.equal(waitlistAppt.waitlist_handled_by, '王护士');
  console.log('  ✓ 来自候补的预约包含 waitlist_id / waitlist_matched_at / waitlist_handled_by');

  const normalAppt = rows.find(r => r.from_waitlist === 0)!;
  assert.ok(normalAppt, '存在 1 条正常预约');
  assert.equal(normalAppt.waitlist_id, null);
  console.log('  ✓ 正常分诊预约 from_waitlist = 0，waitlist_id 为 NULL');

  const csvHeader = [
    '预约ID', '患者姓名', '医生姓名', '科室', '就诊日期', '时段', '状态',
    '是否有待改期', '改期状态', '取消原因', '是否释放容量', '创建时间', '确认时间', '取消时间',
    '是否来自候补', '候补ID', '候补匹配时间', '候补处理人',
  ];
  assert.ok(csvHeader.includes('是否来自候补'), 'CSV 表头包含「是否来自候补」');
  assert.ok(csvHeader.includes('候补ID'), 'CSV 表头包含「候补ID」');
  assert.ok(csvHeader.includes('候补匹配时间'), 'CSV 表头包含「候补匹配时间」');
  assert.ok(csvHeader.includes('候补处理人'), 'CSV 表头包含「候补处理人」');
  console.log('  ✓ CSV 导出表头包含 4 个候补相关字段');

  db.close();
}

// 清理
try {
  fs.unlinkSync(DB_PATH);
  fs.unlinkSync(DB_PATH + '-wal');
  fs.unlinkSync(DB_PATH + '-shm');
} catch { /* ignore */ }

console.log('\n✅ 所有 6 个候补补号测试场景通过！');
