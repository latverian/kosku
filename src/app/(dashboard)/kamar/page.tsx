import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Notice, PageHeader } from "@/components/page-header";
import { RoomStatusBadge } from "@/components/room-status";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { asUser } from "@/db";
import { formatRupiah } from "@/lib/format";
import { ROOM_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { requireContext } from "@/server/actions";
import { listRooms } from "@/services/rooms";

export const metadata: Metadata = { title: "Kamar" };

const FILTERS = ["all", "vacant", "occupied", "reserved", "maintenance"] as const;

export default async function RoomsPage({ searchParams }: PageProps<"/kamar">) {
  const { status, ditambah } = await searchParams;
  const filter = FILTERS.includes(status as (typeof FILTERS)[number])
    ? (status as (typeof FILTERS)[number])
    : "all";
  const { user, property } = await requireContext();
  const rooms = await asUser(user.id, (tx) => listRooms(tx, property.id));
  const shown = filter === "all" ? rooms : rooms.filter((r) => r.status === filter);
  const counts = Object.fromEntries(
    FILTERS.map((f) => [f, f === "all" ? rooms.length : rooms.filter((r) => r.status === f).length]),
  );

  const floors = new Map<number | null, typeof shown>();
  for (const r of shown) floors.set(r.floor, [...(floors.get(r.floor) ?? []), r]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kamar"
        description={`${rooms.length} kamar · ${counts.occupied} terisi · ${counts.vacant} kosong`}
        actions={
          <Link href="/kamar/baru" className={buttonVariants()}>
            <Plus aria-hidden /> Tambah kamar
          </Link>
        }
      />
      {ditambah && <Notice>{ditambah} kamar berhasil ditambahkan.</Notice>}

      <nav aria-label="Filter status" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/kamar" : `/kamar?status=${f}`}
            aria-current={filter === f ? "page" : undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm",
              filter === f
                ? "border-primary bg-accent text-accent-foreground"
                : "bg-card text-muted-foreground",
            )}
          >
            {f === "all" ? "Semua" : ROOM_STATUS_LABEL[f]}
            <span className="text-xs tabular">{counts[f]}</span>
          </Link>
        ))}
      </nav>

      {rooms.length === 0 ? (
        <EmptyState>
          Belum ada kamar.{" "}
          <Link href="/kamar/baru" className="font-medium text-primary hover:underline">
            Tambah kamar pertama
          </Link>
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState>Tidak ada kamar dengan status ini.</EmptyState>
      ) : (
        [...floors.entries()].map(([floor, list]) => (
          <section key={floor ?? "none"} className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              {floor != null ? `Lantai ${floor}` : "Tanpa lantai"}
            </h2>
            <Card className="divide-y overflow-hidden p-0">
              {list.map((r) => (
                <Link
                  key={r.id}
                  href={`/kamar/${r.id}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted/60"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-muted font-semibold tabular">
                    {r.code}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {r.tenantName ?? <span className="text-muted-foreground">Belum ada penghuni</span>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[
                        r.type,
                        formatRupiah(r.monthlyPrice) + "/bln",
                        r.capacity > 1 ? `${r.capacity} orang` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <RoomStatusBadge status={r.status} />
                </Link>
              ))}
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
