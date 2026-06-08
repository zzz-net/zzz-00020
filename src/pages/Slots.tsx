import { useEffect, useState } from 'react';
import { CalendarPlus, Calendar, Filter, RefreshCw } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { useRoleStore } from '@/store/roleStore';
import { cn } from '@/lib/utils';
import type { Doctor, DoctorSlot, SlotPeriod } from '@shared/types';
import { PERIOD_LABEL } from '@shared/types';

export default function Slots() {
  const { session } = useRoleStore();
  const isDoctor = session.role === 'doctor';
  const isNurse = session.role === 'nurse';
  const [slots, setSlots] = useState<DoctorSlot[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorFilter, setDoctorFilter] = useState<string>('');
  const [form, setForm] = useState({
    date: '',
    period: 'morning' as SlotPeriod,
    totalCapacity: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorFilter]);

  async function loadData() {
    setLoading(true);
    const url = doctorFilter ? `/api/slots?doctorId=${doctorFilter}` : '/api/slots';
    const [slotsRes, doctorsRes] = await Promise.all([
      apiClient.get<DoctorSlot[]>(url),
      apiClient.get<Doctor[]>('/api/doctors'),
    ]);
    if (slotsRes.success && slotsRes.data) setSlots(slotsRes.data);
    if (doctorsRes.success && doctorsRes.data) setDoctors(doctorsRes.data);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isDoctor || !session.doctorId) return;
    setErrors({});
    setSubmitError('');
    const body = {
      doctorId: session.doctorId,
      date: form.date,
      period: form.period,
      totalCapacity: Number(form.totalCapacity),
    };
    const res = await apiClient.post<DoctorSlot>('/api/slots', body);
    if (res.success) {
      setForm({ date: '', period: 'morning', totalCapacity: '' });
      loadData();
    } else {
      if (res.errors) setErrors(res.errors);
      if (res.error) setSubmitError(res.error);
    }
  }

  function getRemainingColor(slot: DoctorSlot) {
    const remaining = slot.totalCapacity - slot.usedCapacity;
    if (remaining === 0) return 'text-red-600 bg-red-50 border-red-200';
    const ratio = remaining / slot.totalCapacity;
    if (ratio < 0.3) return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-green-600 bg-green-50 border-green-200';
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Calendar className="w-6 h-6 text-slate-700" />
        <h1 className="text-2xl font-bold text-slate-800">号源管理</h1>
      </div>

      {isDoctor && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-700 mb-4">发布号源</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">日期</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className={cn(
                  'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
                  errors.date ? 'border-red-500' : 'border-slate-300',
                )}
              />
              {errors.date && <p className="text-red-600 text-sm mt-1">{errors.date}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">时段</label>
              <select
                value={form.period}
                onChange={(e) => setForm({ ...form, period: e.target.value as SlotPeriod })}
                className={cn(
                  'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
                  errors.period ? 'border-red-500' : 'border-slate-300',
                )}
              >
                <option value="morning">上午</option>
                <option value="afternoon">下午</option>
              </select>
              {errors.period && <p className="text-red-600 text-sm mt-1">{errors.period}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">号源总数</label>
              <input
                type="number"
                min="1"
                value={form.totalCapacity}
                onChange={(e) => setForm({ ...form, totalCapacity: e.target.value })}
                className={cn(
                  'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
                  errors.totalCapacity ? 'border-red-500' : 'border-slate-300',
                )}
                placeholder="正整数"
              />
              {errors.totalCapacity && (
                <p className="text-red-600 text-sm mt-1">{errors.totalCapacity}</p>
              )}
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors inline-flex items-center justify-center gap-1.5">
                <CalendarPlus className="w-4 h-4" />
                发布
              </button>
            </div>
            {submitError && (
              <div className="md:col-span-4 border border-red-500 bg-red-50 text-red-700 px-4 py-3 rounded-lg">
                {submitError}
              </div>
            )}
          </form>
        </div>
      )}

      {isNurse && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <div className="flex items-center gap-2 text-amber-700">
            <Calendar className="w-5 h-5" />
            <span className="font-medium">仅医生可发布号源</span>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-3">
          <h2 className="text-lg font-semibold text-slate-700">号源列表</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" />
              <select
                value={doctorFilter}
                onChange={(e) => setDoctorFilter(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">全部医生</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} - {d.department}
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
        ) : slots.length === 0 ? (
          <div className="text-center py-12 text-slate-500">暂无号源</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-y border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">日期</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">时段</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">医生</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">科室</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">号源总数</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">已用容量</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">剩余容量</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {slots.map((slot) => {
                  const remaining = slot.totalCapacity - slot.usedCapacity;
                  return (
                    <tr key={slot.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700">{slot.date}</td>
                      <td className="px-4 py-3 text-slate-700">{PERIOD_LABEL[slot.period]}</td>
                      <td className="px-4 py-3 text-slate-700">{slot.doctorName}</td>
                      <td className="px-4 py-3 text-slate-500">{slot.department}</td>
                      <td className="px-4 py-3 text-slate-700">{slot.totalCapacity}</td>
                      <td className="px-4 py-3 text-slate-700">{slot.usedCapacity}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                            getRemainingColor(slot),
                          )}
                        >
                          {remaining}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
