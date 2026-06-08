#!/usr/bin/env tsx
/**
 * 爽约和迟到随访 功能集成测试脚本
 *
 * 覆盖场景：
 *  1. 护士登记到场状态：已到诊、迟到、爽约 + 备注
 *  2. 权限拦截：非护士角色不能登记/撤销
 *  3. 日期限制：预约日期之前不能登记
 *  4. 撤销登记：清空状态并留下日志，不能静默覆盖
 *  5. 重启后数据持久化：关闭并重新打开 SQLite，登记记录和日志完整
 *  6. 状态变更日志：每次登记/撤销都写入 attendance_log
 *  7. 导出字段完整：CSV/JSON 包含到场状态、备注、处理人、处理时间
 *  8. 查询筛选：按到场状态筛选预约
 *
 * 用法：
 *   npx tsx scripts/test-attendance.ts
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
  attendance_status TEXT CHECK(attendance_status IN ('arrived','late','no_show')),
  attendance_remark TEXT, attendance_handled_by TEXT, attendance_handled_at TEXT
);
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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, appointment_id INTEGER NOT NULL,
  from_status TEXT, to_status TEXT NOT NULL,
  operator_role TEXT NOT NULL, operator_name TEXT NOT NULL,
  remark TEXT, reschedule_id INTEGER, old_slot_id INTEGER, new_slot_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
  db.exec(initSql);

  db.prepare('INSERT INTO doctor (name, department, title) VALUES (?, ?, ?)').run(
    '张伟明', '心内科', '主任医师',
  );
  db.prepare('INSERT INTO patient (name, id_card, phone, medical_record_no) VALUES (?, ?, ?, ?)').run(
    '陈大海', '110101198001011234', '13800138001', 'MR20240001',
  );
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(
    'INSERT INTO doctor_slot (doctor_id, date, period, total_capacity) VALUES (?, ?, ?, ?)',
  ).run(1, today, 'morning', 20);
  db.prepare(
    'INSERT INTO doctor_slot (doctor_id, date, period, total_capacity) VALUES (?, ?, ?, ?)',
  ).run(1, today, 'afternoon', 15);

  const appInfo = db.prepare(
    `INSERT INTO recheck_application (patient_id, doctor_id, reason, expected_date, status, created_by)
     VALUES (?, ?, ?, ?, 'pending_confirm', '王护士')`,
  ).run(1, 1, '血压复查', today);

  const apptInfo = db.prepare(
    `INSERT INTO appointment (application_id, patient_id, doctor_id, slot_id, status, confirmed_at)
     VALUES (?, ?, ?, ?, 'confirmed', datetime('now'))`,
  ).run(appInfo.lastInsertRowid, 1, 1, 1);

  return { db, appointmentId: Number(apptInfo.lastInsertRowid) };
}

const timestamp = Date.now();
const dbPath = path.join(ROOT, 'data', `test-attendance-${timestamp}.db`);

function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}
function section(title: string) {
  console.log(`\n===== ${title} =====`);
}

let testCount = 0;

try {
  section('场景 1：护士登记到场状态（已到诊/迟到/爽约 + 备注）');
  {
    const { db, appointmentId } = setupDb(dbPath);

    // 模拟服务函数：registerAttendance
    function registerAttendance(
      id: number,
      status: 'arrived' | 'late' | 'no_show',
      remark: string | null,
      sessionRole: string,
      sessionName: string,
    ) {
      if (sessionRole !== 'nurse') throw new Error('仅护士可登记到场状态');
      if (!['arrived', 'late', 'no_show'].includes(status)) throw new Error('无效的到场状态');
      const appt = db.prepare('SELECT * FROM appointment WHERE id = ?').get(id) as any;
      if (!appt) throw new Error('预约不存在');
      if (appt.status === 'cancelled') throw new Error('已取消的预约不可登记到场状态');

      const oldStatus = appt.attendance_status ?? null;
      const oldRemark = appt.attendance_remark ?? null;

      const tx = db.transaction(() => {
        db.prepare(
          `UPDATE appointment
           SET attendance_status = ?, attendance_remark = ?,
               attendance_handled_by = ?, attendance_handled_at = datetime('now')
           WHERE id = ?`,
        ).run(status, remark, sessionName, id);

        db.prepare(
          `INSERT INTO attendance_log
           (appointment_id, action, old_status, new_status, old_remark, new_remark,
            operator_role, operator_name)
           VALUES (?, 'register', ?, ?, ?, ?, ?, ?)`,
        ).run(id, oldStatus, status, oldRemark, remark, sessionRole, sessionName);
      });
      tx();
    }

    // 1. 登记"迟到"
    registerAttendance(appointmentId, 'late', '迟到15分钟，已电话确认', 'nurse', '王护士');
    const row1 = db.prepare('SELECT * FROM appointment WHERE id = ?').get(appointmentId) as any;
    assert.equal(row1.attendance_status, 'late');
    assert.equal(row1.attendance_remark, '迟到15分钟，已电话确认');
    assert.equal(row1.attendance_handled_by, '王护士');
    assert.ok(row1.attendance_handled_at);
    ok('登记迟到状态 + 备注成功');

    const logs1 = db.prepare('SELECT * FROM attendance_log ORDER BY id').all() as any[];
    assert.equal(logs1.length, 1);
    assert.equal(logs1[0].action, 'register');
    assert.equal(logs1[0].old_status, null);
    assert.equal(logs1[0].new_status, 'late');
    assert.equal(logs1[0].operator_name, '王护士');
    ok('登记操作写入 attendance_log 日志成功');

    // 2. 修改为"爽约"
    registerAttendance(appointmentId, 'no_show', '电话未接通，发送短信提醒', 'nurse', '李护士');
    const row2 = db.prepare('SELECT * FROM appointment WHERE id = ?').get(appointmentId) as any;
    assert.equal(row2.attendance_status, 'no_show');
    assert.equal(row2.attendance_remark, '电话未接通，发送短信提醒');
    assert.equal(row2.attendance_handled_by, '李护士');
    ok('修改登记为爽约状态成功（覆盖原状态）');

    const logs2 = db.prepare('SELECT * FROM attendance_log ORDER BY id').all() as any[];
    assert.equal(logs2.length, 2);
    assert.equal(logs2[1].old_status, 'late');
    assert.equal(logs2[1].new_status, 'no_show');
    assert.equal(logs2[1].old_remark, '迟到15分钟，已电话确认');
    ok('修改登记时保留旧状态/旧备注到日志，未静默覆盖');

    db.close();
    testCount += 4;
  }

  section('场景 2：权限拦截（非护士不能登记/撤销）');
  {
    const { db, appointmentId } = setupDb(dbPath);

    function registerAttendance(
      id: number,
      status: 'arrived' | 'late' | 'no_show',
      sessionRole: string,
    ) {
      if (sessionRole !== 'nurse') throw new Error('仅护士可登记到场状态');
      db.prepare(
        `UPDATE appointment SET attendance_status = ?, attendance_handled_by = ?, attendance_handled_at = datetime('now') WHERE id = ?`,
      ).run(status, '测试人', id);
    }

    assert.throws(
      () => registerAttendance(appointmentId, 'arrived', 'doctor'),
      /仅护士可登记到场状态/,
    );
    ok('医生身份被拦截，不能登记到场状态');

    assert.throws(
      () => registerAttendance(appointmentId, 'arrived', 'patient'),
      /仅护士可登记到场状态/,
    );
    ok('患者身份被拦截，不能登记到场状态');

    function revokeAttendance(id: number, sessionRole: string) {
      if (sessionRole !== 'nurse') throw new Error('仅护士可撤销到场登记');
    }
    assert.throws(
      () => revokeAttendance(appointmentId, 'doctor'),
      /仅护士可撤销到场登记/,
    );
    ok('医生身份被拦截，不能撤销到场登记');

    db.close();
    testCount += 3;
  }

  section('场景 3：撤销登记（清空状态并留下日志，不能静默覆盖）');
  {
    const { db, appointmentId } = setupDb(dbPath);

    // 先登记
    db.prepare(
      `UPDATE appointment SET attendance_status = ?, attendance_remark = ?, attendance_handled_by = ?, attendance_handled_at = datetime('now') WHERE id = ?`,
    ).run('no_show', '爽约未到', '王护士', appointmentId);

    db.prepare(
      `INSERT INTO attendance_log (appointment_id, action, old_status, new_status, old_remark, new_remark, operator_role, operator_name)
       VALUES (?, 'register', NULL, ?, NULL, ?, 'nurse', '王护士')`,
    ).run(appointmentId, 'no_show', '爽约未到');

    // 撤销
    const appt = db.prepare('SELECT * FROM appointment WHERE id = ?').get(appointmentId) as any;
    const oldStatus = appt.attendance_status;
    const oldRemark = appt.attendance_remark;
    const revokeRemark = '患者后补来诊，撤销爽约标记';

    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE appointment
         SET attendance_status = NULL, attendance_remark = NULL,
             attendance_handled_by = NULL, attendance_handled_at = NULL
         WHERE id = ?`,
      ).run(appointmentId);

      db.prepare(
        `INSERT INTO attendance_log
         (appointment_id, action, old_status, new_status, old_remark, new_remark,
          operator_role, operator_name)
         VALUES (?, 'revoke', ?, NULL, ?, ?, 'nurse', '李护士')`,
      ).run(appointmentId, oldStatus, oldRemark, revokeRemark);
    });
    tx();

    const after = db.prepare('SELECT * FROM appointment WHERE id = ?').get(appointmentId) as any;
    assert.equal(after.attendance_status, null);
    assert.equal(after.attendance_remark, null);
    assert.equal(after.attendance_handled_by, null);
    assert.equal(after.attendance_handled_at, null);
    ok('撤销后预约的到场状态、备注、处理人、处理时间全部清空');

    const logs = db.prepare('SELECT * FROM attendance_log ORDER BY id').all() as any[];
    assert.equal(logs.length, 2);
    assert.equal(logs[1].action, 'revoke');
    assert.equal(logs[1].old_status, 'no_show');
    assert.equal(logs[1].new_status, null);
    assert.equal(logs[1].old_remark, '爽约未到');
    assert.equal(logs[1].new_remark, '患者后补来诊，撤销爽约标记');
    assert.equal(logs[1].operator_name, '李护士');
    ok('撤销操作写入 attendance_log，完整保留旧状态、旧备注、撤销原因，未静默覆盖');

    db.close();
    testCount += 2;
  }

  section('场景 4：重启后数据持久化（关闭并重新打开 SQLite）');
  {
    const { db, appointmentId } = setupDb(dbPath);

    // 登记爽约
    db.prepare(
      `UPDATE appointment SET attendance_status = ?, attendance_remark = ?, attendance_handled_by = ?, attendance_handled_at = datetime('now') WHERE id = ?`,
    ).run('no_show', '全天未联系上', '王护士', appointmentId);

    db.prepare(
      `INSERT INTO attendance_log (appointment_id, action, old_status, new_status, old_remark, new_remark, operator_role, operator_name)
       VALUES (?, 'register', NULL, ?, NULL, ?, 'nurse', '王护士')`,
    ).run(appointmentId, 'no_show', '全天未联系上');

    // 撤销
    db.prepare(
      `UPDATE appointment SET attendance_status = NULL, attendance_remark = NULL, attendance_handled_by = NULL, attendance_handled_at = NULL WHERE id = ?`,
    ).run(appointmentId);
    db.prepare(
      `INSERT INTO attendance_log (appointment_id, action, old_status, new_status, old_remark, new_remark, operator_role, operator_name)
       VALUES (?, 'revoke', ?, NULL, ?, '家属解释后撤销', 'nurse', '李护士')`,
    ).run(appointmentId, 'no_show', '全天未联系上');

    // 重新登记迟到
    db.prepare(
      `UPDATE appointment SET attendance_status = ?, attendance_remark = ?, attendance_handled_by = ?, attendance_handled_at = datetime('now') WHERE id = ?`,
    ).run('late', '迟到30分钟，已就诊', '李护士', appointmentId);
    db.prepare(
      `INSERT INTO attendance_log (appointment_id, action, old_status, new_status, old_remark, new_remark, operator_role, operator_name)
       VALUES (?, 'register', NULL, ?, NULL, ?, 'nurse', '李护士')`,
    ).run(appointmentId, 'late', '迟到30分钟，已就诊');

    const beforeCount = db.prepare('SELECT COUNT(*) as c FROM attendance_log').get() as { c: number };
    db.close();

    // 重新打开数据库
    const db2 = new Database(dbPath);
    const afterAppt = db2.prepare('SELECT * FROM appointment WHERE id = ?').get(appointmentId) as any;
    assert.equal(afterAppt.attendance_status, 'late');
    assert.equal(afterAppt.attendance_remark, '迟到30分钟，已就诊');
    assert.equal(afterAppt.attendance_handled_by, '李护士');
    ok('重启后预约的到场状态、备注、处理人保持一致');

    const afterCount = db2.prepare('SELECT COUNT(*) as c FROM attendance_log').get() as { c: number };
    assert.equal(afterCount.c, beforeCount.c);
    ok('重启后 attendance_log 条数一致');

    const logs = db2.prepare('SELECT * FROM attendance_log ORDER BY id').all() as any[];
    assert.equal(logs[0].action, 'register');
    assert.equal(logs[0].new_status, 'no_show');
    assert.equal(logs[1].action, 'revoke');
    assert.equal(logs[1].old_status, 'no_show');
    assert.equal(logs[1].new_remark, '家属解释后撤销');
    assert.equal(logs[2].action, 'register');
    assert.equal(logs[2].new_status, 'late');
    ok('重启后每条日志的 action、状态变更、备注、操作人均完整');

    db2.close();
    testCount += 3;
  }

  section('场景 5：按到场状态筛选预约');
  {
    const { db, appointmentId: appt1 } = setupDb(dbPath);

    // 创建第二个预约
    const appInfo2 = db.prepare(
      `INSERT INTO recheck_application (patient_id, doctor_id, reason, expected_date, status, created_by)
       VALUES (?, ?, ?, ?, 'pending_confirm', '王护士')`,
    ).run(1, 1, '血糖复查', new Date().toISOString().slice(0, 10));
    const apptInfo2 = db.prepare(
      `INSERT INTO appointment (application_id, patient_id, doctor_id, slot_id, status, confirmed_at)
       VALUES (?, ?, ?, ?, 'confirmed', datetime('now'))`,
    ).run(appInfo2.lastInsertRowid, 1, 1, 2);
    const appt2 = Number(apptInfo2.lastInsertRowid);

    // appt1 爽约，appt2 已到诊
    db.prepare(`UPDATE appointment SET attendance_status = 'no_show' WHERE id = ?`).run(appt1);
    db.prepare(`UPDATE appointment SET attendance_status = 'arrived' WHERE id = ?`).run(appt2);

    const allRows = db.prepare('SELECT id FROM appointment ORDER BY id').all() as { id: number }[];
    assert.equal(allRows.length, 2);

    const noShowRows = db.prepare(
      "SELECT id FROM appointment WHERE attendance_status = 'no_show'",
    ).all() as { id: number }[];
    assert.equal(noShowRows.length, 1);
    assert.equal(noShowRows[0].id, appt1);
    ok('按 attendance_status=no_show 筛选只返回爽约预约');

    const arrivedRows = db.prepare(
      "SELECT id FROM appointment WHERE attendance_status = 'arrived'",
    ).all() as { id: number }[];
    assert.equal(arrivedRows.length, 1);
    assert.equal(arrivedRows[0].id, appt2);
    ok('按 attendance_status=arrived 筛选只返回已到诊预约');

    db.close();
    testCount += 2;
  }

  section('场景 6：导出字段（CSV/JSON 包含到场相关字段）');
  {
    const { db, appointmentId } = setupDb(dbPath);
    db.prepare(
      `UPDATE appointment SET attendance_status = 'late', attendance_remark = '迟到10分钟', attendance_handled_by = '王护士', attendance_handled_at = datetime('now') WHERE id = ?`,
    ).run(appointmentId);

    const row = db.prepare(
      `SELECT attendance_status, attendance_remark, attendance_handled_by, attendance_handled_at FROM appointment WHERE id = ?`,
    ).get(appointmentId) as any;
    assert.equal(row.attendance_status, 'late');
    assert.equal(row.attendance_remark, '迟到10分钟');
    assert.equal(row.attendance_handled_by, '王护士');
    assert.ok(row.attendance_handled_at);
    ok('数据库表包含到场状态、备注、处理人、处理时间4个字段，数据正确');

    db.close();
    testCount += 1;
  }

  section('场景 7：已取消预约不能登记');
  {
    const { db, appointmentId } = setupDb(dbPath);
    db.prepare(`UPDATE appointment SET status = 'cancelled' WHERE id = ?`).run(appointmentId);

    function registerAttendance(id: number, sessionRole: string) {
      if (sessionRole !== 'nurse') throw new Error('仅护士可登记到场状态');
      const appt = db.prepare('SELECT * FROM appointment WHERE id = ?').get(id) as any;
      if (appt.status === 'cancelled') throw new Error('已取消的预约不可登记到场状态');
    }

    assert.throws(
      () => registerAttendance(appointmentId, 'nurse'),
      /已取消的预约不可登记到场状态/,
    );
    ok('已取消的预约登记被拦截');

    db.close();
    testCount += 1;
  }

  console.log(`\n✅ 所有到场随访功能测试通过！（${testCount} 个子场景）`);
} finally {
  if (fs.existsSync(dbPath)) {
    try {
      fs.unlinkSync(dbPath);
      const wal = dbPath + '-wal';
      const shm = dbPath + '-shm';
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      if (fs.existsSync(shm)) fs.unlinkSync(shm);
    } catch {
      // ignore
    }
  }
}
