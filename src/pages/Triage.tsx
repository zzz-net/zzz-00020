import { useEffect, useState } from 'react';
import { ListChecks, X, Clock, RefreshCw } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { useRoleStore } from '@/store/roleStore';
import StatusBadge from '@/components/StatusBadge';
import { cn } from '@/lib/utils';
import type { RecheckApplication, DoctorSlot } from '@shared/types';
import { PERIOD_LABEL } from '@shared/types';

export default function Triage() {
  const { session } = useRoleStore();
  const isNurse = session.role === 'nurse';
  const [applications, setApplications] = useState<RecheckApplication[]>([]);
  const [selectedApp, setSelectedApp] = useState<RecheckApplication | null>(null);
  const [slots, setSlots] = useState<DoctorSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string>('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => {
    if (isNurse) loadApplications();
  }, [isNurse]);

  async function loadApplications() {
    setLoading(true);
    const res = await apiClient.get<RecheckApplication[]>('/api/applications?status=pending_triage');
    if (res.success && res.data) setApplications(res.data);
    setLoading(false);
  }

  async function openTriageModal(app: RecheckApplication) {
    setSelectedApp(app);
    setSelectedSlotId('');
    setError('');
    setModalLoading(true);
    const res = await apiClient.get<DoctorSlot[]>(`/api/slots?doctorId=${app.doctorId}`);
    if (res.success && res.data) {
      const available = res.data.filter(
        (s) => s.totalCapacity - s.usedCapacity > 0,
      );
      setSlots(available);
    }
    setModalLoading(false);
  }

  async function handleTriage() {
    if (!selectedApp || !selectedSlotId) return;
    setError('');
    const res = await apiClient.post(`/api/applications/${selectedApp.id}/triage`, {
      slotId: Number(selectedSlotId) });
    if (res.success) {
      setSelectedApp(null);
      loadApplications();
    } else {
      setError(res.error || '分诊失败');
    }
  }

  if (!isNurse) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
          <div className="text-red-600 text-lg font-medium">无权访问</div>
          <p className="text-red-500 text-sm mt-2">仅护士可访问分诊确认页面</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ListChecks className="w-6 h-6 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-800">分诊确认</h1>
        </div>
        <button
          onClick={loadApplications}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200">
        {loading ? (
          <div className="text-center py-12 text-slate-500">加载中...</div>
        ) : applications.length === 0 ? (
          <div className="text-center py-12 text-slate-500">暂无待分诊申请</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-y border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">ID</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">患者</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">医生/科室</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">复诊原因</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">期望日期</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">创建时间</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applications.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700">#{app.id}</td>
                    <td className="px-4 py-3 text-slate-700">{app.patientName}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {app.doctorName}
                      <span className="text-slate-500"> / {app.department}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-xs truncate">{app.reason}</td>
                    <td className="px-4 py-3 text-slate-700">{app.expectedDate}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={app.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-500">{app.createdAt}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openTriageModal(app)}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                      >
                        分诊
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedApp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-slate-700" />
                <h3 className="text-lg font-semibold text-slate-800">分诊确认</h3>
              </div>
              <button
                onClick={() => setSelectedApp(null)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">患者</span>
                <span className="text-slate-700">{selectedApp.patientName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">目标医生</span>
                <span className="text-slate-700">
                  {selectedApp.doctorName} ({selectedApp.department})
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">复诊原因</span>
                <span className="text-slate-700">{selectedApp.reason}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">期望日期</span>
                <span className="text-slate-700">{selectedApp.expectedDate}</span>
              </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">选择号源</label>
                {modalLoading ? (
                  <div className="text-center py-4 text-slate-500 text-sm">加载号源中...</div>
                ) : slots.length === 0 ? (
                  <div className="text-sm text-red-600 border border-red-300 bg-red-50 px-3 py-2 rounded-lg">
                  该医生暂无可分配号源
                </div>
                ) : (
                  <select
                  value={selectedSlotId}
                  onChange={(e) => setSelectedSlotId(e.target.value)}
                  className={cn(
                    'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
                    error ? 'border-red-500' : 'border-slate-300',
                  )}
                >
                  <option value="">请选择号源</option>
                  {slots.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.date} {PERIOD_LABEL[slot.period]} 剩余容量 {slot.totalCapacity - slot.usedCapacity}/{slot.totalCapacity}
                    </option>
                  ))}
                  </select>
                )}
              </div>

              {error && (
                <div className="border border-red-500 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-slate-200">
              <button
                onClick={() => setSelectedApp(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleTriage}
                disabled={!selectedSlotId}
                className={cn(
                  'px-4 py-2 rounded-lg font-medium transition-colors',
                  selectedSlotId
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed',
                )}
              >
                确认分诊
              </button>
            </div>
          </div>
          </div>
      )}
    </div>
  );
}
