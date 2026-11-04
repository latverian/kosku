import {
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleAlert,
  Clock,
  CircleSlash,
  CircleMinus,
} from "lucide-react";
import type { ComponentType } from "react";
import { STATUS_LABEL, type DisplayStatus } from "@/lib/billing/status";
import { cn } from "@/lib/utils";

export type BadgeStatus = DisplayStatus | "none";

const STYLE: Record<BadgeStatus, { className: string; icon: ComponentType<{ className?: string }> }> = {
  paid: { className: "bg-status-paid-bg text-status-paid", icon: CircleCheck },
  upcoming: { className: "bg-status-upcoming-bg text-status-upcoming", icon: Clock },
  partial: { className: "bg-status-partial-bg text-status-partial", icon: CircleDot },
  overdue: { className: "bg-status-overdue-bg text-status-overdue", icon: CircleAlert },
  pending: { className: "bg-status-pending-bg text-status-pending", icon: CircleDashed },
  void: { className: "bg-status-muted-bg text-status-muted", icon: CircleSlash },
  draft: { className: "bg-status-muted-bg text-status-muted", icon: CircleDashed },
  none: { className: "bg-status-muted-bg text-status-muted", icon: CircleMinus },
};

export const BADGE_LABEL: Record<BadgeStatus, string> = { ...STATUS_LABEL, none: "Belum ditagih" };

/** Warna status selalu disertai ikon + teks (ramah buta warna). */
export function StatusBadge({
  status,
  label,
  className,
}: {
  status: BadgeStatus;
  label?: string;
  className?: string;
}) {
  const { className: tone, icon: Icon } = STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tone,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label ?? BADGE_LABEL[status]}
    </span>
  );
}

export const STATUS_TONE: Record<BadgeStatus, string> = Object.fromEntries(
  Object.entries(STYLE).map(([k, v]) => [k, v.className]),
) as Record<BadgeStatus, string>;
export const STATUS_ICON = Object.fromEntries(Object.entries(STYLE).map(([k, v]) => [k, v.icon])) as Record<
  BadgeStatus,
  ComponentType<{ className?: string }>
>;
