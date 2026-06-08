import { useEffect, useState } from "react";
import {
  Outlet,
  NavLink,
  useLocation,
} from "react-router-dom";
import {
  LayoutDashboard,
  ClipboardList,
  Stethoscope,
  CalendarClock,
  UserCheck,
  Search,
  Download,
  ChevronDown,
  ListChecks,
  UserX,
} from "lucide-react";
import { useRoleStore } from "@/store/roleStore";
import { apiClient } from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import type { Doctor, Patient, UserRole } from "@shared/types";

const NAV_ITEMS = [
  {
    to: "/",
    label: "仪表盘",
    icon: LayoutDashboard,
    roles: ["nurse", "doctor", "patient"] as UserRole[],
  },
  {
    to: "/applications",
    label: "复诊申请",
    icon: ClipboardList,
    roles: ["nurse", "doctor", "patient"] as UserRole[],
  },
  {
    to: "/triage",
    label: "分诊确认",
    icon: Stethoscope,
    roles: ["nurse"] as UserRole[],
  },
  {
    to: "/waitlist",
    label: "候补补号",
    icon: ListChecks,
    roles: ["nurse"] as UserRole[],
  },
  {
    to: "/slots",
    label: "号源管理",
    icon: CalendarClock,
    roles: ["doctor"] as UserRole[],
  },
  {
    to: "/confirm",
    label: "预约确认",
    icon: UserCheck,
    roles: ["patient"] as UserRole[],
  },
  {
    to: "/records",
    label: "预约记录",
    icon: Search,
    roles: ["nurse", "doctor", "patient"] as UserRole[],
  },
  {
    to: "/followup",
    label: "爽约和迟到随访",
    icon: UserX,
    roles: ["nurse", "doctor", "patient"] as UserRole[],
  },
  {
    to: "/export",
    label: "数据导出",
    icon: Download,
    roles: ["nurse", "doctor", "patient"] as UserRole[],
  },
];

const ROLE_LABEL: Record<UserRole, string> = {
  nurse: "护士",
  doctor: "医生",
  patient: "患者",
};

function Breadcrumb() {
  const location = useLocation();
  const pathMap: Record<string, string> = {
    "/": "仪表盘",
    "/applications": "复诊申请",
    "/triage": "分诊确认",
    "/waitlist": "候补补号",
    "/slots": "号源管理",
    "/confirm": "预约确认",
    "/records": "预约记录",
    "/followup": "爽约和迟到随访",
    "/export": "数据导出",
  };
  const current = pathMap[location.pathname] || "首页";
  return (
    <div className="flex items-center text-sm text-gray-500">
      <span>首页</span>
      {location.pathname !== "/" && (
        <>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{current}</span>
        </>
      )}
    </div>
  );
}

export default function Layout() {
  const { session, switchNurse, switchDoctor, switchPatient } = useRoleStore();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctorDropdownOpen, setDoctorDropdownOpen] = useState(false);
  const [patientDropdownOpen, setPatientDropdownOpen] = useState(false);

  useEffect(() => {
    apiClient.get<Doctor[]>("/api/doctors").then((res) => {
      if (res.success && res.data) {
        setDoctors(res.data);
      }
    });
    apiClient.get<Patient[]>("/api/patients").then((res) => {
      if (res.success && res.data) {
        setPatients(res.data);
      }
    });
  }, []);

  const visibleNavItems = NAV_ITEMS.filter((item) =>
    item.roles.includes(session.role),
  );

  return (
    <div className="flex h-screen w-full bg-gray-50">
      <aside className="flex w-[260px] flex-col bg-slate-900 text-white">
        <div className="border-b border-slate-800 px-6 py-5">
          <h1
            className="font-serif text-xl font-semibold tracking-wide"
            style={{ fontFamily: '"Noto Serif SC", Georgia, serif' }}
          >
            门诊复诊协同系统
          </h1>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                        isActive
                          ? "bg-primary-600 text-white"
                          : "text-slate-300 hover:bg-slate-800 hover:text-white",
                      )
                    }
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-slate-800 px-3 py-4">
          <p className="mb-3 px-3 text-xs text-slate-400">切换身份</p>
          <div className="space-y-2">
            <button
              onClick={switchNurse}
              className={cn(
                "w-full rounded-lg px-3 py-2 text-sm text-left transition-colors",
                session.role === "nurse"
                  ? "bg-primary-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700",
              )}
            >
              护士
            </button>

            <div className="relative">
              <button
                onClick={() => {
                  setDoctorDropdownOpen(!doctorDropdownOpen);
                  setPatientDropdownOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                  session.role === "doctor"
                    ? "bg-primary-600 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700",
                )}
              >
                <span>
                  医生
                  {session.role === "doctor" && ` · ${session.name}`}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    doctorDropdownOpen && "rotate-180",
                  )}
                />
              </button>
              {doctorDropdownOpen && (
                <div className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-48 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 shadow-lg">
                  {doctors.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => {
                        switchDoctor(doc.id, doc.name);
                        setDoctorDropdownOpen(false);
                      }}
                      className={cn(
                        "block w-full px-3 py-2 text-left text-sm transition-colors",
                        session.role === "doctor" && session.doctorId === doc.id
                          ? "bg-primary-600 text-white"
                          : "text-slate-300 hover:bg-slate-700",
                      )}
                    >
                      {doc.name} - {doc.department}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => {
                  setPatientDropdownOpen(!patientDropdownOpen);
                  setDoctorDropdownOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                  session.role === "patient"
                    ? "bg-primary-600 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700",
                )}
              >
                <span>
                  患者
                  {session.role === "patient" && ` · ${session.name}`}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    patientDropdownOpen && "rotate-180",
                  )}
                />
              </button>
              {patientDropdownOpen && (
                <div className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-48 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 shadow-lg">
                  {patients.map((pat) => (
                    <button
                      key={pat.id}
                      onClick={() => {
                        switchPatient(pat.id, pat.name);
                        setPatientDropdownOpen(false);
                      }}
                      className={cn(
                        "block w-full px-3 py-2 text-left text-sm transition-colors",
                        session.role === "patient" &&
                        session.patientId === pat.id
                          ? "bg-primary-600 text-white"
                          : "text-slate-300 hover:bg-slate-700",
                      )}
                    >
                      {pat.name} - {pat.medicalRecordNo}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <Breadcrumb />
          <div className="text-sm text-gray-600">
            当前身份：
            <span className="font-medium text-gray-900">
              {ROLE_LABEL[session.role]} {session.name}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
