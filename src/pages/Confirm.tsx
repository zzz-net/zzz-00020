import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  X,
  UserCheck,
  RefreshCw,
  CalendarRange,
  Calendar,
} from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { useRoleStore } from '@/store/roleStore';
import StatusBadge from '@/components/StatusBadge';
import { cn } from '@/lib/utils';
import type { Appointment, RescheduleRequest } from '@shared/types';
import { PERIOD_LABEL, RESCHEDULE_STATUS_LABEL } from '@shared/types';

function RescheduleStatusBadge({ status }: { status: RescheduleRequest['status'] }) {
  const colors: Record<RescheduleRequest['status'], string> = {
    pending: 'bg-amber-100 text-amber-800',
    accepted: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-800',
  };
  return (
    <span
      className={cn(
        'rounded-full px-3 py-1 text-xs font-medium',
        colors[status],
      )}
    >
      {RESCHEDULE_STATUS_LABEL[status]}
    </span>
  );
}

export default function Confirm() {
  const { session } = useRoleStore();
  const isPatient = session.role === 'patient';
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [reschedules, setReschedules] = useState<RescheduleRequest[]>([]);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [loading, setLoading] = useState(false);

  const [selectedReschedule, setSelectedReschedule] = useState<RescheduleRequest | null>(null);
  const [rejectRescheduleModal, setRejectRescheduleModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectReasonError, setRejectReasonError] = useState('');
  const [rescheduleError, setRescheduleError] = useState('');
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);

  useEffect(() => {
    if (isPatient && session.patientId) {
      loadAppointments();
      loadReschedules();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPatient, session.patientId]);

  async function loadAppointments() {
    if (!session.patientId) return;
    setLoading(true);
    const res = await apiClient.get<Appointment[]>(
      `/api/appointments?status=pending_confirm&patientId=${session.patientId}`,
    );
    if (res.success && res.data) setAppointments(res.data);
    setLoading(false);
  }

  async function loadReschedules() {
    if (!session.patientId) return;
    const res = await apiClient.get<RescheduleRequest[]>(
      `/api/reschedules?status=pending&patientId=${session.patientId}`,
    );
    if (res.success && res.data) setReschedules(res.data);
  }

  async function handleConfirm(id: number) {
    const res = await apiClient.post(`/api/appointments/${id}/confirm`);
    if (res.success) loadAppointments();
  }

  function openCancelModal(appt: Appointment) {
    setSelectedAppt(appt);
    setCancelReason('');
    setCancelError('');
    setReasonError('');
  }

  async function handleCancel() {
    if (!selectedAppt) return;
    if (!cancelReason.trim()) {
      setReasonError('请填写取消原因');
      return;
    }
    setCancelError('');
    const res = await apiClient.post(`/api/appointments/${selectedAppt.id}/cancel`, {
      reason: cancelReason,
    });
    if (res.success) {
      setSelectedAppt(null);
      loadAppointments();
    } else {
      setCancelError(res.error || '取消失败');
    }
  }

  async function handleAcceptReschedule(rs: RescheduleRequest) {
    setRescheduleSubmitting(true);
    setRescheduleError('');
    const res = await apiClient.post(`/api/reschedules/${rs.id}/accept`);
    setRescheduleSubmitting(false);
    if (res.success) {
      loadReschedules();
      loadAppointments();
    } else {
      setRescheduleError(res.error || '接受改期失败');
    }
  }

  function openRejectRescheduleModal(rs: RescheduleRequest) {
    setSelectedReschedule(rs);
    setRejectRescheduleModal(true);
    setRejectReason('');
    setRejectReasonError('');
    setRescheduleError('');
  }

  async function handleRejectReschedule() {
    if (!selectedReschedule) return;
    if (!rejectReason.trim()) {
      setRejectReasonError('请填写拒绝原因');
      return;
    }
    setRescheduleSubmitting(true);
    const res = await apiClient.post(`/api/reschedules/${selectedReschedule.id}/reject`, {
      rejectReason,
    });
    setRescheduleSubmitting(false);
    if (res.success) {
      setRejectRescheduleModal(false);
      setSelectedReschedule(null);
      loadReschedules();
    } else {
      setRescheduleError(res.error || '拒绝改期失败');
    }
  }

  if (!isPatient) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
          <div className="text-red-600 text-lg font-medium">无权访问</div>
          <p className="text-red-500 text-sm mt-2">仅患者可访问预约确认页面</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UserCheck className="w-6 h-6 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-800">患者预约确认</h1>
        </div>
        <button
          onClick={() => {
            loadAppointments();
            loadReschedules();
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      {reschedules.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 border-2">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-100 bg-amber-50/50">
            <CalendarRange className="w-5 h-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-amber-800">
              待确认的改期请求
            </h2>
            <span className="bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full text-xs font-medium">
              {reschedules.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">原预约</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">
                    原号源
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">
                    新号源
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">改期原因</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">发起人</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reschedules.map((rs) => (
                  <tr key={rs.id} className="bg-amber-50/30">
                    <td className="px-4 py-3">
                    <div className="text-slate-700 font-medium">预约 #{rs.appointmentId}
                    </div>
                  </td>
                    <td className="px-4 py-3 text-slate-600">
                      {rs.oldSlotDate}{' '}
                      {rs.oldSlotPeriod ? PERIOD_LABEL[rs.oldSlotPeriod] : ''}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-slate-700 font-medium">
                        <Calendar className="w-4 h-4 text-blue-600" />
                        {rs.newSlotDate}{' '}
                        {rs.newSlotPeriod ? PERIOD_LABEL[rs.newSlotPeriod] : ''}
                      </div>
                      {rs.newDoctorName && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          {rs.newDoctorName} {rs.newDepartment || ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{rs.reason}</td>
                    <td className="px-4 py-3 text-slate-600">{rs.initiatedByName}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAcceptReschedule(rs)}
                          disabled={rescheduleSubmitting}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50">
                          <CheckCircle2 className="w-4 h-4" />
                          接受改期
                        </button>
                        <button
                          onClick={() => openRejectRescheduleModal(rs)}
                          disabled={rescheduleSubmitting}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50">
                          <XCircle className="w-4 h-4" />
                          拒绝改期
                        </button>
                      </div>
                      {rescheduleError && (
                        <div className="text-red-600 text-xs mt-1">
                          {rescheduleError}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">待确认的新预约</h2>
        </div>
        {loading ? (
          <div className="text-center py-12 text-slate-500">加载中...</div>
        ) : appointments.length === 0 ? (
          <div className="text-center py-12 text-slate-500">暂无待确认预约</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-y border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">医生</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">科室</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">就诊日期</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">时段</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {appointments.map((appt) => (
                  <tr key={appt.id} className="hover:bg-slate-50">
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
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConfirm(appt.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
                          <CheckCircle2 className="w-4 h-4" />
                          确认预约
                        </button>
                        <button
                          onClick={() => openCancelModal(appt)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
                          <XCircle className="w-4 h-4" />
                          取消预约
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

      {selectedAppt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-600" />
                <h3 className="text-lg font-semibold text-slate-800">取消预约</h3>
              </div>
              <button
                onClick={() => setSelectedAppt(null)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">医生</span>
                  <span className="text-slate-700">{selectedAppt.doctorName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">科室</span>
                  <span className="text-slate-700">{selectedAppt.department}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">日期</span>
                  <span className="text-slate-700">{selectedAppt.slotDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">时段</span>
                  <span className="text-slate-700">
                    {selectedAppt.slotPeriod ? PERIOD_LABEL[selectedAppt.slotPeriod] : '-'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  取消原因 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => {
                    setCancelReason(e.target.value);
                    if (e.target.value.trim()) setReasonError('');
                  }}
                  rows={3}
                  className={cn(
                    'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
                    reasonError ? 'border-red-500' : 'border-slate-300',
                  )}
                  placeholder="请填写取消原因..."
                />
                {reasonError && (
                  <p className="text-red-600 text-sm mt-1">{reasonError}</p>
                )}
              </div>

              {cancelError && (
                <div className="border border-red-500 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {cancelError}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-slate-200">
              <button
                onClick={() => setSelectedAppt(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors">
                关闭
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors">
                确认取消
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectRescheduleModal && selectedReschedule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-600" />
                <h3 className="text-lg font-semibold text-slate-800">拒绝改期</h3>
              </div>
              <button
                onClick={() => {
                  setRejectRescheduleModal(false);
                  setSelectedReschedule(null);
                }}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">原号源</span>
                  <span className="text-slate-700">
                    {selectedReschedule.oldSlotDate}{' '}
                    {selectedReschedule.oldSlotPeriod
                      ? PERIOD_LABEL[selectedReschedule.oldSlotPeriod]
                      : ''}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">新号源</span>
                  <span className="text-slate-700">
                    {selectedReschedule.newSlotDate}{' '}
                    {selectedReschedule.newSlotPeriod
                      ? PERIOD_LABEL[selectedReschedule.newSlotPeriod]
                      : ''}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">改期原因</span>
                  <span className="text-slate-700">{selectedReschedule.reason}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  拒绝原因 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => {
                    setRejectReason(e.target.value);
                    if (e.target.value.trim()) setRejectReasonError('');
                  }}
                  rows={3}
                  className={cn(
                    'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
                    rejectReasonError ? 'border-red-500' : 'border-slate-300',
                  )}
                  placeholder="请填写拒绝改期的原因..."
                />
                {rejectReasonError && (
                  <p className="text-red-600 text-sm mt-1">{rejectReasonError}</p>
                )}
              </div>

              {rescheduleError && (
                <div className="border border-red-500 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {rescheduleError}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-slate-200">
              <button
                onClick={() => {
                  setRejectRescheduleModal(false);
                  setSelectedReschedule(null);
                }}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors">
                关闭
              </button>
              <button
                onClick={handleRejectReschedule}
                disabled={rescheduleSubmitting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50">
                {rescheduleSubmitting ? '提交中...' : '确认拒绝'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
