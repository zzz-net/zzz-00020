import { useEffect, useState } from 'react';
import { ClipboardList, Filter, X, Clock, History, RefreshCw, CalendarRange, ListChecks } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import StatusBadge from '@/components/StatusBadge';
import { useRoleStore } from '@/store/roleStore';
import { cn } from '@/lib/utils';
import type {
  Appointment,
  Doctor,
  Patient,
  StatusHistory,
  AppointmentStatus,
  UserRole,
  DoctorSlot,
  RescheduleRequest,
  RescheduleStatus,
} from '@shared/types';
import { STATUS_LABEL, PERIOD_LABEL, RESCHEDULE_STATUS_LABEL } from '@shared/types';

const roleLabels: Record<UserRole, string> = {
  nurse: '护士',
  doctor: '医生',
  patient: '患者',
};

const rescheduleStatusColors: Record<RescheduleStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  accepted: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
};

function RescheduleStatusBadge({ status }: { status: RescheduleStatus }) {
  return (
    <span
      className={cn(
        'rounded-full px-3 py-1 text-xs font-medium',
        rescheduleStatusColors[status],
      )}
    >
      {RESCHEDULE_STATUS_LABEL[status]}
    </span>
  );
}

export default function Records() {
  const { session } = useRoleStore();
  const isNurse = session.role === 'nurse';
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filters, setFilters] = useState({
    patientId: '',
    doctorId: '',
    status: '',
    dateFrom: '',
    dateTo: '',
  });
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [history, setHistory] = useState<StatusHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [rescheduleAppt, setRescheduleAppt] = useState<Appointment | null>(null);
  const [slots, setSlots] = useState<DoctorSlot[]>([]);
  const [newSlotId, setNewSlotId] = useState<number | ''>('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [rescheduleError, setRescheduleError] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [slotError, setSlotError] = useState('');
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);

  const [reschedules, setReschedules] = useState<RescheduleRequest[]>([]);

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
    if (filters.patientId) params.set('patientId', filters.patientId);
    if (filters.doctorId) params.set('doctorId', filters.doctorId);
    if (filters.status) params.set('status', filters.status);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    const url = `/api/appointments${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await apiClient.get<Appointment[]>(url);
    if (res.success && res.data) setAppointments(res.data);
    setLoading(false);
  }

  async function loadHistory(id: number) {
    setHistoryLoading(true);
    const res = await apiClient.get<StatusHistory[]>(`/api/appointments/${id}/history`);
    if (res.success && res.data) setHistory(res.data);
    setHistoryLoading(false);
  }

  function openHistoryModal(appt: Appointment) {
    setSelectedAppt(appt);
    setHistory([]);
    loadHistory(appt.id);
    loadReschedules(appt.id);
  }

  async function loadReschedules(appointmentId: number) {
    const res = await apiClient.get<RescheduleRequest[]>(
      `/api/reschedules?appointmentId=${appointmentId}`,
    );
    if (res.success && res.data) setReschedules(res.data);
  }

  async function openRescheduleModal(appt: Appointment) {
    setRescheduleAppt(appt);
    setNewSlotId('');
    setRescheduleReason('');
    setRescheduleError('');
    setReasonError('');
    setSlotError('');
    const res = await apiClient.get<DoctorSlot[]>('/api/slots');
    if (res.success && res.data) setSlots(res.data);
    setRescheduleModalOpen(true);
  }

  async function handleSubmitReschedule() {
    if (!rescheduleAppt) return;
    let hasError = false;
    if (!newSlotId) {
      setSlotError('请选择新号源');
      hasError = true;
    } else {
      setSlotError('');
    }
    if (!rescheduleReason.trim()) {
      setReasonError('请填写改期原因');
      hasError = true;
    } else {
      setReasonError('');
    }
    if (hasError) return;

    setRescheduleSubmitting(true);
    setRescheduleError('');
    const res = await apiClient.post<RescheduleRequest>(
      `/api/appointments/${rescheduleAppt.id}/reschedule`,
      {
        newSlotId: Number(newSlotId),
        reason: rescheduleReason,
      },
    );
    setRescheduleSubmitting(false);
    if (res.success) {
      setRescheduleModalOpen(false);
      loadAppointments();
    } else {
      setRescheduleError(res.error || '改期发起失败');
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-6 h-6 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-800">预约记录查询</h1>
        </div>
        <button
          onClick={loadAppointments}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">筛选条件</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
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
          <div>
            <label className="block text-xs text-slate-500 mb-1">状态</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              {(Object.keys(STATUS_LABEL) as AppointmentStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
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
        </div>
      </div>

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
                  <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">来源</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">改期</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">取消原因</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">创建时间</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {appointments.map((appt) => (
                  <tr
                    key={appt.id}
                    className={cn(
                      'hover:bg-slate-50',
                      appt.status === 'cancelled' && 'bg-red-50/50',
                      appt.pendingRescheduleStatus === 'pending' && 'bg-amber-50/50',
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
                      {appt.fromWaitlist ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-violet-100 text-violet-800">
                          <ListChecks className="w-3 h-3" />
                          候补补号
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">正常分诊</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {appt.pendingRescheduleStatus ? (
                        <RescheduleStatusBadge status={appt.pendingRescheduleStatus} />
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {appt.status === 'cancelled' && appt.cancelReason ? (
                        <span className="text-red-600 font-medium">{appt.cancelReason}</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{appt.createdAt}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openHistoryModal(appt)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          <History className="w-4 h-4" />
                          查看历史
                        </button>
                        {isNurse && appt.status !== 'cancelled' && !appt.pendingRescheduleId && (
                          <button
                            onClick={() => openRescheduleModal(appt)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                          >
                            <CalendarRange className="w-4 h-4" />
                            改期
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedAppt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-slate-700" />
                <h3 className="text-lg font-semibold text-slate-800">
                  预约详情与状态历史
                </h3>
              </div>
              <button
                onClick={() => setSelectedAppt(null)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-6">
              <div className="bg-slate-50 rounded-lg p-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-500">预约ID：</span>
                  <span className="text-slate-700 font-medium">#{selectedAppt.id}</span>
                </div>
                <div>
                  <span className="text-slate-500">患者：</span>
                  <span className="text-slate-700 font-medium">{selectedAppt.patientName}</span>
                </div>
                <div>
                  <span className="text-slate-500">医生：</span>
                  <span className="text-slate-700 font-medium">{selectedAppt.doctorName}</span>
                </div>
                <div>
                  <span className="text-slate-500">科室：</span>
                  <span className="text-slate-700 font-medium">{selectedAppt.department}</span>
                </div>
                <div>
                  <span className="text-slate-500">就诊日期：</span>
                  <span className="text-slate-700 font-medium">{selectedAppt.slotDate}</span>
                </div>
                <div>
                  <span className="text-slate-500">时段：</span>
                  <span className="text-slate-700 font-medium">
                    {selectedAppt.slotPeriod ? PERIOD_LABEL[selectedAppt.slotPeriod] : '-'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500">当前状态：</span>
                  <StatusBadge status={selectedAppt.status} />
                </div>
                {selectedAppt.fromWaitlist && (
                  <div className="col-span-2 bg-violet-50 rounded-lg px-3 py-2">
                    <span className="text-violet-600 text-sm inline-flex items-center gap-1.5">
                      <ListChecks className="w-4 h-4" />
                      <span className="font-medium">该预约来自候补补号</span>
                      {selectedAppt.waitlistId && (
                        <span className="text-violet-500">（候补#{selectedAppt.waitlistId}）</span>
                      )}
                      {selectedAppt.waitlistMatchedAt && (
                        <span className="text-violet-500"> · 匹配时间：{selectedAppt.waitlistMatchedAt}</span>
                      )}
                      {selectedAppt.waitlistHandledBy && (
                        <span className="text-violet-500"> · 处理人：{selectedAppt.waitlistHandledBy}</span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {reschedules.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">改期记录</h4>
                  <div className="space-y-2">
                    {reschedules.map((rs) => (
                      <div
                        key={rs.id}
                        className="border border-slate-200 rounded-lg p-3 text-sm space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CalendarRange className="w-4 h-4 text-blue-600" />
                            <span className="font-medium text-slate-700">改期请求 #{rs.id}</span>
                            <RescheduleStatusBadge status={rs.status} />
                          </div>
                          <span className="text-xs text-slate-500">{rs.createdAt}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 ml-6">
                          <div>
                            原号源：{rs.oldSlotDate} {rs.oldSlotPeriod ? PERIOD_LABEL[rs.oldSlotPeriod] : ''}
                          </div>
                          <div>
                            新号源：{rs.newSlotDate} {rs.newSlotPeriod ? PERIOD_LABEL[rs.newSlotPeriod] : ''}
                            {rs.newDoctorName && ` (${rs.newDoctorName} ${rs.newDepartment || ''})`}
                          </div>
                          <div>发起人：{roleLabels[rs.initiatedByRole]} {rs.initiatedByName}</div>
                          <div>原因：{rs.reason}</div>
                          {rs.status !== 'pending' && (
                            <>
                              <div>
                                处理人：{rs.decidedByRole ? roleLabels[rs.decidedByRole] : ''}{' '}
                                {rs.decidedByName || ''}
                              </div>
                              <div>处理时间：{rs.decidedAt || ''}</div>
                            </>
                          )}
                          {rs.status === 'rejected' && rs.rejectReason && (
                            <div className="col-span-2 text-red-600">
                              拒绝原因：{rs.rejectReason}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">状态变更时间线</h4>
                {historyLoading ? (
                  <div className="text-center py-8 text-slate-500">加载中...</div>
                ) : history.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">暂无历史记录</div>
                ) : (
                  <div className="relative">
                    <div className="absolute left-3 top-1 bottom-1 w-0.5 bg-slate-200" />
                    <div className="space-y-4">
                      {history.map((h, idx) => (
                        <div key={h.id} className="relative pl-10">
                          <div
                            className={cn(
                              'absolute left-1.5 w-3.5 h-3.5 rounded-full border-2 border-white',
                              idx === 0 ? 'bg-blue-500' : 'bg-slate-400',
                            )}
                          />
                          <div className="bg-slate-50 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-xs text-slate-500">{h.createdAt}</span>
                              {h.rescheduleId && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                  改期 #{h.rescheduleId}
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-slate-700 font-medium">
                              {roleLabels[h.operatorRole]} {h.operatorName}
                            </div>
                            <div className="text-sm text-slate-600 mt-0.5">
                              {h.fromStatus ? (
                                <>
                                  {STATUS_LABEL[h.fromStatus as keyof typeof STATUS_LABEL] ??
                                    h.fromStatus}
                                  {' → '}
                                </>
                              ) : null}
                              <span className="font-medium">
                                {STATUS_LABEL[h.toStatus as keyof typeof STATUS_LABEL] ??
                                  h.toStatus}
                              </span>
                            </div>
                            {h.remark && (
                              <div className="text-sm text-slate-500 mt-1">备注：{h.remark}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end p-4 border-t border-slate-200">
              <button
                onClick={() => setSelectedAppt(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {rescheduleModalOpen && rescheduleAppt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <CalendarRange className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-slate-800">发起改期</h3>
              </div>
              <button
                onClick={() => setRescheduleModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">预约ID</span>
                  <span className="text-slate-700 font-medium">#{rescheduleAppt.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">患者</span>
                  <span className="text-slate-700">{rescheduleAppt.patientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">当前医生</span>
                  <span className="text-slate-700">{rescheduleAppt.doctorName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">当前就诊日期</span>
                  <span className="text-slate-700">{rescheduleAppt.slotDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">当前时段</span>
                  <span className="text-slate-700">
                    {rescheduleAppt.slotPeriod ? PERIOD_LABEL[rescheduleAppt.slotPeriod] : '-'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  选择新号源 <span className="text-red-500">*</span>
                </label>
                <select
                  value={newSlotId}
                  onChange={(e) => {
                    setNewSlotId(e.target.value ? Number(e.target.value) : '');
                    if (e.target.value) setSlotError('');
                  }}
                  className={cn(
                    'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm',
                    slotError ? 'border-red-500' : 'border-slate-300',
                  )}
                >
                  <option value="">请选择新的号源</option>
                  {slots
                    .filter((s) => s.usedCapacity < s.totalCapacity)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.date} {PERIOD_LABEL[s.period]} - {s.doctorName || `医生#${s.doctorId}`} (
                        {s.department}) 剩余 {s.totalCapacity - s.usedCapacity}/{s.totalCapacity}
                      </option>
                    ))}
                </select>
                {slotError && <p className="text-red-600 text-sm mt-1">{slotError}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  改期原因 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rescheduleReason}
                  onChange={(e) => {
                    setRescheduleReason(e.target.value);
                    if (e.target.value.trim()) setReasonError('');
                  }}
                  rows={3}
                  className={cn(
                    'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm',
                    reasonError ? 'border-red-500' : 'border-slate-300',
                  )}
                  placeholder="请填写改期原因..."
                />
                {reasonError && <p className="text-red-600 text-sm mt-1">{reasonError}</p>}
              </div>

              {rescheduleError && (
                <div className="border border-red-500 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {rescheduleError}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-slate-200">
              <button
                onClick={() => setRescheduleModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmitReschedule}
                disabled={rescheduleSubmitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {rescheduleSubmitting ? '提交中...' : '提交改期'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
