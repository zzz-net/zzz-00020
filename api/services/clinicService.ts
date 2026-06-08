import db from '../db.js';
import type {
  Doctor,
  Patient,
  DoctorSlot,
  RecheckApplication,
  Appointment,
  StatusHistory,
  CreateApplicationReq,
  CreateSlotReq,
  TriageReq,
  CancelAppointmentReq,
  RoleSession,
  OverviewStats,
} from '@shared/types';

function rowToDoctor(r: any): Doctor {
  return { id: r.id, name: r.name, department: r.department, title: r.title };
}
function rowToPatient(r: any): Patient {
  return {
    id: r.id,
    name: r.name,
    idCard: r.id_card,
    phone: r.phone,
    medicalRecordNo: r.medical_record_no,
  };
}
function rowToSlot(r: any): DoctorSlot {
  return {
    id: r.id,
    doctorId: r.doctor_id,
    doctorName: r.doctor_name,
    department: r.department,
    date: r.date,
    period: r.period,
    totalCapacity: r.total_capacity,
    usedCapacity: r.used_capacity,
    createdAt: r.created_at,
  };
}
function rowToApplication(r: any): RecheckApplication {
  return {
    id: r.id,
    patientId: r.patient_id,
    patientName: r.patient_name,
    doctorId: r.doctor_id,
    doctorName: r.doctor_name,
    department: r.department,
    reason: r.reason,
    expectedDate: r.expected_date,
    status: r.status,
    slotId: r.slot_id,
    appointmentId: r.appointment_id,
    createdAt: r.created_at,
    createdBy: r.created_by,
  };
}
function rowToAppointment(r: any): Appointment {
  return {
    id: r.id,
    applicationId: r.application_id,
    patientId: r.patient_id,
    patientName: r.patient_name,
    doctorId: r.doctor_id,
    doctorName: r.doctor_name,
    department: r.department,
    slotId: r.slot_id,
    slotDate: r.slot_date,
    slotPeriod: r.slot_period,
    status: r.status,
    cancelReason: r.cancel_reason,
    capacityReleased: !!r.capacity_released,
    createdAt: r.created_at,
    confirmedAt: r.confirmed_at,
    cancelledAt: r.cancelled_at,
  };
}
function rowToHistory(r: any): StatusHistory {
  return {
    id: r.id,
    appointmentId: r.appointment_id,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    operatorRole: r.operator_role,
    operatorName: r.operator_name,
    remark: r.remark,
    createdAt: r.created_at,
  };
}

export function listDoctors(): Doctor[] {
  return db.prepare('SELECT * FROM doctor ORDER BY id').all().map(rowToDoctor);
}

export function listPatients(): Patient[] {
  return db.prepare('SELECT * FROM patient ORDER BY id').all().map(rowToPatient);
}

export function listSlots(params?: { doctorId?: number; date?: string }): DoctorSlot[] {
  const wheres: string[] = [];
  const args: any[] = [];
  if (params?.doctorId) {
    wheres.push('s.doctor_id = ?');
    args.push(params.doctorId);
  }
  if (params?.date) {
    wheres.push('s.date = ?');
    args.push(params.date);
  }
  const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
  const sql = `
    SELECT s.*, d.name as doctor_name, d.department
    FROM doctor_slot s
    LEFT JOIN doctor d ON d.id = s.doctor_id
    ${where}
    ORDER BY s.date, s.period, s.doctor_id
  `;
  return db.prepare(sql).all(...args).map(rowToSlot);
}

export function createSlot(
  req: CreateSlotReq,
  session: RoleSession,
): { success: boolean; data?: DoctorSlot; error?: string } {
  if (session.role !== 'doctor') {
    return { success: false, error: '仅医生本人可发布号源' };
  }
  if (session.doctorId && session.doctorId !== req.doctorId) {
    return { success: false, error: '仅可为自己发布号源，不能代替其他医生操作' };
  }
  if (!req.date || !req.period || !req.totalCapacity || req.totalCapacity <= 0) {
    return { success: false, error: '日期、时段、号源容量为必填且容量需大于0' };
  }
  const exists = db
    .prepare(
      'SELECT id FROM doctor_slot WHERE doctor_id = ? AND date = ? AND period = ?',
    )
    .get(req.doctorId, req.date, req.period);
  if (exists) {
    return { success: false, error: '该时段号源已存在，请编辑或选择其他时段' };
  }
  const info = db
    .prepare(
      'INSERT INTO doctor_slot (doctor_id, date, period, total_capacity) VALUES (?, ?, ?, ?)',
    )
    .run(req.doctorId, req.date, req.period, req.totalCapacity);
  const row = db
    .prepare(
      `SELECT s.*, d.name as doctor_name, d.department
       FROM doctor_slot s LEFT JOIN doctor d ON d.id = s.doctor_id WHERE s.id = ?`,
    )
    .get(info.lastInsertRowid);
  return { success: true, data: rowToSlot(row) };
}

