import type { ApplicationStatus, AppointmentStatus } from "@shared/types";
import { STATUS_LABEL } from "@shared/types";
import { cn } from "@/lib/utils";

type StatusType = ApplicationStatus | AppointmentStatus;

interface StatusBadgeProps {
  status: StatusType;
}

const STATUS_COLORS: Record<StatusType, string> = {
  pending_triage: "bg-amber-100 text-amber-800",
  triaged: "bg-blue-100 text-blue-800",
  pending_confirm: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium",
        STATUS_COLORS[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
