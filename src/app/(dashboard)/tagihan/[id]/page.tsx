import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AddItemForm,
  RecordPaymentForm,
  RemindNowButton,
  RemoveItemButton,
  VerifyRejectButtons,
  VoidInvoiceForm,
} from "@/components/billing-forms";
import { Notice, PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { asUser } from "@/db";
import { addDays, displayStatus, todayIn } from "@/lib/billing";
import { formatDate, formatPeriod, formatRupiah } from "@/lib/format";
import { ITEM_TYPE_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { requireContext } from "@/server/actions";
import { getInvoiceDetail } from "@/services/billing";
import { signedUrl } from "@/server/uploads";
import { getSettings } from "@/services/properties";

export const metadata: Metadata = { title: "Detail tagihan" };

export default async function InvoiceDetailPage({ params, searchParams }: PageProps<"/tagihan/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user, property } = await requireContext();
  const data = await asUser(user.id, async (tx) => {
    const detail = await getInvoiceDetail(tx, id);
    return detail ? { detail, settings: await getSettings(tx, property.id) } : null;
  });
  if (!data) notFound();
  const { invoice, items, payments, tenantName, phone, roomCode } = data.detail;
  const proofUrls = new Map(
    await Promise.all(
      payments
        .filter((p) => p.proofPath)
        .map(async (p) => [p.id, await signedUrl("payment-proofs", p.proofPath)] as const),
    ),
  );
  const today = todayIn(property.timezone);
  const hasPending = payments.some((p) => p.status === "pending");
  const status = displayStatus({ ...invoice, hasPendingPayment: hasPending }, today);
  const editable = invoice.status === "issued" || invoice.status === "partial" || invoice.status === "draft";
  const remaining = Math.max(0, invoice.total - invoice.paidAmount);

  const banks = data.settings.bankAccounts.map((b) => `${b.bank} ${b.number} a.n. ${b.holder}`).join("\n");
  const waText = [
    `Halo ${tenantName} 👋`,
    `Tagihan ${property.name} kamar ${roomCode} periode ${formatPeriod(invoice.period)}: *${formatRupiah(remaining)}*, jatuh tempo *${formatDate(invoice.dueDate)}*.`,
    banks ? `\nTransfer ke:\n${banks}` : "",
    "\nTerima kasih 🙏",
  ].join("\n");

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href="/tagihan" className="text-sm text-muted-foreground hover:underline">
        ← Tagihan
      </Link>
      <PageHeader
        title={`Kamar ${roomCode} · ${formatPeriod(invoice.period)}`}
        description={
          <>
            <Link href={`/penghuni/${invoice.tenantId}`} className="hover:underline">
              {tenantName}
            </Link>{" "}
            · <span className="tabular">{invoice.number}</span>
          </>
        }
        actions={<StatusBadge status={status} className="text-sm" />}
      />
      {sp.dibayar === "1" && <Notice>Pembayaran dicatat.</Notice>}
      {invoice.status === "void" && (
        <p className="rounded-lg bg-status-muted-bg p-3 text-sm text-status-muted">
          Dibatalkan: {invoice.voidReason}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Rincian</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <dt className="text-muted-foreground">Jatuh tempo</dt>
                <dd>{formatDate(invoice.dueDate)}</dd>
                <dt className="text-muted-foreground">Periode sewa</dt>
                <dd>
                  {invoice.coversFrom && invoice.coversTo
                    ? `${formatDate(invoice.coversFrom)} – ${formatDate(addDays(invoice.coversTo, -1))}`
                    : formatPeriod(invoice.period)}
                </dd>
              </dl>
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2 pr-2">
                        <span className="block">{item.description}</span>
                        <span className="text-xs text-muted-foreground">{ITEM_TYPE_LABEL[item.type]}</span>
                      </td>
                      <td
                        className={cn(
                          "py-2 text-right whitespace-nowrap tabular",
                          item.amount < 0 && "text-status-paid",
                        )}
                      >
                        {formatRupiah(item.amount)}
                      </td>
                      <td className="w-10 py-2 text-right">
                        {editable && <RemoveItemButton itemId={item.id} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 font-medium">
                  <tr>
                    <td className="py-2">Total</td>
                    <td className="py-2 text-right tabular">{formatRupiah(invoice.total)}</td>
                    <td />
                  </tr>
                  <tr className="text-muted-foreground">
                    <td className="py-1">Sudah dibayar</td>
                    <td className="py-1 text-right tabular">{formatRupiah(invoice.paidAmount)}</td>
                    <td />
                  </tr>
                  <tr className={remaining > 0 ? "text-status-overdue" : "text-status-paid"}>
                    <td className="py-1">Sisa</td>
                    <td className="py-1 text-right tabular">{formatRupiah(remaining)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
              {editable && (
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    + Tambah item (listrik, air, diskon, …)
                  </summary>
                  <div className="pt-3">
                    <AddItemForm invoiceId={invoice.id} />
                  </div>
                </details>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pembayaran</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada pembayaran.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span>
                        <span className="block font-medium tabular">{formatRupiah(p.amount)}</span>
                        <span className="text-xs text-muted-foreground">
                          {PAYMENT_METHOD_LABEL[p.method]} · {formatDate(p.paidAt, property.timezone)} ·{" "}
                          {PAYMENT_STATUS_LABEL[p.status]}
                          {p.rejectionReason ? ` (${p.rejectionReason})` : ""}
                          {p.submittedBy === "tenant" ? " · dikirim penghuni" : ""}
                        </span>
                        {p.notes && <span className="block text-xs text-muted-foreground">{p.notes}</span>}
                        {proofUrls.get(p.id) && (
                          <a
                            href={proofUrls.get(p.id)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            Lihat bukti transfer
                          </a>
                        )}
                      </span>
                      {p.status === "pending" && <VerifyRejectButtons paymentId={p.id} />}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {invoice.status !== "void" && invoice.status !== "paid" && (
            <Card>
              <CardHeader>
                <CardTitle>Catat pembayaran</CardTitle>
              </CardHeader>
              <CardContent>
                <RecordPaymentForm
                  invoices={[{ ...invoice, tenantName, roomCode }]}
                  invoiceId={invoice.id}
                  today={today}
                />
              </CardContent>
            </Card>
          )}
          {remaining > 0 && invoice.status !== "void" && <RemindNowButton invoiceId={invoice.id} />}
          {remaining > 0 && invoice.status !== "void" && (
            <a
              href={`https://wa.me/${phone}?text=${encodeURIComponent(waText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            >
              <MessageCircle aria-hidden /> Tulis sendiri di WhatsApp
            </a>
          )}
          {editable && (
            <Card>
              <details className="p-4">
                <summary className="cursor-pointer text-sm font-medium text-status-overdue">
                  Batalkan tagihan
                </summary>
                <div className="pt-3">
                  <VoidInvoiceForm invoiceId={invoice.id} />
                </div>
              </details>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
