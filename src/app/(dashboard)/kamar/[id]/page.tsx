import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { RoomStatusBadge } from "@/components/room-status";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { asUser } from "@/db";
import { displayStatus, todayIn } from "@/lib/billing";
import { formatDate, formatPeriod, formatRupiah } from "@/lib/format";
import { requireContext } from "@/server/actions";
import { getRoomDetail } from "@/services/rooms";
import { ArchiveRoomButton, EditRoomForm } from "../room-form";

export const metadata: Metadata = { title: "Detail kamar" };

export default async function RoomDetailPage({ params }: PageProps<"/kamar/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user, property } = await requireContext();
  const detail = await asUser(user.id, (tx) => getRoomDetail(tx, id));
  if (!detail || detail.room.archivedAt) notFound();
  const { room, history, invoices } = detail;
  const current = history.find((h) => h.status === "active");
  const today = todayIn(property.timezone);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href="/kamar" className="text-sm text-muted-foreground hover:underline">
        ← Kamar
      </Link>
      <PageHeader
        title={`Kamar ${room.code}`}
        description={
          [room.type, room.floor != null ? `Lantai ${room.floor}` : null].filter(Boolean).join(" · ") ||
          undefined
        }
        actions={<RoomStatusBadge status={room.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Penghuni</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {current ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Link
                      href={`/penghuni/${current.tenantId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {current.tenantName}
                    </Link>
                    <p className="text-muted-foreground">
                      Sejak {formatDate(current.startDate)} · {formatRupiah(current.monthlyRent)}/bln
                    </p>
                  </div>
                  <Link
                    href={`/penghuni/${current.tenantId}#sewa`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Check-out / pindah
                  </Link>
                </div>
              ) : room.status === "maintenance" ? (
                <p className="text-muted-foreground">
                  Kamar sedang perbaikan. Ubah status ke Kosong untuk menerima penghuni.
                </p>
              ) : (
                <Link href={`/penghuni/baru?kamar=${room.id}`} className={buttonVariants()}>
                  Check-in penghuni
                </Link>
              )}
              {history.filter((h) => h.status === "ended").length > 0 && (
                <details>
                  <summary className="cursor-pointer text-muted-foreground">Riwayat penghuni</summary>
                  <ul className="mt-2 space-y-1">
                    {history
                      .filter((h) => h.status === "ended")
                      .map((h) => (
                        <li key={h.leaseId}>
                          <Link href={`/penghuni/${h.tenantId}`} className="hover:underline">
                            {h.tenantName}
                          </Link>{" "}
                          <span className="text-muted-foreground">
                            {formatDate(h.startDate)} – {h.endDate ? formatDate(h.endDate) : "?"}
                          </span>
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ubah kamar</CardTitle>
            </CardHeader>
            <CardContent>
              <EditRoomForm room={room} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tagihan terakhir</CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              {invoices.length === 0 ? (
                <p className="px-4 pb-2 text-sm text-muted-foreground">Belum ada tagihan.</p>
              ) : (
                <ul className="divide-y">
                  {invoices.map((inv) => (
                    <li key={inv.id}>
                      <Link
                        href={`/tagihan/${inv.id}`}
                        className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-muted/60"
                      >
                        <span>
                          <span className="block font-medium">{formatPeriod(inv.period)}</span>
                          <span className="text-xs text-muted-foreground tabular">
                            {formatRupiah(inv.total)}
                          </span>
                        </span>
                        <StatusBadge status={displayStatus(inv, today)} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card className="p-4">
            <ArchiveRoomButton roomId={room.id} disabled={Boolean(current)} />
          </Card>
        </div>
      </div>
    </div>
  );
}
