export type UserRole = 'nurse' | 'doctor' | 'patient';

export interface Doctor {
  id: number;
  name: string;
  department: string;
  title: string;
}

export interface Patient {
  id: number;
  name: string;
  idCard: string;
  phone: string;
  medicalRecordNo: string;
}

export type SlotPeriod = 'morning' | 'afternoon';

export interface DoctorSlot {
  id: number;
  doctorId: number;
  doctorName?: string;
  department?: string;
  date: string;
  period: SlotPeriod;
  totalCapacity: number;
  usedCapacity: number;
  createdAt: string;
}

export type ApplicationStatus =
  | 'pending_triage'
  | 'triaged'
  | 'pending_confirm'
  | 'confirmed'
  | 'cancelled';

export type AppointmentStatus = 'pending_confirm' | 'confirmed' | 'cancelled';

export type RescheduleStatus = 'pending' | 'accepted' | 'rejected';

export interface RecheckApplication {
  id: number;
  patientId: number;
  patientName?: string;
  doctorId: number;
  doctorName?: string;
  department?: string;
  reason: string;
  expectedDate: string;
  status: ApplicationStatus;
  slotId: number | null;
  appointmentId: number | null;
  createdAt: string;
  createdBy: string;
}

export interface Appointment {
  id: number;
  applicationId: number;
  patientId: number;
  patientName?: string;
  doctorId: number;
  doctorName?: string;
  department?: string;
  slotId: number;
  slotDate?: string;
  slotPeriod?: SlotPeriod;
  status: AppointmentStatus;
  cancelReason: string | null;
  capacityReleased: boolean;
  createdAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  pendingRescheduleId?: number | null;
  pendingRescheduleStatus?: RescheduleStatus | null;
}

export interface RescheduleRequest {
  id: number;
  appointmentId: number;
  oldSlotId: number;
  newSlotId: number;
  reason: string;
  status: RescheduleStatus;
  initiatedByRole: UserRole;
  initiatedByName: string;
  decidedByRole: UserRole | null;
  decidedByName: string | null;
  rejectReason: string | null;
  createdAt: string;
  decidedAt: string | null;
  oldSlotDate?: string;
  oldSlotPeriod?: SlotPeriod;
  newSlotDate?: string;
  newSlotPeriod?: SlotPeriod;
  newDoctorId?: number;
  newDoctorName?: string;
  newDepartment?: string;
}

export interface StatusHistory {
  id: number;
  appointmentId: number;
  fromStatus: string | null;
  toStatus: string;
  operatorRole: UserRole;
  operatorName: string;
  remark: string | null;
  rescheduleId: number | null;
  oldSlotId: number | null;
  newSlotId: number | null;
  createdAt: string;
}

export interface CreateApplicationReq {
  patientId: number;
  doctorId: number;
  reason: string;
  expectedDate: string;
}

export interface CreateSlotReq {
  doctorId: number;
  date: string;
  period: SlotPeriod;
  totalCapacity: number;
}

export interface TriageReq {
  slotId: number;
}

export interface CancelAppointmentReq {
  reason: string;
}

export interface RescheduleReq {
  newSlotId: number;
  reason: string;
}

export interface RescheduleDecisionReq {
  rejectReason?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: Record<string, string>;
}

export interface OverviewStats {
  totalSlots: number;
  usedSlots: number;
  pendingTriage: number;
  pendingConfirm: number;
  confirmedToday: number;
  cancelledToday: number;
}

export interface RoleSession {
  role: UserRole;
  doctorId?: number;
  patientId?: number;
  name: string;
}

export const PERIOD_LABEL: Record<SlotPeriod, string> = {
  morning: '上午',
  afternoon: '下午',
};

export const STATUS_LABEL: Record<ApplicationStatus | AppointmentStatus, string> = {
  pending_triage: '待分诊',
  triaged: '已分诊',
  pending_confirm: '待患者确认',
  confirmed: '已确认',
  cancelled: '已取消',
};

export const RESCHEDULE_STATUS_LABEL: Record<RescheduleStatus, string> = {
  pending: '待患者确认',
  accepted: '改期成功',
  rejected: '患者已拒绝',
};
