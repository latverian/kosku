import { ROOM_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

const TONE: Record<keyof typeof ROOM_STATUS_LABEL, string> = {
  vacant: "border border-dashed border-status-muted/50 text-status-muted",
  occupied: "bg-status-upcoming-bg text-status-upcoming",
  reserved: "bg-status-pending-bg text-status-pending",
  maintenance: "bg-status-muted-bg text-status-muted",
};

export function RoomStatusBadge({ status }: { status: keyof typeof ROOM_STATUS_LABEL }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE[status],
      )}
    >
      {ROOM_STATUS_LABEL[status]}
    </span>
  );
}
