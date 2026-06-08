import { useEffect, useState } from 'react';
import {
  UserCheck,
  Filter,
  RefreshCw,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  History,
  X,
  Undo2,
} from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import StatusBadge from '@/components/StatusBadge';
import { useRoleStore } from '@/store/roleStore';
import { cn } from '@/lib/utils';
import type {
  Appointment,
  Doctor,
  Patient,
  AttendanceStatus,
  AttendanceLog,
  UserRole,
} from '@shared/types';
import {
  STATUS_LABEL,
  PERIOD_LABEL,
  ATTENDANCE_STATUS_LABEL,
} from '@shared/types';

const roleLabels: Record<UserRole, string> = {
  nurse: '护士',
  doctor: '医生',
  patient: '患者',
};

const attendanceColors: Record<AttendanceStatus, string> = {
  arrived: 'bg-emerald-100 text-emerald-800',
  late: 'bg-amber-100 text-amber-800',
  no_show: 'bg-red-100 text-red-800',
};

function AttendanceBadge({ status }: { status: AttendanceStatus | null }) {
  if (!status) return <span className="text-slate-400">未登记</span>;
  return (
    <span
      className={cn(
        'rounded-full px-3 py-1 text-xs font-medium',
        attendanceColors[status],
      )}
    >
      {ATTENDANCE_STATUS_LABEL[status]}
    </span>
  );
}

