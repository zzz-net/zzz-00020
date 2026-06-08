import db from '../db.js';
import type {
  Doctor,
  Patient,
  DoctorSlot,
  RecheckApplication,
  Appointment,
  StatusHistory,
  RescheduleRequest,
  RescheduleStatus,
  CreateApplicationReq,
  CreateSlotReq,
  TriageReq,
  CancelAppointmentReq,
  RescheduleReq,
  RescheduleDecisionReq,
  RoleSession,
  OverviewStats,
  WaitlistRecord,
  WaitlistLog,
  WaitlistMatchResult,
  WaitlistStatus,
  WaitlistUrgency,
  CreateWaitlistReq,
  ConfirmWaitlistReq,
  AbandonWaitlistReq,
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
    pendingRescheduleId: r.pending_reschedule_id ?? null,
    pendingRescheduleStatus: r.pending_reschedule_status
      ? normalizeRescheduleStatus(r.pending_reschedule_status)
      : null,
    fromWaitlist: !!r.from_waitlist,
    waitlistId: r.waitlist_id ?? null,
    waitlistMatchedAt: r.waitlist_matched_at ?? null,
    waitlistHandledBy: r.waitlist_handled_by ?? null,
  };
}

function rowToWaitlist(r: any): WaitlistRecord {
  return {
    id: r.id,
    patientId: r.patient_id,
    patientName: r.patient_name,
    doctorId: r.doctor_id ?? null,
    doctorName: r.doctor_name,
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

function rowToWaitlistLog(r: any): WaitlistLog {
  return {
    id: r.id,
    waitlistId: r.waitlist_id,
    action: r.action,
    operatorRole: r.operator_role,
    operatorName: r.operator_name,
    remark: r.remark ?? null,
    createdAt: r.created_at,
  };
}
function normalizeRescheduleStatus(s: string): RescheduleStatus {
  if (s === 'pending_patient') return 'pending';
  return s as RescheduleStatus;
}

function rowToReschedule(r: any): RescheduleRequest {
  return {
    id: r.id,
    appointmentId: r.appointment_id,
    oldSlotId: r.old_slot_id,
    newSlotId: r.new_slot_id,
    reason: r.reason,
    status: normalizeRescheduleStatus(r.status),
    initiatedByRole: r.initiated_by_role,
    initiatedByName: r.initiated_by_name,
    decidedByRole: r.decided_by_role,
    decidedByName: r.decided_by_name,
    rejectReason: r.reject_reason,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    oldSlotDate: r.old_slot_date,
    oldSlotPeriod: r.old_slot_period,
    newSlotDate: r.new_slot_date,
    newSlotPeriod: r.new_slot_period,
    newDoctorId: r.new_doctor_id,
    newDoctorName: r.new_doctor_name,
    newDepartment: r.new_department,
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
    rescheduleId: r.reschedule_id ?? null,
    oldSlotId: r.old_slot_id ?? null,
    newSlotId: r.new_slot_id ?? null,
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
  options?: { rescheduleId?: number; oldSlotId?: number; newSlotId?: number },
) {
  db.prepare(
    `INSERT INTO status_history (appointment_id, from_status, to_status, operator_role, operator_name, remark, reschedule_id, old_slot_id, new_slot_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    appointmentId,
    fromStatus,
    toStatus,
    session.role,
    session.name,
    remark || null,
    options?.rescheduleId ?? null,
    options?.oldSlotId ?? null,
    options?.newSlotId ?? null,
  );
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
           s.date as slot_date, s.period as slot_period,
           pr.id as pending_reschedule_id, pr.status as pending_reschedule_status
    FROM appointment ap
    LEFT JOIN patient p ON p.id = ap.patient_id
    LEFT JOIN doctor d ON d.id = ap.doctor_id
    LEFT JOIN doctor_slot s ON s.id = ap.slot_id
    LEFT JOIN reschedule_request pr ON pr.appointment_id = ap.id AND pr.status IN ('pending', 'pending_patient')
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

export function listReschedules(params?: {
  status?: string;
  patientId?: number;
  appointmentId?: number;
}): RescheduleRequest[] {
  const wheres: string[] = [];
  const args: any[] = [];
  if (params?.status) {
    if (params.status === 'pending') {
      wheres.push("r.status IN ('pending', 'pending_patient')");
    } else {
      wheres.push('r.status = ?');
      args.push(params.status);
    }
  }
  if (params?.patientId) {
    wheres.push('ap.patient_id = ?');
    args.push(params.patientId);
  }
  if (params?.appointmentId) {
    wheres.push('r.appointment_id = ?');
    args.push(params.appointmentId);
  }
  const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
  const sql = `
    SELECT r.*,
           os.date as old_slot_date, os.period as old_slot_period,
           ns.date as new_slot_date, ns.period as new_slot_period,
           nd.id as new_doctor_id, nd.name as new_doctor_name, nd.department as new_department
    FROM reschedule_request r
    LEFT JOIN appointment ap ON ap.id = r.appointment_id
    LEFT JOIN doctor_slot os ON os.id = r.old_slot_id
    LEFT JOIN doctor_slot ns ON ns.id = r.new_slot_id
    LEFT JOIN doctor nd ON nd.id = ns.doctor_id
    ${where}
    ORDER BY r.created_at DESC
  `;
  return db.prepare(sql).all(...args).map(rowToReschedule);
}

export function initiateReschedule(
  appointmentId: number,
  req: RescheduleReq,
  session: RoleSession,
): { success: boolean; data?: RescheduleRequest; error?: string } {
  if (session.role !== 'nurse') {
    return { success: false, error: '仅护士可发起改期' };
  }
  if (!req.reason || req.reason.trim().length < 2) {
    return { success: false, error: '请填写改期原因（至少2个字符）' };
  }
  if (!req.newSlotId || req.newSlotId <= 0) {
    return { success: false, error: '请选择新的号源' };
  }
  const appt = db.prepare('SELECT * FROM appointment WHERE id = ?').get(appointmentId) as any;
  if (!appt) return { success: false, error: '预约不存在' };
  if (appt.status === 'cancelled') {
    return { success: false, error: '已取消的预约不可改期' };
  }
  const pending = db
    .prepare("SELECT id FROM reschedule_request WHERE appointment_id = ? AND status IN ('pending', 'pending_patient')")
    .get(appointmentId);
  if (pending) {
    return { success: false, error: '该预约已有待确认的改期请求，请先处理' };
  }
  if (req.newSlotId === appt.slot_id) {
    return { success: false, error: '新号源与原号源相同，请更换' };
  }
  const newSlot = db.prepare('SELECT * FROM doctor_slot WHERE id = ?').get(req.newSlotId) as any;
  if (!newSlot) return { success: false, error: '新号源不存在' };
  const oldSlot = db.prepare('SELECT * FROM doctor_slot WHERE id = ?').get(appt.slot_id) as any;
  if (!oldSlot) return { success: false, error: '原号源不存在' };

  if (newSlot.used_capacity >= newSlot.total_capacity) {
    return { success: false, error: '新号源容量已满，请选择其他号源' };
  }

  if (newSlot.date === oldSlot.date) {
    // 同日改期到同日期不需要检查重复预约（因为同患者同日已经有一个预约，改期后仍然是一个）
  } else {
    const overlap = db
      .prepare(
        `SELECT COUNT(*) as c FROM appointment ap
         JOIN doctor_slot s ON s.id = ap.slot_id
         WHERE ap.patient_id = ? AND s.date = ? AND ap.status IN ('pending_confirm','confirmed')
           AND ap.id != ?`,
      )
      .get(appt.patient_id, newSlot.date, appointmentId) as { c: number };
    if (overlap.c > 0) {
      return {
        success: false,
        error: '该患者在新号源日期已存在有效预约，存在同日重复，请选择其他日期',
      };
    }
  }

  let rescheduleId: number;
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO reschedule_request
         (appointment_id, patient_id, old_slot_id, old_doctor_id, new_slot_id, new_doctor_id,
          reason, status, requested_by, initiated_by_role, initiated_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      )
      .run(
        appointmentId,
        appt.patient_id,
        appt.slot_id,
        appt.doctor_id,
        req.newSlotId,
        newSlot.doctor_id,
        req.reason,
        `${session.role}:${session.name}`,
        session.role,
        session.name,
      );
    rescheduleId = Number(info.lastInsertRowid);
    addHistory(
      appointmentId,
      appt.status,
      appt.status,
      session,
      `护士发起改期，原因: ${req.reason}`,
      { rescheduleId, oldSlotId: appt.slot_id, newSlotId: req.newSlotId },
    );
  });
  tx();

  const list = listReschedules();
  return { success: true, data: list.find(x => x.id === rescheduleId) };
}

export function acceptReschedule(
  rescheduleId: number,
  session: RoleSession,
): { success: boolean; data?: RescheduleRequest; error?: string } {
  const r = db.prepare('SELECT * FROM reschedule_request WHERE id = ?').get(rescheduleId) as any;
  if (!r) return { success: false, error: '改期请求不存在' };
  if (!['pending', 'pending_patient'].includes(r.status)) {
    return { success: false, error: `改期请求状态为 ${r.status}，仅待确认可接受` };
  }
  const appt = db.prepare('SELECT * FROM appointment WHERE id = ?').get(r.appointment_id) as any;
  if (!appt) return { success: false, error: '关联预约不存在' };
  if (appt.status === 'cancelled') {
    return { success: false, error: '关联预约已取消，无法接受改期' };
  }
  if (session.role === 'patient' && session.patientId !== appt.patient_id) {
    return { success: false, error: '仅预约所属患者可接受改期' };
  }

  const oldSlot = db.prepare('SELECT * FROM doctor_slot WHERE id = ?').get(r.old_slot_id) as any;
  const newSlot = db.prepare('SELECT * FROM doctor_slot WHERE id = ?').get(r.new_slot_id) as any;
  if (!oldSlot || !newSlot) return { success: false, error: '号源数据异常' };

  if (newSlot.date !== oldSlot.date) {
    const overlap = db
      .prepare(
        `SELECT COUNT(*) as c FROM appointment ap
         JOIN doctor_slot s ON s.id = ap.slot_id
         WHERE ap.patient_id = ? AND s.date = ? AND ap.status IN ('pending_confirm','confirmed')
           AND ap.id != ?`,
      )
      .get(appt.patient_id, newSlot.date, appt.id) as { c: number };
    if (overlap.c > 0) {
      return {
        success: false,
        error: '该患者在新号源日期已存在有效预约，存在同日重复，改期失败',
      };
    }
  }

  const tx = db.transaction(() => {
    const newSlotAfter = db
      .prepare('SELECT * FROM doctor_slot WHERE id = ?')
      .get(r.new_slot_id) as any;
    if (newSlotAfter.used_capacity >= newSlotAfter.total_capacity) {
      throw new Error('RESCHEDULE_CONFLICT:新号源容量已满，改期失败（并发冲突）');
    }

    const affected = db
      .prepare(
        'UPDATE doctor_slot SET used_capacity = used_capacity + 1 WHERE id = ? AND used_capacity < total_capacity',
      )
      .run(r.new_slot_id);
    if (affected.changes === 0) {
      throw new Error('RESCHEDULE_CONFLICT:新号源占用失败，容量已满（并发冲突）');
    }

    if (!appt.capacity_released) {
      db.prepare(
        'UPDATE doctor_slot SET used_capacity = MAX(used_capacity - 1, 0) WHERE id = ?',
      ).run(r.old_slot_id);
    }

    db.prepare(
      `UPDATE appointment SET slot_id = ?, doctor_id = ?, capacity_released = 0 WHERE id = ?`,
    ).run(r.new_slot_id, newSlot.doctor_id, r.appointment_id);

    db.prepare(
      `UPDATE recheck_application SET doctor_id = ?, slot_id = ? WHERE appointment_id = ?`,
    ).run(newSlot.doctor_id, r.new_slot_id, r.appointment_id);

    db.prepare(
      `UPDATE reschedule_request
       SET status = 'accepted', decided_by_role = ?, decided_by_name = ?, decided_at = datetime('now')
       WHERE id = ?`,
    ).run(session.role, session.name, rescheduleId);

    addHistory(
      r.appointment_id,
      appt.status,
      appt.status,
      session,
      `患者接受改期`,
      { rescheduleId, oldSlotId: r.old_slot_id, newSlotId: r.new_slot_id },
    );
  });

  try {
    tx();
  } catch (e: any) {
    const msg: string = e.message || String(e);
    if (msg.startsWith('RESCHEDULE_CONFLICT:')) {
      return { success: false, error: msg.slice('RESCHEDULE_CONFLICT:'.length) };
    }
    throw e;
  }

  const list = listReschedules({ appointmentId: r.appointment_id });
  return { success: true, data: list.find((x) => x.id === rescheduleId) };
}

export function rejectReschedule(
  rescheduleId: number,
  req: RescheduleDecisionReq,
  session: RoleSession,
): { success: boolean; data?: RescheduleRequest; error?: string } {
  const r = db.prepare('SELECT * FROM reschedule_request WHERE id = ?').get(rescheduleId) as any;
  if (!r) return { success: false, error: '改期请求不存在' };
  if (!['pending', 'pending_patient'].includes(r.status)) {
    return { success: false, error: `改期请求状态为 ${r.status}，仅待确认可拒绝` };
  }
  const appt = db.prepare('SELECT * FROM appointment WHERE id = ?').get(r.appointment_id) as any;
  if (!appt) return { success: false, error: '关联预约不存在' };
  if (session.role === 'patient' && session.patientId !== appt.patient_id) {
    return { success: false, error: '仅预约所属患者可拒绝改期' };
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE reschedule_request
       SET status = 'rejected', decided_by_role = ?, decided_by_name = ?, reject_reason = ?, decided_at = datetime('now')
       WHERE id = ?`,
    ).run(session.role, session.name, req.rejectReason || null, rescheduleId);

    addHistory(
      r.appointment_id,
      appt.status,
      appt.status,
      session,
      `患者拒绝改期${req.rejectReason ? `，原因: ${req.rejectReason}` : ''}`,
      { rescheduleId, oldSlotId: r.old_slot_id, newSlotId: r.new_slot_id },
    );
  });
  tx();

  const list = listReschedules({ appointmentId: r.appointment_id });
  return { success: true, data: list.find((x) => x.id === rescheduleId) };
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
    '是否有待改期',
    '改期状态',
    '取消原因',
    '是否释放容量',
    '创建时间',
    '确认时间',
    '取消时间',
    '是否来自候补',
    '候补ID',
    '候补匹配时间',
    '候补处理人',
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
    const pendingReschedule = r.pendingRescheduleId ? '是' : '否';
    const rescheduleStatusLabel = r.pendingRescheduleStatus
      ? r.pendingRescheduleStatus === 'pending'
        ? '待患者确认'
        : r.pendingRescheduleStatus === 'accepted'
        ? '改期成功'
        : '患者已拒绝'
      : '';
    lines.push(
      [
        r.id,
        r.patientName || '',
        r.doctorName || '',
        r.department || '',
        r.slotDate || '',
        period,
        statusLabel,
        pendingReschedule,
        rescheduleStatusLabel,
        (r.cancelReason || '').replace(/,/g, '，'),
        r.capacityReleased ? '是' : '否',
        r.createdAt,
        r.confirmedAt || '',
        r.cancelledAt || '',
        r.fromWaitlist ? '是' : '否',
        r.waitlistId || '',
        r.waitlistMatchedAt || '',
        (r.waitlistHandledBy || '').replace(/,/g, '，'),
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
  const appts = listAppointments(params);
  const apptIds = appts.map((a) => a.id);
  const allReschedules = listReschedules();
  const rescheduleByAppt = new Map<number, RescheduleRequest[]>();
  for (const rs of allReschedules) {
    if (!rescheduleByAppt.has(rs.appointmentId)) rescheduleByAppt.set(rs.appointmentId, []);
    rescheduleByAppt.get(rs.appointmentId)!.push(rs);
  }
  const enriched = appts.map((a) => ({
    ...a,
    reschedules: rescheduleByAppt.get(a.id) || [],
  }));
  return JSON.stringify(enriched, null, 2);
}

function addWaitlistLog(
  waitlistId: number,
  action: string,
  session: RoleSession,
  remark?: string | null,
) {
  db.prepare(
    `INSERT INTO waitlist_log (waitlist_id, action, operator_role, operator_name, remark)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(waitlistId, action, session.role, session.name, remark || null);
}

export function listWaitlists(params?: {
  status?: WaitlistStatus;
  patientId?: number;
  department?: string;
  doctorId?: number;
  urgency?: WaitlistUrgency;
}): WaitlistRecord[] {
  const wheres: string[] = [];
  const args: any[] = [];
  if (params?.status) {
    wheres.push('w.status = ?');
    args.push(params.status);
  }
  if (params?.patientId) {
    wheres.push('w.patient_id = ?');
    args.push(params.patientId);
  }
  if (params?.department) {
    wheres.push('w.department = ?');
    args.push(params.department);
  }
  if (params?.doctorId) {
    wheres.push('w.doctor_id = ?');
    args.push(params.doctorId);
  }
  if (params?.urgency) {
    wheres.push('w.urgency = ?');
    args.push(params.urgency);
  }
  const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
  const urgencyOrder = "CASE w.urgency WHEN 'emergency' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END";
  const sql = `
    SELECT w.*, p.name as patient_name, d.name as doctor_name
    FROM waitlist_record w
    LEFT JOIN patient p ON p.id = w.patient_id
    LEFT JOIN doctor d ON d.id = w.doctor_id
    ${where}
    ORDER BY ${urgencyOrder}, w.created_at ASC
  `;
  return db.prepare(sql).all(...args).map(rowToWaitlist);
}

export function getWaitlist(id: number): WaitlistRecord | null {
  const row = db
    .prepare(
      `SELECT w.*, p.name as patient_name, d.name as doctor_name
       FROM waitlist_record w
       LEFT JOIN patient p ON p.id = w.patient_id
       LEFT JOIN doctor d ON d.id = w.doctor_id
       WHERE w.id = ?`,
    )
    .get(id);
  return row ? rowToWaitlist(row) : null;
}

export function listWaitlistLogs(waitlistId: number): WaitlistLog[] {
  return db
    .prepare('SELECT * FROM waitlist_log WHERE waitlist_id = ? ORDER BY created_at ASC')
    .all(waitlistId)
    .map(rowToWaitlistLog);
}

export function validateCreateWaitlist(
  req: CreateWaitlistReq,
): Record<string, string> | null {
  const errors: Record<string, string> = {};
  if (!req.patientId || req.patientId <= 0) errors.patientId = '请选择患者';
  if (!req.department || req.department.trim().length < 1) errors.department = '请选择科室';
  if (!req.reason || req.reason.trim().length < 2) errors.reason = '补号原因至少2个字符';
  if (!req.acceptableDateFrom) errors.acceptableDateFrom = '请选择可接受起始日期';
  if (!req.acceptableDateTo) errors.acceptableDateTo = '请选择可接受结束日期';
  if (req.acceptableDateFrom && req.acceptableDateTo && req.acceptableDateFrom > req.acceptableDateTo) {
    errors.acceptableDateTo = '结束日期不能早于起始日期';
  }
  if (!req.urgency || !['normal', 'urgent', 'emergency'].includes(req.urgency)) {
    errors.urgency = '请选择紧急程度';
  }
  return Object.keys(errors).length ? errors : null;
}

export function createWaitlist(
  req: CreateWaitlistReq,
  session: RoleSession,
): { success: boolean; data?: WaitlistRecord; error?: string; errors?: Record<string, string> } {
  if (session.role !== 'nurse') {
    return { success: false, error: '仅护士可创建候补补号' };
  }
  const errors = validateCreateWaitlist(req);
  if (errors) return { success: false, errors };

  const patient = db.prepare('SELECT id FROM patient WHERE id = ?').get(req.patientId);
  if (!patient) return { success: false, error: '患者不存在' };

  if (req.doctorId) {
    const doctor = db.prepare('SELECT id, department FROM doctor WHERE id = ?').get(req.doctorId) as any;
    if (!doctor) return { success: false, error: '指定医生不存在' };
    if (doctor.department !== req.department) {
      return { success: false, error: '指定医生与科室不匹配' };
    }
  } else {
    const deptDoctor = db.prepare('SELECT id FROM doctor WHERE department = ? LIMIT 1').get(req.department);
    if (!deptDoctor) return { success: false, error: '该科室暂无医生' };
  }

  let waitlistId: number;
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO waitlist_record
         (patient_id, doctor_id, department, reason, acceptable_date_from, acceptable_date_to,
          urgency, status, application_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting', ?, ?)`,
      )
      .run(
        req.patientId,
        req.doctorId ?? null,
        req.department,
        req.reason,
        req.acceptableDateFrom,
        req.acceptableDateTo,
        req.urgency,
        req.applicationId ?? null,
        session.name,
      );
    waitlistId = Number(info.lastInsertRowid);
    addWaitlistLog(waitlistId, '创建候补', session, `原因: ${req.reason}`);
  });
  tx();

  return { success: true, data: getWaitlist(waitlistId)! };
}

export function matchWaitlistForSlot(slotId: number): WaitlistMatchResult[] {
  const slot = db
    .prepare(
      `SELECT s.*, d.name as doctor_name, d.department
       FROM doctor_slot s LEFT JOIN doctor d ON d.id = s.doctor_id WHERE s.id = ?`,
    )
    .get(slotId) as any;
  if (!slot) return [];
  if (slot.used_capacity >= slot.total_capacity) return [];

  const waiting = db
    .prepare(
      `SELECT w.*, p.name as patient_name, d.name as doctor_name
       FROM waitlist_record w
       LEFT JOIN patient p ON p.id = w.patient_id
       LEFT JOIN doctor d ON d.id = w.doctor_id
       WHERE w.status = 'waiting'
         AND w.department = ?
         AND w.acceptable_date_from <= ?
         AND w.acceptable_date_to >= ?
       ORDER BY CASE w.urgency WHEN 'emergency' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END,
                w.created_at ASC`,
    )
    .all(slot.department, slot.date, slot.date) as any[];

  const results: WaitlistMatchResult[] = [];
  for (const w of waiting) {
    const reasons: string[] = [];
    reasons.push(`科室匹配: ${w.department}`);
    reasons.push(`日期在可接受范围: ${w.acceptable_date_from} ~ ${w.acceptable_date_to} 包含 ${slot.date}`);
    if (w.doctor_id) {
      if (w.doctor_id === slot.doctor_id) {
        reasons.push(`指定医生匹配: ${w.doctor_name}`);
      } else {
        continue;
      }
    } else {
      reasons.push(`未指定医生，接受 ${slot.doctor_name || `医生#${slot.doctor_id}`}`);
    }

    const overlap = db
      .prepare(
        `SELECT COUNT(*) as c FROM appointment ap
         JOIN doctor_slot s ON s.id = ap.slot_id
         WHERE ap.patient_id = ? AND s.date = ? AND ap.status IN ('pending_confirm','confirmed')`,
      )
      .get(w.patient_id, slot.date) as { c: number };
    if (overlap.c > 0) continue;

    results.push({
      waitlistId: w.id,
      slotId: slot.id,
      slotDate: slot.date,
      slotPeriod: slot.period,
      doctorId: slot.doctor_id,
      doctorName: slot.doctor_name,
      department: slot.department,
      matchReasons: reasons,
    });
  }
  return results;
}

export function matchAllWaitlists(): { slotId: number; matches: WaitlistMatchResult[] }[] {
  const slots = db
    .prepare(
      `SELECT s.id FROM doctor_slot s
       WHERE s.used_capacity < s.total_capacity
       ORDER BY s.date, s.period`,
    )
    .all() as { id: number }[];
  const result: { slotId: number; matches: WaitlistMatchResult[] }[] = [];
  for (const s of slots) {
    const matches = matchWaitlistForSlot(s.id);
    if (matches.length > 0) {
      result.push({ slotId: s.id, matches });
    }
  }
  return result;
}

export function abandonWaitlist(
  id: number,
  req: AbandonWaitlistReq,
  session: RoleSession,
): { success: boolean; data?: WaitlistRecord; error?: string } {
  if (session.role !== 'nurse') {
    return { success: false, error: '仅护士可操作候补记录' };
  }
  const w = db.prepare('SELECT * FROM waitlist_record WHERE id = ?').get(id) as any;
  if (!w) return { success: false, error: '候补记录不存在' };
  if (w.status === 'confirmed') return { success: false, error: '已完成补号的记录不可放弃' };
  if (w.status === 'abandoned') return { success: false, error: '该候补记录已放弃' };
  if (!req.reason || req.reason.trim().length < 2) {
    return { success: false, error: '请填写放弃原因（至少2个字符）' };
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE waitlist_record SET status = 'abandoned', abandoned_at = datetime('now'), abandon_reason = ? WHERE id = ?`,
    ).run(req.reason, id);
    addWaitlistLog(id, '标记放弃', session, `原因: ${req.reason}`);
  });
  tx();
  return { success: true, data: getWaitlist(id)! };
}

export function confirmWaitlist(
  id: number,
  req: ConfirmWaitlistReq,
  session: RoleSession,
): { success: boolean; data?: Appointment; error?: string } {
  if (session.role !== 'nurse') {
    return { success: false, error: '仅护士可确认候补补号' };
  }
  const w = db.prepare('SELECT * FROM waitlist_record WHERE id = ?').get(id) as any;
  if (!w) return { success: false, error: '候补记录不存在' };
  if (w.status === 'confirmed') return { success: false, error: '该候补记录已完成补号' };
  if (w.status === 'abandoned') return { success: false, error: '该候补记录已放弃' };

  const slot = db
    .prepare(
      `SELECT s.*, d.department, d.name as doctor_name
       FROM doctor_slot s LEFT JOIN doctor d ON d.id = s.doctor_id WHERE s.id = ?`,
    )
    .get(req.slotId) as any;
  if (!slot) return { success: false, error: '号源不存在' };
  if (slot.used_capacity >= slot.total_capacity) return { success: false, error: '该号源容量已满' };
  if (slot.department !== w.department) {
    return { success: false, error: '号源科室与候补记录科室不匹配' };
  }
  if (w.doctor_id && w.doctor_id !== slot.doctor_id) {
    return { success: false, error: '号源医生与候补指定医生不匹配' };
  }
  if (slot.date < w.acceptable_date_from || slot.date > w.acceptable_date_to) {
    return { success: false, error: '号源日期不在候补可接受日期范围内' };
  }

  const overlap = db
    .prepare(
      `SELECT COUNT(*) as c FROM appointment ap
       JOIN doctor_slot s ON s.id = ap.slot_id
       WHERE ap.patient_id = ? AND s.date = ? AND ap.status IN ('pending_confirm','confirmed')`,
    )
    .get(w.patient_id, slot.date) as { c: number };
  if (overlap.c > 0) {
    return {
      success: false,
      error: '同一患者同一天已存在有效预约，存在重叠，请取消后再操作',
    };
  }

  let appointmentId: number;
  const tx = db.transaction(() => {
    const slotAfter = db.prepare('SELECT * FROM doctor_slot WHERE id = ?').get(req.slotId) as any;
    if (slotAfter.used_capacity >= slotAfter.total_capacity) {
      throw new Error('WAITLIST_CONFLICT:号源容量已满，候补补号失败（并发冲突）');
    }
    const affected = db
      .prepare(
        'UPDATE doctor_slot SET used_capacity = used_capacity + 1 WHERE id = ? AND used_capacity < total_capacity',
      )
      .run(req.slotId);
    if (affected.changes === 0) {
      throw new Error('WAITLIST_CONFLICT:号源占用失败，容量已满（并发冲突）');
    }

    let applicationId = w.application_id;
    if (!applicationId) {
      const appInfo = db
        .prepare(
          `INSERT INTO recheck_application (patient_id, doctor_id, reason, expected_date, status, created_by)
           VALUES (?, ?, ?, ?, 'pending_confirm', ?)`,
        )
        .run(w.patient_id, slot.doctor_id, w.reason, slot.date, session.name);
      applicationId = Number(appInfo.lastInsertRowid);
    } else {
      db.prepare(
        `UPDATE recheck_application SET status = 'pending_confirm', slot_id = ?, doctor_id = ?, expected_date = ? WHERE id = ?`,
      ).run(req.slotId, slot.doctor_id, slot.date, applicationId);
    }

    const apptInfo = db
      .prepare(
        `INSERT INTO appointment
         (application_id, patient_id, doctor_id, slot_id, status, from_waitlist, waitlist_id, waitlist_matched_at, waitlist_handled_by)
         VALUES (?, ?, ?, ?, 'pending_confirm', 1, ?, datetime('now'), ?)`,
      )
      .run(applicationId, w.patient_id, slot.doctor_id, req.slotId, id, session.name);
    appointmentId = Number(apptInfo.lastInsertRowid);

    db.prepare(
      `UPDATE recheck_application SET appointment_id = ? WHERE id = ?`,
    ).run(appointmentId, applicationId);

    db.prepare(
      `UPDATE waitlist_record
       SET status = 'confirmed', appointment_id = ?, matched_slot_id = ?,
           matched_at = datetime('now'), confirmed_at = datetime('now')
       WHERE id = ?`,
    ).run(appointmentId, req.slotId, id);

    addWaitlistLog(id, '确认补号', session, `号源: ${slot.date} ${slot.period} (号源#${req.slotId})`);

    addHistory(appointmentId, null, 'pending_confirm', session, `候补补号分配号源，来自候补#${id}`);
  });

  try {
    tx();
  } catch (e: any) {
    const msg: string = e.message || String(e);
    if (msg.startsWith('WAITLIST_CONFLICT:')) {
      return { success: false, error: msg.slice('WAITLIST_CONFLICT:'.length) };
    }
    throw e;
  }

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
    .get(appointmentId);
  return { success: true, data: rowToAppointment(row) };
}
