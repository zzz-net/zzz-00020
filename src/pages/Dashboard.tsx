import { useEffect, useState } from 'react';
import {
  Calendar,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Shield,
  Stethoscope,
  UserCheck,
  FilePlus,
  ListChecks,
  LayoutDashboard,
} from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { useRoleStore } from '@/store/roleStore';
import type { OverviewStats, UserRole } from '@shared/types';
import { cn } from '@/lib/utils';

const roleLabels: Record<UserRole, string> = {
  nurse: '护士',
  doctor: '医生',
  patient: '患者',
};

const roleIcons: Record<UserRole, typeof Shield> = {
  nurse: Shield,
  doctor: Stethoscope,
  patient: UserCheck,
};

export default function Dashboard() {
  const { session, setRole } = useRoleStore();
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    const res = await apiClient.get<OverviewStats>('/api/stats/overview');
    if (res.success && res.data) {
      setStats(res.data);
    }
    setLoading(false);
  }

  const quickLinks = [
    { icon: FilePlus, label: '新建复诊申请', href: '#/applications', roles: ['nurse', 'doctor'] as UserRole[] },
    { icon: ListChecks, label: '分诊确认', href: '#/triage', roles: ['nurse'] as UserRole[] },
    { icon: Calendar, label: '号源管理', href: '#/slots', roles: ['doctor'] as UserRole[] },
    { icon: CheckCircle2, label: '预约确认', href: '#/confirm', roles: ['patient'] as UserRole[] },
  ];

  const visibleLinks = quickLinks.filter((l) => l.roles.includes(session.role));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LayoutDashboard className="w-6 h-6 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-800">仪表盘</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">当前角色：</span>
          <div className="flex gap-1">
            {(['nurse', 'doctor', 'patient'] as UserRole[]).map((role) => {
              const Icon = roleIcons[role];
              return (
                <button
                  key={role}
                  onClick={() => setRole(role)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    session.role === role
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {roleLabels[role]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">加载中...</div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Calendar}
              title="总号源容量"
              value={stats.totalSlots}
              gradient="from-blue-500 to-blue-600"
            />
            <StatCard
              icon={Users}
              title="已用号源"
              value={stats.usedSlots}
              gradient="from-purple-500 to-purple-600"
            />
            <StatCard
              icon={Clock}
              title="待分诊"
              value={stats.pendingTriage}
              gradient="from-amber-500 to-amber-600"
            />
            <StatCard
              icon={AlertCircle}
              title="待患者确认"
              value={stats.pendingConfirm}
              gradient="from-cyan-500 to-cyan-600"
            />
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-700 mb-3">今日概览</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MiniCard
                icon={CheckCircle2}
                title="今日已确认"
                value={stats.confirmedToday}
                color="text-green-600"
                bgColor="bg-green-50"
              />
              <MiniCard
                icon={XCircle}
                title="今日已取消"
                value={stats.cancelledToday}
                color="text-red-600"
                bgColor="bg-red-50"
              />
            </div>
          </div>
        </>
      ) : null}

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-700 mb-4">使用引导</h2>
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg">
            <Shield className="w-5 h-5 text-slate-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-slate-700">角色切换</p>
              <p className="text-sm text-slate-500 mt-1">
                点击右上角按钮可切换角色，体验不同角色的功能权限。当前角色：
                <span className="font-medium text-slate-700">{roleLabels[session.role]}</span>
                （{session.name}）
              </p>
            </div>
          </div>
          {visibleLinks.length > 0 && (
            <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
              <LayoutDashboard className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-blue-700">快速操作</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {visibleLinks.map((link) => {
                    const Icon = link.icon;
                    return (
                      <a
                        key={link.label}
                        href={link.href}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-sm text-blue-700 hover:bg-blue-100 transition-colors"
                      >
                        <Icon className="w-4 h-4" />
                        {link.label}
                      </a>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: typeof Calendar;
  title: string;
  value: number;
  gradient: string;
}

function StatCard({ icon: Icon, title, value, gradient }: StatCardProps) {
  return (
    <div className={cn('rounded-xl p-5 text-white bg-gradient-to-br shadow-sm', gradient)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-white/80 text-sm">{title}</p>
          <p className="text-3xl font-bold mt-2">{value}</p>
        </div>
        <div className="p-2.5 bg-white/20 rounded-lg">
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}

interface MiniCardProps {
  icon: typeof CheckCircle2;
  title: string;
  value: number;
  color: string;
  bgColor: string;
}

function MiniCard({ icon: Icon, title, value, color, bgColor }: MiniCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-4">
      <div className={cn('p-3 rounded-lg', bgColor)}>
        <Icon className={cn('w-6 h-6', color)} />
      </div>
      <div>
        <p className="text-slate-500 text-sm">{title}</p>
        <p className={cn('text-2xl font-bold mt-1', color)}>{value}</p>
      </div>
    </div>
  );
}