export function listApplications(params?: {
  status?: string;
  doctorId?: number;
  patientId?: number;
}): RecheckApplication[] {
  const wheres: string[] = [];
  const args: any[] = [];
  if (params?.status) {
    wheres.push('a.status = ?');
    args.push(params.status);
  }
  if (params?.doctorId) {
    wheres.push('a.doctor_id = ?');
    args.push(params.doctorId);
  }
  if (params?.patientId) {
    wheres.push('a.patient_id = ?');
    args.push(params.patientId);
  }
  const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
  const sql = `
    SELECT a.*, p.name as patient_name, d.name as doctor_name, d.department
    FROM recheck_application a
    LEFT JOIN patient p ON p.id = a.patient_id
    LEFT JOIN doctor d ON d.id = a.doctor_id
    ${where}
    ORDER BY a.created_at DESC
  `;
  return db.prepare(sql).all(...args).map(rowToApplication);
}

export function validateCreateApplication(
  req: CreateApplicationReq,
): Record<string, string> | null {
  const errors: Record<string, string> = {};
  if (!req.patientId || req.patientId <= 0) errors.patientId = '请选择患者';
  if (!req.doctorId || req.doctorId <= 0) errors.doctorId = '请选择目标医生';
  if (!req.reason || req.reason.trim().length < 2)
    errors.reason = '复诊原因至少2个字符';
  if (!req.expectedDate) errors.expectedDate = '请选择期望复诊日期';
  return Object.keys(errors).length ? errors : null;
}

export function createApplication(
  req: CreateApplicationReq,
  session: RoleSession,
): { success: boolean; data?: RecheckApplication; error?: string; errors?: Record<string, string> } {
  const errors = validateCreateApplication(req);
  if (errors) return { success: false, errors };
  const info = db
    .prepare(
      `INSERT INTO recheck_application (patient_id, doctor_id, reason, expected_date, status, created_by)
       VALUES (?, ?, ?, ?, 'pending_triage', ?)`,
    )
    .run(req.patientId, req.doctorId, req.reason, req.expectedDate, session.name);
  const row = db
    .prepare(
      `SELECT a.*, p.name as patient_name, d.name as doctor_name, d.department
       FROM recheck_application a
       LEFT JOIN patient p ON p.id = a.patient_id
       LEFT JOIN doctor d ON d.id = a.doctor_id
       WHERE a.id = ?`,
    )
    .get(info.lastInsertRowid);
  return { success: true, data: rowToApplication(row) };
}

function addHistory(
  appointmentId: number,
  fromStatus: string | null,
  toStatus: string,
  session: RoleSession,
  remark?: string | null,
) {
  db.prepare(
    `INSERT INTO status_history (appointment_id, from_status, to_status, operator_role, operator_name, remark)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(appointmentId, fromStatus, toStatus, session.role, session.name, remark || null);
}

export function triageApplication(
  applicationId: number,
  req: TriageReq,
  session: RoleSession,
): { success: boolean; data?: RecheckApplication; error?: string } {
  const app = db
    .prepare('SELECT * FROM recheck_application WHERE id = ?')
    .get(applicationId) as any;
  if (!app) return { success: false, error: '复诊申请不存在' };
  if (app.status !== 'pending_triage')
    return { success: false, error: `当前状态为 ${app.status}，不可分诊` };

  const slot = db
    .prepare('SELECT * FROM doctor_slot WHERE id = ?')
    .get(req.slotId) as any;
  if (!slot) return { success: false, error: '号源不存在' };
  if (slot.doctor_id !== app.doctor_id)
    return { success: false, error: '所选号源医生与申请目标医生不一致' };
  if (slot.used_capacity >= slot.total_capacity)
    return { success: false, error: '该号源容量已满' };

  const overlap = db
    .prepare(
      `SELECT COUNT(*) as c FROM appointment ap
       JOIN doctor_slot s ON s.id = ap.slot_id
       WHERE ap.patient_id = ? AND s.date = ? AND ap.status IN ('pending_confirm','confirmed')`,
    )
    .get(app.patient_id, slot.date) as { c: number };
  if (overlap.c > 0) {
    return {
      success: false,
      error: '同一患者同一天已存在有效预约，存在重叠，请取消后再操作',
    };
  }

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO appointment (application_id, patient_id, doctor_id, slot_id, status)
         VALUES (?, ?, ?, ?, 'pending_confirm')`,
      )
      .run(applicationId, app.patient_id, app.doctor_id, req.slotId);
    const appointmentId = Number(info.lastInsertRowid);
    db.prepare(
      'UPDATE doctor_slot SET used_capacity = used_capacity + 1 WHERE id = ?',
    ).run(req.slotId);
    db.prepare(
      `UPDATE recheck_application SET status = 'pending_confirm', slot_id = ?, appointment_id = ? WHERE id = ?`,
    ).run(req.slotId, appointmentId, applicationId);
    addHistory(appointmentId, null, 'pending_confirm', session, '分诊分配号源');
  });
  tx();

  const row = db
    .prepare(
      `SELECT a.*, p.name as patient_name, d.name as doctor_name, d.department
       FROM recheck_application a
       LEFT JOIN patient p ON p.id = a.patient_id
       LEFT JOIN doctor d ON d.id = a.doctor_id
       WHERE a.id = ?`,
    )
    .get(applicationId);
  return { success: true, data: rowToApplication(row) };
}

