import { useEffect, useState } from 'react';
import { FilePlus, Filter, RefreshCw } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { useRoleStore } from '@/store/roleStore';
import StatusBadge from '@/components/StatusBadge';
import { cn } from '@/lib/utils';
import type {
  Doctor,
  Patient,
  RecheckApplication,
  ApplicationStatus,
} from '@shared/types';
import { STATUS_LABEL } from '@shared/types';

export default function Applications() {
  const { session } = useRoleStore();
  const canCreate = session.role === 'nurse' || session.role === 'doctor';
  const [applications, setApplications] = useState<RecheckApplication[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [form, setForm] = useState({
    patientId: '',
    doctorId: '',
    reason: '',
    expectedDate: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function loadData() {
    setLoading(true);
    const [appsRes, patientsRes, doctorsRes] = await Promise.all([
      apiClient.get<RecheckApplication[]>(
        `/api/applications${statusFilter ? `?status=${statusFilter}` : ''}`,
      ),
      apiClient.get<Patient[]>('/api/patients'),
      apiClient.get<Doctor[]>('/api/doctors'),
    ]);
    if (appsRes.success && appsRes.data) setApplications(appsRes.data);
    if (patientsRes.success && patientsRes.data) setPatients(patientsRes.data);
    if (doctorsRes.success && doctorsRes.data) setDoctors(doctorsRes.data);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setSubmitError('');
    const body = {
      patientId: Number(form.patientId),
      doctorId: Number(form.doctorId),
      reason: form.reason,
      expectedDate: form.expectedDate,
    };
    const res = await apiClient.post<RecheckApplication>('/api/applications', body);
    if (res.success) {
      setForm({ patientId: '', doctorId: '', reason: '', expectedDate: '' });
      loadData();
    } else {
      if (res.errors) setErrors(res.errors);
      if (res.error) setSubmitError(res.error);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <FilePlus className="w-6 h-6 text-slate-700" />
        <h1 className="text-2xl font-bold text-slate-800">复诊申请</h1>
      </div>

      {canCreate && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-700 mb-4">新建复诊申请</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">患者</label>
              <select
                value={form.patientId}
                onChange={(e) => setForm({ ...form, patientId: e.target.value })}
                className={cn(
                  'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
                  errors.patientId ? 'border-red-500' : 'border-slate-300',
                )}
              >
                <option value="">请选择患者</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} - {p.medicalRecordNo}
                  </option>
                ))}
              </select>
              {errors.patientId && (
                <p className="text-red-600 text-sm mt-1">{errors.patientId}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">目标医生</label>
              <select
                value={form.doctorId}
                onChange={(e) => setForm({ ...form, doctorId: e.target.value })}
                className={cn(
                  'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
                  errors.doctorId ? 'border-red-500' : 'border-slate-300',
                )}
              >
                <option value="">请选择医生</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                  {d.name} - {d.department}（{d.title}）
                  </option>
                ))}
              </select>
              {errors.doctorId && (
                <p className="text-red-600 text-sm mt-1">{errors.doctorId}</p>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">复诊原因</label>
              <textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                rows={3}
                className={cn(
                  'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
                  errors.reason ? 'border-red-500' : 'border-slate-300',
                )}
                placeholder="请描述复诊原因..."
              />
              {errors.reason && (
                <p className="text-red-600 text-sm mt-1">{errors.reason}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">期望日期</label>
              <input
                type="date"
                value={form.expectedDate}
                onChange={(e) => setForm({ ...form, expectedDate: e.target.value })}
                className={cn(
                  'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
                  errors.expectedDate ? 'border-red-500' : 'border-slate-300',
                )}
              />
              {errors.expectedDate && (
                <p className="text-red-600 text-sm mt-1">{errors.expectedDate}</p>
              )}
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                提交申请
              </button>
            </div>
            {submitError && (
              <div className="md:col-span-2 border border-red-500 bg-red-50 text-red-700 px-4 py-3 rounded-lg">
                {submitError}
              </div>
            )}
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-3">
          <h2 className="text-lg font-semibold text-slate-700">申请列表</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">全部状态</option>
                {(Object.keys(STATUS_LABEL) as ApplicationStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={loadData}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              刷新
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500">加载中...</div>
        ) : applications.length === 0 ? (
          <div className="text-center py-12 text-slate-500">暂无数据</div>
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
                    <td className="px-4 py-3 text-slate-500">-</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
