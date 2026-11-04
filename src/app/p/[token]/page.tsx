import { ChevronRight, MessageCircle } from "lucide-react";
import Link from "next/link";
import { PortalInvalid } from "@/components/portal-invalid";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { adminDb } from "@/db";
import { addDays, displayStatus } from "@/lib/billing";
import { formatDate, formatPeriod, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getPortal } from "@/server/portal";
import { listComplaints, STATUS_LABEL } from "@/services/complaints";
import { portalInvoices } from "@/services/portal";
import { ComplaintForm, CopyButton, UploadProofForm } from "./forms";

export default async function PortalPage({ params, searchParams }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const portal = await getPortal(token);
  if (!portal) return <PortalInvalid />;

  const { invoices, complaints } = await adminDb().transaction(async (tx) => ({
    invoices: await portalInvoices(tx, portal.tenantId),
    complaints: await listComplaints(tx, portal.propertyId, { tenantId: portal.tenantId }),
  }));
  const open = invoices
    .filter((i) => i.status === "issued" || i.status === "partial")
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  const history = invoices.filter((i) => i.status === "paid");

  return (
    <>
      <div>
        <p className="text-sm text-muted-foreground">{portal.propertyName}</p>
        <h1 className="text-xl font-semibold">Halo, {portal.tenantName.split(" ")[0]} 👋</h1>
        {portal.roomCode && (
          <p className="text-sm text-muted-foreground">
            Kamar {portal.roomCode}
            {portal.active ? "" : " · sudah check-out"}
          </p>
        )}
      </div>

      {sp.terkirim === "1" && (
        <p role="status" className="rounded-lg bg-status-paid-bg p-3 text-sm text-status-paid">
          Bukti bayar terkirim ✅ Pengelola akan memverifikasi dan kamu akan dapat konfirmasi lewat WhatsApp.
        </p>
      )}

      <section aria-labelledby="tagihan" className="space-y-3">
        <h2 id="tagihan" className="font-semibold">
          Tagihan
        </h2>
        {open.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">
            Tidak ada tagihan yang perlu dibayar. Terima kasih! 🙏
          </Card>
        ) : (
          open.map((inv) => {
            const pending = inv.payments.filter((p) => p.status === "pending");
            const remaining = Math.max(0, inv.total - inv.paidAmount);
            return (
              <Card key={inv.id}>
                <CardHeader className="flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle>{formatPeriod(inv.period)}</CardTitle>
                    <p className="mt-1 text-2xl font-semibold tabular">{formatRupiah(remaining)}</p>
                    <p className="text-sm text-muted-foreground">
                      Jatuh tempo {formatDate(inv.dueDate)}
                      {inv.coversFrom && inv.coversTo
                        ? ` · ${formatDate(inv.coversFrom)} – ${formatDate(addDays(inv.coversTo, -1))}`
                        : ""}
                    </p>
                  </div>
                  <StatusBadge
                    status={displayStatus({ ...inv, hasPendingPayment: pending.length > 0 }, portal.today)}
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  {portal.bankAccounts.length > 0 && (
                    <div className="space-y-2 rounded-lg bg-muted p-3">
                      <p className="text-xs font-medium text-muted-foreground">Transfer ke</p>
                      {portal.bankAccounts.map((b) => (
                        <div key={b.number} className="flex items-center justify-between gap-2">
                          <div className="text-sm">
                            <p className="font-semibold tabular">
                              {b.bank} {b.number}
                            </p>
                            <p className="text-muted-foreground">a.n. {b.holder}</p>
                          </div>
                          <CopyButton text={b.number} />
                        </div>
                      ))}
                    </div>
                  )}
                  {pending.length > 0 ? (
                    <p className="rounded-lg bg-status-pending-bg p-3 text-sm text-status-pending">
                      Bukti bayar {formatRupiah(pending[0].amount)} sedang diverifikasi pengelola.
                    </p>
                  ) : (
                    <details className="rounded-lg border p-3" open={open.length === 1}>
                      <summary className="cursor-pointer font-medium">
                        Sudah transfer? Kirim bukti bayar
                      </summary>
                      <div className="pt-3">
                        <UploadProofForm
                          token={token}
                          invoiceId={inv.id}
                          remaining={remaining}
                          today={portal.today}
                        />
                      </div>
                    </details>
                  )}
                  {inv.payments.some((p) => p.status === "rejected") && (
                    <p className="text-xs text-status-overdue">
                      Bukti sebelumnya ditolak:{" "}
                      {inv.payments.find((p) => p.status === "rejected")?.rejectionReason}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </section>

      <section aria-labelledby="komplain" className="space-y-3">
        <h2 id="komplain" className="font-semibold">
          Lapor masalah
        </h2>
        <Card>
          <details className="p-4">
            <summary className="cursor-pointer font-medium">🛠 Ada yang rusak atau bermasalah?</summary>
            <div className="pt-3">
              <ComplaintForm token={token} />
            </div>
          </details>
        </Card>
        {complaints.length > 0 && (
          <Card className="divide-y overflow-hidden p-0">
            {complaints.map((c) => (
              <Link
                key={c.id}
                href={`/p/${token}/komplain/${c.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    #{c.number} {c.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(c.createdAt, portal.timezone)}
                  </span>
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    c.status === "resolved"
                      ? "bg-status-paid-bg text-status-paid"
                      : c.status === "rejected"
                        ? "bg-status-muted-bg text-status-muted"
                        : c.status === "in_progress"
                          ? "bg-status-partial-bg text-status-partial"
                          : "bg-status-upcoming-bg text-status-upcoming",
                  )}
                >
                  {STATUS_LABEL[c.status]}
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            ))}
          </Card>
        )}
      </section>

      {history.length > 0 && (
        <section aria-labelledby="riwayat" className="space-y-3">
          <h2 id="riwayat" className="font-semibold">
            Riwayat pembayaran
          </h2>
          <Card className="divide-y overflow-hidden p-0">
            {history.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>
                  <span className="block font-medium">{formatPeriod(inv.period)}</span>
                  <span className="text-xs text-muted-foreground">
                    Lunas {inv.paidAt ? formatDate(inv.paidAt, portal.timezone) : ""}
                  </span>
                </span>
                <span className="tabular">{formatRupiah(inv.total)}</span>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section aria-labelledby="info" className="space-y-3">
        <h2 id="info" className="font-semibold">
          Info kos
        </h2>
        <Card className="space-y-3 p-4 text-sm">
          {portal.rules ? (
            <p className="whitespace-pre-line">{portal.rules}</p>
          ) : (
            <p className="text-muted-foreground">Belum ada aturan kos.</p>
          )}
          {portal.contactPhone && (
            <a
              href={`https://wa.me/${portal.contactPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            >
              <MessageCircle aria-hidden /> Hubungi pengelola
            </a>
          )}
        </Card>
      </section>
      <p className="text-center text-xs text-muted-foreground">
        Link ini khusus untuk kamu. Jangan dibagikan ke orang lain.
      </p>
    </>
  );
}
