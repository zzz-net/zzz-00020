import { useEffect, useMemo, useState } from 'react';
import {
  ListChecks,
  Filter,
  Plus,
  X,
  Clock,
  History,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  Lightbulb,
  CalendarRange,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
} from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { cn } from '@/lib/utils';
import type {
  WaitlistRecord,
  WaitlistLog,
  WaitlistMatchResult,
  Doctor,
  Patient,
  WaitlistStatus,
  WaitlistUrgency,
  DoctorSlot,
  UserRole,
  Appointment,
  CreateWaitlistReq,
} from '@shared/types';
import {
  WAITLIST_STATUS_LABEL,
  WAITLIST_URGENCY_LABEL,
  PERIOD_LABEL,
} from '@shared/types';

const waitlistStatusColors: Record<WaitlistStatus, string> = {
  waiting: 'bg-amber-100 text-amber-800',
  matched: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-emerald-100 text-emerald-800',
  abandoned: 'bg-slate-200 text-slate-600',
};

const urgencyColors: Record<WaitlistUrgency, string> = {
  normal: 'bg-slate-100 text-slate-700',
  urgent: 'bg-orange-100 text-orange-700',
  emergency: 'bg-red-100 text-red-700',
};

function WaitlistStatusBadge({ status }: { status: WaitlistStatus }) {
  return (
    <span
      className={cn(
        'rounded-full px-3 py-1 text-xs font-medium',
        waitlistStatusColors[status],
      )}
    >
      {WAITLIST_STATUS_LABEL[status]}
    </span>
  );
}

function UrgencyBadge({ urgency }: { urgency: WaitlistUrgency }) {
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-0.5 text-xs font-medium',
        urgencyColors[urgency],
      )}
    >
      {WAITLIST_URGENCY_LABEL[urgency]}
    </span>
  );
}

type SortKey =
  | 'id'
  | 'createdAt'
  | 'urgency'
  | 'acceptableDateFrom'
  | 'patientName';
type SortDir = 'asc' | 'desc';

const roleLabels: Record<UserRole, string> = {
  nurse: '护士',
  doctor: '医生',
  patient: '患者',
};

