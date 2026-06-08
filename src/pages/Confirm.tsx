import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, X, UserCheck, RefreshCw } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { useRoleStore } from '@/store/roleStore';
import StatusBadge from '@/components/StatusBadge';
import { cn } from '@/lib/utils';
import type { Appointment } from '@shared/types';
import { PERIOD_LABEL } from '@shared/types';

export default function Confirm() {
  const { session } = useRoleStore();
  const isPatient = session.role === 'patient';
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isPatient && session.patientId) loadAppointments();
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
          onClick={loadAppointments}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200">
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
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          确认预约
                        </button>
                        <button
                          onClick={() => openCancelModal(appt)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                        >
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
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
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
                {reasonError && <p className="text-red-600 text-sm mt-1">{reasonError}</p>}
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
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                关闭
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
              >
                确认取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
