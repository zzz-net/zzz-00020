import { useState } from 'react';
import { Download, Filter, FileSpreadsheet, FileJson } from 'lucide-react';
import type { AppointmentStatus } from '@shared/types';
import { STATUS_LABEL } from '@shared/types';

export default function ExportPage() {
  const [filters, setFilters] = useState({
    patientId: '',
    doctorId: '',
    status: '',
    dateFrom: '',
    dateTo: '',
  });

  function buildUrl(format: 'csv' | 'json') {
    const params = new URLSearchParams();
    if (filters.patientId) params.set('patientId', filters.patientId);
    if (filters.doctorId) params.set('doctorId', filters.doctorId);
    if (filters.status) params.set('status', filters.status);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    const qs = params.toString();
    return `/api/export/${format}${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Download className="w-6 h-6 text-slate-700" />
        <h1 className="text-2xl font-bold text-slate-800">数据导出</h1>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">筛选条件</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">患者ID</label>
            <input
              type="text"
              value={filters.patientId}
              onChange={(e) => setFilters({ ...filters, patientId: e.target.value })}
              placeholder="患者ID"
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">医生ID</label>
            <input
              type="text"
              value={filters.doctorId}
              onChange={(e) => setFilters({ ...filters, doctorId: e.target.value })}
              placeholder="医生ID"
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <a
          href={buildUrl('csv')}
          className="group flex flex-col items-center justify-center gap-4 p-10 bg-white border-2 border-dashed border-emerald-300 rounded-xl hover:border-emerald-500 hover:bg-emerald-50 transition-all"
        >
          <div className="p-4 bg-emerald-100 rounded-2xl group-hover:bg-emerald-200 transition-colors">
            <FileSpreadsheet className="w-12 h-12 text-emerald-600" />
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-emerald-700">导出 CSV</div>
            <div className="text-sm text-emerald-600 mt-1">适用于 Excel 打开</div>
          </div>
        </a>

        <a
          href={buildUrl('json')}
          className="group flex flex-col items-center justify-center gap-4 p-10 bg-white border-2 border-dashed border-indigo-300 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-all"
        >
          <div className="p-4 bg-indigo-100 rounded-2xl group-hover:bg-indigo-200 transition-colors">
            <FileJson className="w-12 h-12 text-indigo-600" />
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-indigo-700">导出 JSON</div>
            <div className="text-sm text-indigo-600 mt-1">适用于程序处理</div>
          </div>
        </a>
      </div>
    </div>
  );
}
