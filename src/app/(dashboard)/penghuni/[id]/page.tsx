import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { asUser } from "@/db";
import { displayStatus, todayIn } from "@/lib/billing";
import { formatDate, formatPeriod, formatRupiah } from "@/lib/format";
import { DEPOSIT_STATUS_LABEL } from "@/lib/labels";
import { requireContext } from "@/server/actions";
import { getTenantDetail, listAvailableRooms } from "@/services/tenants";
import { configFromEnv, ensurePortalLink } from "@/services/messaging";
import { signedUrl } from "@/server/uploads";
import { CheckOutForm, EditTenantForm, IdCardForm, MoveRoomForm, MuteToggle, PortalLinkCard } from "./forms";

export const metadata: Metadata = { title: "Penghuni" };

export default async function TenantDetailPage({ params, searchParams }: PageProps<"/penghuni/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user, property } = await requireContext();
  const data = await asUser(user.id, async (tx) => {
    const detail = await getTenantDetail(tx, id);
    return detail
      ? {
          ...detail,
          rooms: detail.activeLease ? await listAvailableRooms(tx, property.id) : [],
          portalUrl: await ensurePortalLink(tx, id, configFromEnv()),
          idCardUrl: await signedUrl("id-cards", detail.tenant.idCardPath),
        }
      : null;
  });
  if (!data) notFound();
  const { tenant, activeLease, leases, invoices, credit, rooms, portalUrl, idCardUrl } = data;
  const today = todayIn(property.timezone);
  const outstanding = invoices
    .filter((i) => i.status === "issued" || i.status === "partial")
    .reduce((sum, i) => sum + (i.total - i.paidAmount), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href="/penghuni" className="text-sm text-muted-foreground hover:underline">
        ← Penghuni
      </Link>
      <PageHeader
        title={tenant.fullName}
        description={activeLease ? `Kamar ${activeLease.roomCode}` : "Alumni"}
        actions={
          <a
            href={`https://wa.me/${tenant.phone}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline" })}
          >
            <MessageCircle aria-hidden /> WhatsApp
          </a>
        }
      />
      {sp.baru === "1" && <Notice>Check-in berhasil. Tagihan pertama sudah dibuat.</Notice>}
      {sp.pindah === "1" && <Notice>Pindah kamar berhasil.</Notice>}
      {typeof sp.checkout === "string" && (
        <Notice>
          Check-out berhasil.
          {Number(sp.checkout) > 0 ? ` ${sp.checkout} tagihan yang belum jatuh tempo dibatalkan.` : ""}
        </Notice>
      )}

      <section aria-label="Ringkasan" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Tunggakan"
          value={formatRupiah(outstanding)}
          tone={outstanding > 0 ? "text-status-overdue" : undefined}
        />
        <Stat label="Saldo kelebihan bayar" value={formatRupiah(credit)} />
        <Stat label="Sewa / bulan" value={activeLease ? formatRupiah(activeLease.lease.monthlyRent) : "—"} />
        <Stat label="Tanggal tagih" value={activeLease ? `Tgl ${activeLease.lease.billingDay}` : "—"} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {activeLease && (
            <Card id="sewa">
              <CardHeader>
                <CardTitle>Sewa aktif</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <dt className="text-muted-foreground">Kamar</dt>
                  <dd>
                    <Link
                      href={`/kamar/${activeLease.lease.roomId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {activeLease.roomCode}
                    </Link>
                  </dd>
                  <dt className="text-muted-foreground">Masuk</dt>
                  <dd>{formatDate(activeLease.lease.startDate)}</dd>
                  <dt className="text-muted-foreground">Kontrak sampai</dt>
                  <dd>{activeLease.lease.endDate ? formatDate(activeLease.lease.endDate) : "—"}</dd>
                  <dt className="text-muted-foreground">Deposit</dt>
                  <dd>
                    {formatRupiah(activeLease.lease.depositAmount)} ·{" "}
                    {DEPOSIT_STATUS_LABEL[activeLease.lease.depositStatus]}
                  </dd>
                </dl>
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer font-medium">Pindah kamar</summary>
                  <div className="pt-3">
                    <MoveRoomForm
                      tenantId={tenant.id}
                      leaseId={activeLease.lease.id}
                      rooms={rooms}
                      today={today}
                    />
                  </div>
                </details>
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer font-medium text-status-overdue">Check-out</summary>
                  <div className="pt-3">
                    <CheckOutForm
                      tenantId={tenant.id}
                      leaseId={activeLease.lease.id}
                      depositAmount={activeLease.lease.depositAmount}
                      today={today}
                    />
                  </div>
                </details>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Data penghuni</CardTitle>
            </CardHeader>
            <CardContent>
              <EditTenantForm tenant={tenant} nikEnabled={Boolean(process.env.NIK_ENCRYPTION_KEY)} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Portal penghuni</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <PortalLinkCard
                tenantId={tenant.id}
                url={portalUrl}
                phone={tenant.phone}
                name={tenant.fullName.split(" ")[0]}
              />
              <MuteToggle tenantId={tenant.id} muted={tenant.remindersMuted} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Foto KTP</CardTitle>
            </CardHeader>
            <CardContent>
              <IdCardForm tenantId={tenant.id} url={idCardUrl} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Tagihan</CardTitle>
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
                            {formatRupiah(inv.total)} · {formatDate(inv.dueDate)}
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
          {leases.length > (activeLease ? 1 : 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Riwayat sewa</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {leases
                    .filter((l) => l.lease.status === "ended")
                    .map((l) => (
                      <li key={l.lease.id}>
                        <span className="font-medium">Kamar {l.roomCode}</span>{" "}
                        <span className="text-muted-foreground">
                          {formatDate(l.lease.startDate)} –{" "}
                          {l.lease.endDate ? formatDate(l.lease.endDate) : "?"}
                          {l.lease.endedReason ? ` · ${l.lease.endedReason}` : ""}
                        </span>
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-semibold tabular ${tone ?? ""}`}>{value}</p>
    </Card>
  );
}
