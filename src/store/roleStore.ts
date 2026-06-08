import { create } from "zustand";
import type { RoleSession } from "@shared/types";

interface RoleStore {
  session: RoleSession;
  switchNurse: () => void;
  switchDoctor: (doctorId: number, name: string) => void;
  switchPatient: (patientId: number, name: string) => void;
  setRole: (role: RoleSession["role"]) => void;
  getHeaders: () => Record<string, string>;
}

export const useRoleStore = create<RoleStore>((set, get) => ({
  session: {
    role: "nurse",
    name: "王护士",
  },
  switchNurse: () => {
    set({
      session: {
        role: "nurse",
        name: "王护士",
      },
    });
  },
  switchDoctor: (doctorId: number, name: string) => {
    set({
      session: {
        role: "doctor",
        doctorId,
        name,
      },
    });
  },
  switchPatient: (patientId: number, name: string) => {
    set({
      session: {
        role: "patient",
        patientId,
        name,
      },
    });
  },
  setRole: (role: RoleSession["role"]) => {
    if (role === "nurse") {
      set({
        session: {
          role: "nurse",
          name: "王护士",
        },
      });
    } else if (role === "doctor") {
      set({
        session: {
          role: "doctor",
          doctorId: 1,
          name: "张医生",
        },
      });
    } else if (role === "patient") {
      set({
        session: {
          role: "patient",
          patientId: 1,
          name: "李患者",
        },
      });
    }
  },
  getHeaders: () => {
    const { session } = get();
    const headers: Record<string, string> = {
      "x-user-role": session.role,
      "x-user-name": encodeURIComponent(session.name),
    };
    if (session.doctorId !== undefined) {
      headers["x-doctor-id"] = String(session.doctorId);
    }
    if (session.patientId !== undefined) {
      headers["x-patient-id"] = String(session.patientId);
    }
    return headers;
  },
}));