export function listAppointments(params?: {
  status?: string;
  patientId?: number;
  doctorId?: number;
  dateFrom?: string;
  dateTo?: string;
}): Appointment[] {
  const wheres: string[] = [];
  const args: any[] = [];
  if (params?.status) {
    wheres.push('ap.status = ?');
    args.push(params.status);
  }
  if (params?.patientId) {
    wheres.push('ap.patient_id = ?');
    args.push(params.patientId);
  }
  if (params?.doctorId) {
    wheres.push('ap.doctor_id = ?');
    args.push(params.doctorId);
  }
  if (params?.dateFrom) {
    wheres.push('s.date >= ?');
    args.push(params.dateFrom);
  }
  if (params?.dateTo) {
    wheres.push('s.date <= ?');
    args.push(params.dateTo);
  }
  const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
  const sql = `
    SELECT ap.*, p.name as patient_name, d.name as doctor_name, d.department,
           s.date as slot_date, s.period as slot_period
    FROM appointment ap
    LEFT JOIN patient p ON p.id = ap.patient_id
    LEFT JOIN doctor d ON d.id = ap.doctor_id
    LEFT JOIN doctor_slot s ON s.id = ap.slot_id
    ${where}
    ORDER BY ap.created_at DESC
  `;
  return db.prepare(sql).all(...args).map(rowToAppointment);
}

