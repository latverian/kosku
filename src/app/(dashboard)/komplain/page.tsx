import { Camera } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PRIORITY_TONE } from "@/components/complaint-tone";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { asUser } from "@/db";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireContext } from "@/server/actions";
import {
  CATEGORY_LABEL,
  listComplaints,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type ComplaintStatus,
} from "@/services/complaints";
import { listRooms } from "@/services/rooms";
import { StaffCreateComplaintForm } from "./forms";

export const metadata: Metadata = { title: "Komplain" };

const TABS: { value: string; label: string; status: ComplaintStatus[] }[] = [
  { value: "aktif", label: "Aktif", status: ["open", "in_progress"] },
  { value: "baru", label: "Baru", status: ["open"] },
  { value: "diproses", label: "Diproses", status: ["in_progress"] },
  { value: "selesai", label: "Selesai", status: ["resolved", "rejected"] },
];

export default async function ComplaintsPage({ searchParams }: PageProps<"/komplain">) {
  const { tab } = await searchParams;
  const current = TABS.find((t) => t.value === tab) ?? TABS[0];
  const { user, property } = await requireContext();
  const { list, all, rooms } = await asUser(user.id, async (tx) => ({
    list: await listComplaints(tx, property.id, { status: current.status }),
    all: await listComplaints(tx, property.id, { status: ["open", "in_progress"] }),
    rooms: await listRooms(tx, property.id),
  }));
  const counts = {
    baru: all.filter((c) => c.status === "open").length,
    diproses: all.filter((c) => c.status === "in_progress").length,
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Komplain" description={`${counts.baru} baru · ${counts.diproses} diproses`} />
      <nav
        aria-label="Status komplain"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0"
      >
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value === "aktif" ? "/komplain" : `/komplain?tab=${t.value}`}
            aria-current={current.value === t.value ? "page" : undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm",
              current.value === t.value
                ? "border-primary bg-accent text-accent-foreground"
                : "bg-card text-muted-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {list.length === 0 ? (
        <EmptyState>
          {current.value === "selesai" ? "Belum ada komplain yang selesai." : "Tidak ada komplain. 🎉"}
        </EmptyState>
      ) : (
        <Card className="divide-y overflow-hidden p-0">
          {list.map((c) => (
            <Link
              key={c.id}
              href={`/komplain/${c.id}`}
              className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted/60"
            >
              <span className="w-10 shrink-0 text-sm text-muted-foreground tabular">#{c.number}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[
                    c.roomCode ? `Kamar ${c.roomCode}` : (c.location ?? "Area umum"),
                    c.tenantName,
                    CATEGORY_LABEL[c.category],
                    formatDate(c.createdAt, property.timezone),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {c.assigneeName ? ` · 🔧 ${c.assigneeName}` : ""}
                </span>
              </span>
              {c.photos > 0 && (
                <Camera className="size-4 text-muted-foreground" aria-label={`${c.photos} foto`} />
              )}
              <span className="flex flex-col items-end gap-1">
                <span
                  className={cn("rounded-full px-2 py-0.5 text-xs font-medium", PRIORITY_TONE[c.priority])}
                >
                  {PRIORITY_LABEL[c.priority]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {STATUS_LABEL[c.status]}
                  {c.rating ? ` · ${"★".repeat(c.rating)}` : ""}
                </span>
              </span>
            </Link>
          ))}
        </Card>
      )}

      <Card>
        <details className="p-4">
          <summary className="cursor-pointer font-medium">
            + Catat komplain atas nama penghuni / area umum
          </summary>
          <div className="pt-3">
            <StaffCreateComplaintForm
              rooms={rooms.map((r) => ({ id: r.id, code: r.code, tenantName: r.tenantName }))}
            />
          </div>
        </details>
      </Card>
    </div>
  );
}
