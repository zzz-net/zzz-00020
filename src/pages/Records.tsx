import { useEffect, useState } from 'react';
import { ClipboardList, Filter, X, Clock, History } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import StatusBadge from '@/components/StatusBadge';
import { cn } from '@/lib/utils';
import type {
  Appointment,
  Doctor,
  Patient,
  StatusHistory,
  AppointmentStatus,
  UserRole,
} from '@shared/types';
import { STATUS_LABEL, PERIOD_LABEL } from '@shared/types';

const roleLabels: Record<UserRole, string> = {
  nurse: '护士',
  doctor: '医生',
  patient: '患者',
};

export default function Records() {
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
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardList className="w-6 h-6 text-slate-700" />
        <h1 className="text-2xl font-bold text-slate-800">预约记录查询</h1>
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
                  <th className="text-left px-4 py-3 font-medium text-slate-600">取消原因</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">创建时间</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {appointments.map((appt) => (
                  <tr
                    key={appt.id}
                    className={cn('hover:bg-slate-50', appt.status === 'cancelled' && 'bg-red-50/50')}
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
                      {appt.status === 'cancelled' && appt.cancelReason ? (
                        <span className="text-red-600 font-medium">{appt.cancelReason}</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{appt.createdAt}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openHistoryModal(appt)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        <History className="w-4 h-4" />
                        查看历史
                      </button>
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-slate-700" />
                <h3 className="text-lg font-semibold text-slate-800">状态历史</h3>
              </div>
              <button
                onClick={() => setSelectedAppt(null)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
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
                          </div>
                          <div className="text-sm text-slate-700 font-medium">
                            {roleLabels[h.operatorRole]} {h.operatorName}
                          </div>
                          <div className="text-sm text-slate-600 mt-0.5">
                            {h.fromStatus ? (
                              <>
                                {STATUS_LABEL[h.fromStatus as keyof typeof STATUS_LABEL] ?? h.fromStatus}
                                {' → '}
                              </>
                            ) : null}
                            <span className="font-medium">
                              {STATUS_LABEL[h.toStatus as keyof typeof STATUS_LABEL] ?? h.toStatus}
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
    </div>
  );
}