export function confirmAppointment(
  id: number,
  session: RoleSession,
): { success: boolean; data?: Appointment; error?: string } {
  const appt = db.prepare('SELECT * FROM appointment WHERE id = ?').get(id) as any;
  if (!appt) return { success: false, error: '预约不存在' };
  if (appt.status !== 'pending_confirm')
    return { success: false, error: `当前状态为 ${appt.status}，仅待确认可确认` };
  if (session.role === 'patient' && session.patientId !== appt.patient_id) {
    return { success: false, error: '仅可确认本人的预约' };
  }
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE appointment SET status = 'confirmed', confirmed_at = datetime('now') WHERE id = ?`,
    ).run(id);
    db.prepare(
      `UPDATE recheck_application SET status = 'confirmed' WHERE appointment_id = ?`,
    ).run(id);
    addHistory(id, 'pending_confirm', 'confirmed', session, '患者确认预约');
  });
  tx();
  const row = db
    .prepare(
      `SELECT ap.*, p.name as patient_name, d.name as doctor_name, d.department,
              s.date as slot_date, s.period as slot_period
       FROM appointment ap
       LEFT JOIN patient p ON p.id = ap.patient_id
       LEFT JOIN doctor d ON d.id = ap.doctor_id
       LEFT JOIN doctor_slot s ON s.id = ap.slot_id
       WHERE ap.id = ?`,
    )
    .get(id);
  return { success: true, data: rowToAppointment(row) };
}

export function cancelAppointment(
  id: number,
  req: CancelAppointmentReq,
  session: RoleSession,
): { success: boolean; data?: Appointment; error?: string } {
  const appt = db.prepare('SELECT * FROM appointment WHERE id = ?').get(id) as any;
  if (!appt) return { success: false, error: '预约不存在' };
  if (appt.status === 'cancelled') {
    return { success: false, error: '该预约已取消，不可重复取消（容量不会重复释放）' };
  }
  if (!req.reason || req.reason.trim().length < 2) {
    return { success: false, error: '请填写取消原因（至少2个字符）' };
  }
  const tx = db.transaction(() => {
    if (!appt.capacity_released) {
      db.prepare(
        'UPDATE doctor_slot SET used_capacity = MAX(used_capacity - 1, 0) WHERE id = ?',
      ).run(appt.slot_id);
    }
    db.prepare(
      `UPDATE appointment SET status = 'cancelled', cancel_reason = ?, capacity_released = 1, cancelled_at = datetime('now') WHERE id = ?`,
    ).run(req.reason, id);
    db.prepare(
      `UPDATE recheck_application SET status = 'cancelled' WHERE appointment_id = ?`,
    ).run(id);
    addHistory(id, appt.status, 'cancelled', session, `取消原因: ${req.reason}`);
  });
  tx();
  const row = db
    .prepare(
      `SELECT ap.*, p.name as patient_name, d.name as doctor_name, d.department,
              s.date as slot_date, s.period as slot_period
       FROM appointment ap
       LEFT JOIN patient p ON p.id = ap.patient_id
       LEFT JOIN doctor d ON d.id = ap.doctor_id
       LEFT JOIN doctor_slot s ON s.id = ap.slot_id
       WHERE ap.id = ?`,
    )
    .get(id);
  return { success: true, data: rowToAppointment(row) };
}

export function listAppointmentHistory(appointmentId: number): StatusHistory[] {
  return db
    .prepare(
      'SELECT * FROM status_history WHERE appointment_id = ? ORDER BY created_at ASC',
    )
    .all(appointmentId)
    .map(rowToHistory);
}

export function getOverviewStats(): OverviewStats {
  const totalSlotsRow = db
    .prepare('SELECT COALESCE(SUM(total_capacity),0) as c FROM doctor_slot')
    .get() as { c: number };
  const usedSlotsRow = db
    .prepare('SELECT COALESCE(SUM(used_capacity),0) as c FROM doctor_slot')
    .get() as { c: number };
  const pendingTriageRow = db
    .prepare("SELECT COUNT(*) as c FROM recheck_application WHERE status = 'pending_triage'")
    .get() as { c: number };
  const pendingConfirmRow = db
    .prepare("SELECT COUNT(*) as c FROM appointment WHERE status = 'pending_confirm'")
    .get() as { c: number };
  const today = new Date().toISOString().slice(0, 10);
  const confirmedTodayRow = db
    .prepare(
      `SELECT COUNT(*) as c FROM appointment ap
       JOIN doctor_slot s ON s.id = ap.slot_id
       WHERE ap.status = 'confirmed' AND s.date = ?`,
    )
    .get(today) as { c: number };
  const cancelledTodayRow = db
    .prepare(
      `SELECT COUNT(*) as c FROM appointment ap
       WHERE ap.status = 'cancelled' AND date(ap.cancelled_at) = ?`,
    )
    .get(today) as { c: number };
  return {
    totalSlots: totalSlotsRow.c,
    usedSlots: usedSlotsRow.c,
    pendingTriage: pendingTriageRow.c,
    pendingConfirm: pendingConfirmRow.c,
    confirmedToday: confirmedTodayRow.c,
    cancelledToday: cancelledTodayRow.c,
  };
}

export function exportAppointmentsCsv(params?: {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}): string {
  const rows = listAppointments(params);
  const header = [
    '预约ID',
    '患者姓名',
    '医生姓名',
    '科室',
    '就诊日期',
    '时段',
    '状态',
    '取消原因',
    '是否释放容量',
    '创建时间',
    '确认时间',
    '取消时间',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    const period = r.slotPeriod === 'morning' ? '上午' : r.slotPeriod === 'afternoon' ? '下午' : '';
    const statusLabel =
      r.status === 'pending_confirm'
        ? '待患者确认'
        : r.status === 'confirmed'
        ? '已确认'
        : '已取消';
    lines.push(
      [
        r.id,
        r.patientName || '',
        r.doctorName || '',
        r.department || '',
        r.slotDate || '',
        period,
        statusLabel,
        (r.cancelReason || '').replace(/,/g, '，'),
        r.capacityReleased ? '是' : '否',
        r.createdAt,
        r.confirmedAt || '',
        r.cancelledAt || '',
      ].join(','),
    );
  }
  return '\ufeff' + lines.join('\n');
}

export function exportAppointmentsJson(params?: {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}): string {
  const rows = listAppointments(params);
  return JSON.stringify(rows, null, 2);
}