export default function Waitlist() {
  const [waitlists, setWaitlists] = useState<WaitlistRecord[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [slots, setSlots] = useState<DoctorSlot[]>([]);
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState({
    status: '' as WaitlistStatus | '',
    patientId: '',
    department: '',
    doctorId: '',
    urgency: '' as WaitlistUrgency | '',
  });

  const [sortKey, setSortKey] = useState<SortKey>('urgency');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    patientId: '',
    department: '',
    doctorId: '',
    reason: '',
    acceptableDateFrom: '',
    acceptableDateTo: '',
    urgency: 'normal' as WaitlistUrgency,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [createError, setCreateError] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [selectedWaitlist, setSelectedWaitlist] = useState<WaitlistRecord | null>(null);
  const [logs, setLogs] = useState<WaitlistLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [abandonModalOpen, setAbandonModalOpen] = useState(false);
  const [abandonReason, setAbandonReason] = useState('');
  const [abandonError, setAbandonError] = useState('');
  const [abandonSubmitting, setAbandonSubmitting] = useState(false);

  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchResults, setMatchResults] = useState<
    { slotId: number; slot: DoctorSlot; matches: (WaitlistMatchResult & { waitlist?: WaitlistRecord })[] }[]
  >([]);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [confirmError, setConfirmError] = useState('');

  const departments = useMemo(() => {
    const set = new Set(doctors.map((d) => d.department));
    return Array.from(set).sort();
  }, [doctors]);

  const sortedWaitlists = useMemo(() => {
    const list = [...waitlists];
    const urgencyRank: Record<WaitlistUrgency, number> = {
      emergency: 0,
      urgent: 1,
      normal: 2,
    };
    list.sort((a, b) => {
      let va: WaitlistRecord[keyof WaitlistRecord];
      let vb: WaitlistRecord[keyof WaitlistRecord];
      switch (sortKey) {
        case 'id':
          va = a.id;
          vb = b.id;
          break;
        case 'createdAt':
          va = a.createdAt;
          vb = b.createdAt;
          break;
        case 'urgency':
          va = urgencyRank[a.urgency];
          vb = urgencyRank[b.urgency];
          break;
        case 'acceptableDateFrom':
          va = a.acceptableDateFrom;
          vb = b.acceptableDateFrom;
          break;
        case 'patientName':
          va = a.patientName || '';
          vb = b.patientName || '';
          break;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [waitlists, sortKey, sortDir]);

  useEffect(() => {
    loadLookups();
  }, []);

  useEffect(() => {
    loadWaitlists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  async function loadLookups() {
    const [doctorsRes, patientsRes, slotsRes] = await Promise.all([
      apiClient.get<Doctor[]>('/api/doctors'),
      apiClient.get<Patient[]>('/api/patients'),
      apiClient.get<DoctorSlot[]>('/api/slots'),
    ]);
    if (doctorsRes.success && doctorsRes.data) setDoctors(doctorsRes.data);
    if (patientsRes.success && patientsRes.data) setPatients(patientsRes.data);
    if (slotsRes.success && slotsRes.data) setSlots(slotsRes.data);
  }

  async function loadWaitlists() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.patientId) params.set('patientId', filters.patientId);
    if (filters.department) params.set('department', filters.department);
    if (filters.doctorId) params.set('doctorId', filters.doctorId);
    if (filters.urgency) params.set('urgency', filters.urgency);
    const url = `/api/waitlists${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await apiClient.get<WaitlistRecord[]>(url);
    if (res.success && res.data) setWaitlists(res.data);
    setLoading(false);
  }

  async function loadLogs(id: number) {
    setLogsLoading(true);
    const res = await apiClient.get<WaitlistLog[]>(`/api/waitlists/${id}/logs`);
    if (res.success && res.data) setLogs(res.data);
    setLogsLoading(false);
  }

  function openLogsModal(w: WaitlistRecord) {
    setSelectedWaitlist(w);
    setLogs([]);
    loadLogs(w.id);
    setLogsModalOpen(true);
  }

  function openAbandonModal(w: WaitlistRecord) {
    setSelectedWaitlist(w);
    setAbandonReason('');
    setAbandonError('');
    setAbandonModalOpen(true);
  }

  async function handleAbandon() {
    if (!selectedWaitlist) return;
    if (!abandonReason.trim()) {
      setAbandonError('请填写放弃原因');
      return;
    }
    setAbandonSubmitting(true);
    setAbandonError('');
    const res = await apiClient.post<WaitlistRecord>(
      `/api/waitlists/${selectedWaitlist.id}/abandon`,
      { reason: abandonReason },
    );
    setAbandonSubmitting(false);
    if (res.success) {
      setAbandonModalOpen(false);
      loadWaitlists();
    } else {
      setAbandonError(res.error || '操作失败');
    }
  }

  async function handleCreate() {
    let hasError = false;
    const errors: Record<string, string> = {};
    if (!newForm.patientId) errors.patientId = '请选择患者';
    if (!newForm.department) errors.department = '请选择科室';
    if (!newForm.reason.trim()) errors.reason = '请填写补号原因';
    if (!newForm.acceptableDateFrom) errors.acceptableDateFrom = '请选择起始日期';
    if (!newForm.acceptableDateTo) errors.acceptableDateTo = '请选择结束日期';
    if (
      newForm.acceptableDateFrom &&
      newForm.acceptableDateTo &&
      newForm.acceptableDateFrom > newForm.acceptableDateTo
    ) {
      errors.acceptableDateTo = '结束日期不能早于起始日期';
    }
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      hasError = true;
    } else {
      setFormErrors({});
    }
    if (hasError) return;

    setCreateSubmitting(true);
    setCreateError('');
    const body: CreateWaitlistReq = {
      patientId: Number(newForm.patientId),
      department: newForm.department,
      reason: newForm.reason,
      acceptableDateFrom: newForm.acceptableDateFrom,
      acceptableDateTo: newForm.acceptableDateTo,
      urgency: newForm.urgency,
    };
    if (newForm.doctorId) body.doctorId = Number(newForm.doctorId);
    const res = await apiClient.post<WaitlistRecord>('/api/waitlists', body);
    setCreateSubmitting(false);
    if (res.success) {
      setCreateModalOpen(false);
      setNewForm({
        patientId: '',
        department: '',
        doctorId: '',
        reason: '',
        acceptableDateFrom: '',
        acceptableDateTo: '',
        urgency: 'normal',
      });
      loadWaitlists();
    } else {
      if (res.errors) {
        setFormErrors(res.errors);
      } else {
        setCreateError(res.error || '创建失败');
      }
    }
  }

  async function loadMatches() {
    setMatchLoading(true);
    setMatchResults([]);
    setConfirmError('');
    const res = await apiClient.get<{ slotId: number; matches: WaitlistMatchResult[] }[]>('/api/waitlists/match/all');
    setMatchLoading(false);
    if (res.success && res.data) {
      const enriched = res.data.map((group) => {
        const slot = slots.find((s) => s.id === group.slotId);
        const matches = group.matches.map((m: WaitlistMatchResult) => ({
          ...m,
          waitlist: waitlists.find((w) => w.id === m.waitlistId),
        }));
        return { slotId: group.slotId, slot: slot!, matches };
      }).filter((g) => g.slot);
      setMatchResults(enriched);
    }
    setMatchModalOpen(true);
  }

  async function handleConfirm(match: WaitlistMatchResult & { waitlist?: WaitlistRecord }) {
    setConfirmingId(match.waitlistId);
    setConfirmError('');
    const res = await apiClient.post<Appointment>(
      `/api/waitlists/${match.waitlistId}/confirm`,
      { slotId: match.slotId },
    );
    setConfirmingId(null);
    if (res.success) {
      loadWaitlists();
      loadLookups();
      loadMatches();
    } else {
      setConfirmError(`候补#${match.waitlistId}：${res.error || '补号失败'}`);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30 inline" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 ml-1 inline text-blue-600" />
      : <ChevronDown className="w-3 h-3 ml-1 inline text-blue-600" />;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ListChecks className="w-6 h-6 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-800">候补补号管理</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadMatches}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Lightbulb className="w-4 h-4" />
            推荐补号
          </button>
          <button
            onClick={() => {
              setNewForm({
                patientId: '',
                department: '',
                doctorId: '',
                reason: '',
                acceptableDateFrom: '',
                acceptableDateTo: '',
                urgency: 'normal',
              });
              setFormErrors({});
              setCreateError('');
              setCreateModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新增候补
          </button>
          <button
            onClick={loadWaitlists}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">筛选条件</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">状态</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value as WaitlistStatus | '' })}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              {(Object.keys(WAITLIST_STATUS_LABEL) as WaitlistStatus[]).map((s) => (
                <option key={s} value={s}>{WAITLIST_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">患者</label>
            <select
              value={filters.patientId}
              onChange={(e) => setFilters({ ...filters, patientId: e.target.value })}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">科室</label>
            <select
              value={filters.department}
              onChange={(e) => setFilters({ ...filters, department: e.target.value })}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">指定医生</label>
            <select
              value={filters.doctorId}
              onChange={(e) => setFilters({ ...filters, doctorId: e.target.value })}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.name} - {d.department}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">紧急程度</label>
            <select
              value={filters.urgency}
              onChange={(e) => setFilters({ ...filters, urgency: e.target.value as WaitlistUrgency | '' })}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              {(Object.keys(WAITLIST_URGENCY_LABEL) as WaitlistUrgency[]).map((u) => (
                <option key={u} value={u}>{WAITLIST_URGENCY_LABEL[u]}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200">
        {loading ? (
          <div className="text-center py-12 text-slate-500">加载中...</div>
        ) : sortedWaitlists.length === 0 ? (
          <div className="text-center py-12 text-slate-500">暂无候补记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-y border-slate-200">
                <tr>
                  <th
                    className="text-left px-4 py-3 font-medium text-slate-600 cursor-pointer select-none hover:bg-slate-100"
                    onClick={() => toggleSort('id')}
                  >
                    编号<SortIcon col="id" />
                  </th>
                  <th
                    className="text-left px-4 py-3 font-medium text-slate-600 cursor-pointer select-none hover:bg-slate-100"
                    onClick={() => toggleSort('patientName')}
                  >
                    患者<SortIcon col="patientName" />
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">科室/医生</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">补号原因</th>
                  <th
                    className="text-left px-4 py-3 font-medium text-slate-600 cursor-pointer select-none hover:bg-slate-100"
                    onClick={() => toggleSort('acceptableDateFrom')}
                  >
                    可接受日期<SortIcon col="acceptableDateFrom" />
                  </th>
                  <th
                    className="text-left px-4 py-3 font-medium text-slate-600 cursor-pointer select-none hover:bg-slate-100"
                    onClick={() => toggleSort('urgency')}
                  >
                    紧急度<SortIcon col="urgency" />
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                  <th
                    className="text-left px-4 py-3 font-medium text-slate-600 cursor-pointer select-none hover:bg-slate-100"
                    onClick={() => toggleSort('createdAt')}
                  >
                    创建时间<SortIcon col="createdAt" />
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedWaitlists.map((w) => (
                  <tr
                    key={w.id}
                    className={cn(
                      'hover:bg-slate-50',
                      w.status === 'abandoned' && 'bg-slate-50/50',
                      w.status === 'confirmed' && 'bg-emerald-50/40',
                    )}
                  >
                    <td className="px-4 py-3 text-slate-700">#{w.id}</td>
                    <td className="px-4 py-3 text-slate-700 font-medium">{w.patientName}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{w.department}</div>
                      <div className="text-xs text-slate-400">
                        {w.doctorName ? `指定：${w.doctorName}` : '不指定医生'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate" title={w.reason}>
                      {w.reason}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div className="flex items-center gap-1">
                        <CalendarRange className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs">{w.acceptableDateFrom} ~ {w.acceptableDateTo}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <UrgencyBadge urgency={w.urgency} />
                    </td>
                    <td className="px-4 py-3">
                      <WaitlistStatusBadge status={w.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{w.createdAt}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => openLogsModal(w)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 rounded-lg text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          <History className="w-3.5 h-3.5" />
                          日志
                        </button>
                        {w.status === 'waiting' && (
                          <button
                            onClick={() => openAbandonModal(w)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 border border-red-200 text-red-600 rounded-lg text-xs hover:bg-red-50 transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            放弃
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

      {createModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 sticky top-0 bg-white">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-slate-800">新增候补补号</h3>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  患者 <span className="text-red-500">*</span>
                </label>
                <select
                  value={newForm.patientId}
                  onChange={(e) => {
                    setNewForm({ ...newForm, patientId: e.target.value });
                    if (e.target.value) setFormErrors({ ...formErrors, patientId: '' });
                  }}
                  className={cn(
                    'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm',
                    formErrors.patientId ? 'border-red-500' : 'border-slate-300',
                  )}
                >
                  <option value="">请选择患者</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.medicalRecordNo})
                    </option>
                  ))}
                </select>
                {formErrors.patientId && (
                  <p className="text-red-600 text-xs mt-1">{formErrors.patientId}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  科室 <span className="text-red-500">*</span>
                </label>
                <select
                  value={newForm.department}
                  onChange={(e) => {
                    setNewForm({ ...newForm, department: e.target.value, doctorId: '' });
                    if (e.target.value) setFormErrors({ ...formErrors, department: '' });
                  }}
                  className={cn(
                    'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm',
                    formErrors.department ? 'border-red-500' : 'border-slate-300',
                  )}
                >
                  <option value="">请选择科室</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                {formErrors.department && (
                  <p className="text-red-600 text-xs mt-1">{formErrors.department}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  指定医生（可选）
                </label>
                <select
                  value={newForm.doctorId}
                  onChange={(e) => setNewForm({ ...newForm, doctorId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  disabled={!newForm.department}
                >
                  <option value="">不指定（接受该科室任一医生）</option>
                  {doctors
                    .filter((d) => !newForm.department || d.department === newForm.department)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} - {d.title}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  补号原因 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={newForm.reason}
                  onChange={(e) => {
                    setNewForm({ ...newForm, reason: e.target.value });
                    if (e.target.value.trim()) setFormErrors({ ...formErrors, reason: '' });
                  }}
                  rows={3}
                  className={cn(
                    'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm',
                    formErrors.reason ? 'border-red-500' : 'border-slate-300',
                  )}
                  placeholder="请填写补号原因..."
                />
                {formErrors.reason && (
                  <p className="text-red-600 text-xs mt-1">{formErrors.reason}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    起始日期 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={newForm.acceptableDateFrom}
                    onChange={(e) => {
                      setNewForm({ ...newForm, acceptableDateFrom: e.target.value });
                      if (e.target.value) setFormErrors({ ...formErrors, acceptableDateFrom: '' });
                    }}
                    className={cn(
                      'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm',
                      formErrors.acceptableDateFrom ? 'border-red-500' : 'border-slate-300',
                    )}
                  />
                  {formErrors.acceptableDateFrom && (
                    <p className="text-red-600 text-xs mt-1">{formErrors.acceptableDateFrom}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    结束日期 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={newForm.acceptableDateTo}
                    onChange={(e) => {
                      setNewForm({ ...newForm, acceptableDateTo: e.target.value });
                      if (e.target.value) setFormErrors({ ...formErrors, acceptableDateTo: '' });
                    }}
                    className={cn(
                      'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm',
                      formErrors.acceptableDateTo ? 'border-red-500' : 'border-slate-300',
                    )}
                  />
                  {formErrors.acceptableDateTo && (
                    <p className="text-red-600 text-xs mt-1">{formErrors.acceptableDateTo}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  紧急程度 <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-3">
                  {(['normal', 'urgent', 'emergency'] as WaitlistUrgency[]).map((u) => (
                    <label key={u} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="urgency"
                        value={u}
                        checked={newForm.urgency === u}
                        onChange={() => setNewForm({ ...newForm, urgency: u })}
                        className="w-4 h-4 text-blue-600"
                      />
                      <UrgencyBadge urgency={u} />
                    </label>
                  ))}
                </div>
              </div>

              {createError && (
                <div className="border border-red-500 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {createError}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-slate-200 sticky bottom-0 bg-white">
              <button
                onClick={() => setCreateModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={createSubmitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createSubmitting ? '提交中...' : '提交'}
              </button>
            </div>
          </div>
        </div>
      )}

      {logsModalOpen && selectedWaitlist && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-slate-700" />
                <h3 className="text-lg font-semibold text-slate-800">
                  候补#{selectedWaitlist.id} - 操作日志
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
              <div className="bg-slate-50 rounded-lg p-4 grid grid-cols-2 gap-3 text-sm mb-4">
                <div>
                  <span className="text-slate-500">患者：</span>
                  <span className="text-slate-700 font-medium">{selectedWaitlist.patientName}</span>
                </div>
                <div>
                  <span className="text-slate-500">科室：</span>
                  <span className="text-slate-700 font-medium">{selectedWaitlist.department}</span>
                </div>
                <div>
                  <span className="text-slate-500">紧急度：</span>
                  <UrgencyBadge urgency={selectedWaitlist.urgency} />
                </div>
                <div>
                  <span className="text-slate-500">状态：</span>
                  <WaitlistStatusBadge status={selectedWaitlist.status} />
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500">补号原因：</span>
                  <span className="text-slate-700">{selectedWaitlist.reason}</span>
                </div>
              </div>

              {logsLoading ? (
                <div className="text-center py-8 text-slate-500">加载中...</div>
              ) : logs.length === 0 ? (
                <div className="text-center py-8 text-slate-500">暂无操作日志</div>
              ) : (
                <div className="relative">
                  <div className="absolute left-3 top-1 bottom-1 w-0.5 bg-slate-200" />
                  <div className="space-y-4">
                    {logs.map((h, idx) => (
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
                          <div className="text-sm text-slate-600 mt-0.5 font-medium">
                            {h.action}
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
                onClick={() => setLogsModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {abandonModalOpen && selectedWaitlist && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-600" />
                <h3 className="text-lg font-semibold text-slate-800">标记放弃候补</h3>
              </div>
              <button
                onClick={() => setAbandonModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                <div>候补编号：<span className="font-medium">#{selectedWaitlist.id}</span></div>
                <div>患者：<span className="font-medium">{selectedWaitlist.patientName}</span></div>
                <div>科室：<span className="font-medium">{selectedWaitlist.department}</span></div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  放弃原因 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={abandonReason}
                  onChange={(e) => {
                    setAbandonReason(e.target.value);
                    if (e.target.value.trim()) setAbandonError('');
                  }}
                  rows={3}
                  className={cn(
                    'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm',
                    abandonError ? 'border-red-500' : 'border-slate-300',
                  )}
                  placeholder="请填写放弃原因..."
                />
                {abandonError && (
                  <p className="text-red-600 text-xs mt-1">{abandonError}</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-slate-200">
              <button
                onClick={() => setAbandonModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAbandon}
                disabled={abandonSubmitting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {abandonSubmitting ? '提交中...' : '确认放弃'}
              </button>
            </div>
          </div>
        </div>
      )}

      {matchModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-semibold text-slate-800">推荐补号匹配</h3>
              </div>
              <button
                onClick={() => setMatchModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {confirmError && (
                <div className="border border-red-500 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {confirmError}
                </div>
              )}
              {matchLoading ? (
                <div className="text-center py-12 text-slate-500">正在匹配可补号候补...</div>
              ) : matchResults.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <AlertCircle className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p>暂无可匹配的候补记录</p>
                  <p className="text-xs text-slate-400 mt-1">
                    请检查号源是否有剩余容量，以及候补记录的科室、日期是否匹配
                  </p>
                </div>
              ) : (
                matchResults.map((group) => (
                  <div
                    key={group.slotId}
                    className="border border-slate-200 rounded-xl overflow-hidden"
                  >
                    <div className="bg-indigo-50 px-4 py-3 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-indigo-800">
                          {group.slot.date} {PERIOD_LABEL[group.slot.period]}
                        </span>
                        <span className="ml-2 text-sm text-indigo-600">
                          {group.slot.doctorName || `医生#${group.slot.doctorId}`}
                          {' '}({group.slot.department})
                        </span>
                      </div>
                      <span className="text-sm text-indigo-700 bg-white px-2 py-0.5 rounded-full">
                        剩余 {group.slot.totalCapacity - group.slot.usedCapacity}/{group.slot.totalCapacity}
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {group.matches.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-slate-400">无匹配候补</div>
                      ) : (
                        group.matches.map((m) => (
                          <div key={m.waitlistId} className="px-4 py-3 flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-slate-800">#{m.waitlistId}</span>
                                <span className="text-slate-700">{m.waitlist?.patientName}</span>
                                <UrgencyBadge urgency={m.waitlist?.urgency || 'normal'} />
                                {m.waitlist?.doctorName && (
                                  <span className="text-xs text-slate-500">指定：{m.waitlist.doctorName}</span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 mt-1 truncate">
                                {m.waitlist?.reason}
                              </div>
                              <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-2">
                                {m.matchReasons.map((r, i) => (
                                  <span key={i} className="inline-flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3 text-emerald-500" />
                                    {r}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <button
                              onClick={() => handleConfirm(m)}
                              disabled={confirmingId === m.waitlistId}
                              className="shrink-0 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {confirmingId === m.waitlistId ? '处理中...' : '确认补号'}
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end p-4 border-t border-slate-200 gap-3">
              <button
                onClick={loadMatches}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                <RefreshCw className="w-4 h-4 inline mr-1" />
                重新匹配
              </button>
              <button
                onClick={() => setMatchModalOpen(false)}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors"
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