export default function Followup() {
  const { session } = useRoleStore();
  const isNurse = session.role === 'nurse';
  const isDoctor = session.role === 'doctor';
  const isPatient = session.role === 'patient';

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const today = new Date().toISOString().slice(0, 10);
  const [filters, setFilters] = useState({
    patientId: '',
    doctorId: isDoctor && session.doctorId ? String(session.doctorId) : '',
    dateFrom: isPatient ? '' : today,
    dateTo: isPatient ? '' : today,
    attendanceStatus: '',
  });
  const [loading, setLoading] = useState(false);

  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus | ''>('');
  const [attendanceRemark, setAttendanceRemark] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [revokeAppt, setRevokeAppt] = useState<Appointment | null>(null);
  const [revokeRemark, setRevokeRemark] = useState('');
  const [revokeError, setRevokeError] = useState('');
  const [revokeSubmitting, setRevokeSubmitting] = useState(false);

  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [logsAppt, setLogsAppt] = useState<Appointment | null>(null);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    loadLookups();
  }, []);

  useEffect(() => {
    loadAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  async function loadLookups() {
    const [doctorsRes, patientsRes] = await Promise.all([
      apiClient.get<Doctor[]>('/api/doctors'),
      apiClient.get<Patient[]>('/api/patients'),
    ]);
    if (doctorsRes.success && doctorsRes.data) setDoctors(doctorsRes.data);
    if (patientsRes.success && patientsRes.data) setPatients(patientsRes.data);
  }

  async function loadAppointments() {
    setLoading(true);
    const params = new URLSearchParams();
    if (isPatient && session.patientId) {
      params.set('patientId', String(session.patientId));
    } else if (filters.patientId) {
      params.set('patientId', filters.patientId);
    }
    if (isDoctor && session.doctorId) {
      params.set('doctorId', String(session.doctorId));
    } else if (filters.doctorId) {
      params.set('doctorId', filters.doctorId);
    }
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (filters.attendanceStatus) params.set('attendanceStatus', filters.attendanceStatus);
    const url = `/api/appointments${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await apiClient.get<Appointment[]>(url);
    if (res.success && res.data) setAppointments(res.data);
    setLoading(false);
  }

  function openRegisterModal(appt: Appointment) {
    setSelectedAppt(appt);
    setAttendanceStatus(appt.attendanceStatus || '');
    setAttendanceRemark(appt.attendanceRemark || '');
    setRegisterError('');
    setStatusError('');
    setRegisterModalOpen(true);
  }

  async function handleRegister() {
    if (!selectedAppt) return;
    let hasError = false;
    if (!attendanceStatus) {
      setStatusError('请选择到场状态');
      hasError = true;
    } else {
      setStatusError('');
    }
    if (hasError) return;

    setSubmitting(true);
    setRegisterError('');
    const res = await apiClient.post<Appointment>(
      `/api/appointments/${selectedAppt.id}/attendance`,
      {
        status: attendanceStatus as AttendanceStatus,
        remark: attendanceRemark.trim() || undefined,
      },
    );
    setSubmitting(false);
    if (res.success) {
      setRegisterModalOpen(false);
      loadAppointments();
    } else {
      setRegisterError(res.error || '登记失败');
    }
  }

  function openRevokeModal(appt: Appointment) {
    setRevokeAppt(appt);
    setRevokeRemark('');
    setRevokeError('');
    setRevokeModalOpen(true);
  }

  async function handleRevoke() {
    if (!revokeAppt) return;
    setRevokeSubmitting(true);
    setRevokeError('');
    const res = await apiClient.post<Appointment>(
      `/api/appointments/${revokeAppt.id}/attendance/revoke`,
      {
        remark: revokeRemark.trim() || undefined,
      },
    );
    setRevokeSubmitting(false);
    if (res.success) {
      setRevokeModalOpen(false);
      loadAppointments();
    } else {
      setRevokeError(res.error || '撤销失败');
    }
  }

  async function openLogsModal(appt: Appointment) {
    setLogsAppt(appt);
    setLogs([]);
    setLogsLoading(true);
    const res = await apiClient.get<AttendanceLog[]>(
      `/api/appointments/${appt.id}/attendance-logs`,
    );
    if (res.success && res.data) setLogs(res.data);
    setLogsLoading(false);
    setLogsModalOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UserCheck className="w-6 h-6 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-800">
            {isPatient ? '我的异常记录' : isDoctor ? '今日异常名单' : '爽约和迟到随访'}
          </h1>
        </div>
        <button
          onClick={loadAppointments}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      {!isPatient && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">筛选条件</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            {!isDoctor && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">患者</label>
                <select
                  value={filters.patientId}
                  onChange={(e) => setFilters({ ...filters, patientId: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">全部</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!isDoctor ? null : (
              <div>
                <label className="block text-xs text-slate-500 mb-1">医生</label>
                <select
                  value={filters.doctorId}
                  onChange={(e) => setFilters({ ...filters, doctorId: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">全部</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-slate-500 mb-1">起始日期</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">结束日期</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">到场状态</label>
              <select
                value={filters.attendanceStatus}
                onChange={(e) => setFilters({ ...filters, attendanceStatus: e.target.value })}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">全部</option>
                <option value="arrived">已到诊</option>
                <option value="late">迟到</option>
                <option value="no_show">爽约</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200">
        {loading ? (
          <div className="text-center py-12 text-slate-500">加载中...</div>
        ) : appointments.length === 0 ? (
          <div className="text-center py-12 text-slate-500">暂无记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-y border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">预约ID</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">患者</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">医生</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">科室</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">就诊日期</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">时段</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">预约状态</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">到场状态</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">处理备注</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">处理人</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">处理时间</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {appointments.map((appt) => (
                  <tr
                    key={appt.id}
                    className={cn(
                      'hover:bg-slate-50',
                      appt.attendanceStatus === 'no_show' && 'bg-red-50/30',
                      appt.attendanceStatus === 'late' && 'bg-amber-50/30',
                      appt.attendanceStatus === 'arrived' && 'bg-emerald-50/30',
                    )}
                  >
                    <td className="px-4 py-3 text-slate-700">#{appt.id}</td>
                    <td className="px-4 py-3 text-slate-700">{appt.patientName}</td>
                    <td className="px-4 py-3 text-slate-700">{appt.doctorName}</td>
                    <td className="px-4 py-3 text-slate-500">{appt.department}</td>
                    <td className="px-4 py-3 text-slate-700">{appt.slotDate}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {appt.slotPeriod ? PERIOD_LABEL[appt.slotPeriod] : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={appt.status} />
                    </td>
                    <td className="px-4 py-3">
                      <AttendanceBadge status={appt.attendanceStatus} />
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate">
                      {appt.attendanceRemark || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {appt.attendanceHandledBy || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {appt.attendanceHandledAt || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {isNurse && appt.status !== 'cancelled' && (
                          <>
                            <button
                              onClick={() => openRegisterModal(appt)}
                              className={cn(
                                'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                                appt.attendanceStatus
                                  ? 'border border-slate-300 text-slate-600 hover:bg-slate-50'
                                  : 'bg-blue-600 text-white hover:bg-blue-700',
                              )}
                            >
                              {appt.attendanceStatus ? (
                                <>
                                  <CheckCircle className="w-4 h-4" />
                                  修改登记
                                </>
                              ) : (
                                <>
                                  <UserCheck className="w-4 h-4" />
                                  登记
                                </>
                              )}
                            </button>
                            {appt.attendanceStatus && (
                              <button
                                onClick={() => openRevokeModal(appt)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                              >
                                <Undo2 className="w-4 h-4" />
                                撤销
                              </button>
                            )}
                          </>
                        )}
                        <button
                          onClick={() => openLogsModal(appt)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          <History className="w-4 h-4" />
                          日志
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {registerModalOpen && selectedAppt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-slate-800">
                  {selectedAppt.attendanceStatus ? '修改到场登记' : '到场状态登记'}
                </h3>
              </div>
              <button
                onClick={() => setRegisterModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">预约ID</span>
                  <span className="text-slate-700 font-medium">#{selectedAppt.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">患者</span>
                  <span className="text-slate-700">{selectedAppt.patientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">医生</span>
                  <span className="text-slate-700">{selectedAppt.doctorName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">就诊日期</span>
                  <span className="text-slate-700">{selectedAppt.slotDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">时段</span>
                  <span className="text-slate-700">
                    {selectedAppt.slotPeriod ? PERIOD_LABEL[selectedAppt.slotPeriod] : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">当前状态</span>
                  <StatusBadge status={selectedAppt.status} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  到场状态 <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['arrived', 'late', 'no_show'] as AttendanceStatus[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setAttendanceStatus(s);
                        setStatusError('');
                      }}
                      className={cn(
                        'flex flex-col items-center justify-center py-3 px-2 rounded-lg border-2 transition-colors',
                        attendanceStatus === s
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 hover:border-slate-300',
                      )}
                    >
                      {s === 'arrived' && <CheckCircle className="w-6 h-6 text-emerald-600 mb-1" />}
                      {s === 'late' && <Clock className="w-6 h-6 text-amber-600 mb-1" />}
                      {s === 'no_show' && <XCircle className="w-6 h-6 text-red-600 mb-1" />}
                      <span className="text-sm font-medium text-slate-700">
                        {ATTENDANCE_STATUS_LABEL[s]}
                      </span>
                    </button>
                  ))}
                </div>
                {statusError && <p className="text-red-600 text-sm mt-1">{statusError}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">处理备注</label>
                <textarea
                  value={attendanceRemark}
                  onChange={(e) => setAttendanceRemark(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="请填写处理备注（可选）..."
                />
              </div>

              {registerError && (
                <div className="border border-red-500 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {registerError}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-slate-200">
              <button
                onClick={() => setRegisterModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleRegister}
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? '提交中...' : '确认登记'}
              </button>
            </div>
          </div>
        </div>
      )}

      {revokeModalOpen && revokeAppt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Undo2 className="w-5 h-5 text-amber-600" />
                <h3 className="text-lg font-semibold text-slate-800">撤销到场登记</h3>
              </div>
              <button
                onClick={() => setRevokeModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">确认撤销该预约的到场登记？</p>
                  <p className="text-amber-700 mt-1">撤销后将清空到场状态和备注，并留下操作日志，不可静默恢复。</p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">预约ID</span>
                  <span className="text-slate-700 font-medium">#{revokeAppt.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">患者</span>
                  <span className="text-slate-700">{revokeAppt.patientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">当前到场状态</span>
                  <AttendanceBadge status={revokeAppt.attendanceStatus} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">撤销原因</label>
                <textarea
                  value={revokeRemark}
                  onChange={(e) => setRevokeRemark(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="请填写撤销原因（可选）..."
                />
              </div>

              {revokeError && (
                <div className="border border-red-500 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {revokeError}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-slate-200">
              <button
                onClick={() => setRevokeModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleRevoke}
                disabled={revokeSubmitting}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {revokeSubmitting ? '撤销中...' : '确认撤销'}
              </button>
            </div>
          </div>
        </div>
      )}

      {logsModalOpen && logsAppt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-slate-700" />
                <h3 className="text-lg font-semibold text-slate-800">
                  到场操作日志 · 预约 #{logsAppt.id}
                </h3>
              </div>
              <button
                onClick={() => setLogsModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {logsLoading ? (
                <div className="text-center py-8 text-slate-500">加载中...</div>
              ) : logs.length === 0 ? (
                <div className="text-center py-8 text-slate-500">暂无操作日志</div>
              ) : (
                <div className="relative">
                  <div className="absolute left-3 top-1 bottom-1 w-0.5 bg-slate-200" />
                  <div className="space-y-4">
                    {logs.map((log, idx) => (
                      <div key={log.id} className="relative pl-10">
                        <div
                          className={cn(
                            'absolute left-1.5 w-3.5 h-3.5 rounded-full border-2 border-white',
                            log.action === 'register' ? 'bg-blue-500' : 'bg-amber-500',
                          )}
                        />
                        <div className="bg-slate-50 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-xs text-slate-500">{log.createdAt}</span>
                            <span
                              className={cn(
                                'text-xs px-2 py-0.5 rounded-full font-medium',
                                log.action === 'register'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-amber-100 text-amber-700',
                              )}
                            >
                              {log.action === 'register' ? '登记' : '撤销'}
                            </span>
                          </div>
                          <div className="text-sm text-slate-700 font-medium">
                            {roleLabels[log.operatorRole]} {log.operatorName}
                          </div>
                          <div className="text-sm text-slate-600 mt-0.5">
                            {log.oldStatus ? (
                              <>
                                <span className="text-slate-500">
                                  {ATTENDANCE_STATUS_LABEL[log.oldStatus]}
                                </span>
                                {' → '}
                              </>
                            ) : null}
                            {log.newStatus ? (
                              <span className="font-medium">
                                {ATTENDANCE_STATUS_LABEL[log.newStatus]}
                              </span>
                            ) : (
                              <span className="text-slate-500">（已清除）</span>
                            )}
                          </div>
                          {log.oldRemark && (
                            <div className="text-sm text-slate-500 mt-1">
                              原备注：{log.oldRemark}
                            </div>
                          )}
                          {log.newRemark && log.action === 'register' && (
                            <div className="text-sm text-slate-500 mt-1">
                              新备注：{log.newRemark}
                            </div>
                          )}
                          {log.newRemark && log.action === 'revoke' && (
                            <div className="text-sm text-slate-500 mt-1">
                              撤销原因：{log.newRemark}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end p-4 border-t border-slate-200">
              <button
                onClick={() => setLogsModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
