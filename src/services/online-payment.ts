/**
 * Pembayaran online lewat payment gateway (FR-4.6).
 */
import { and, eq, inArray } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { invoices, payments, rooms, tenants } from "@/db/schema";
import { formatPeriod } from "@/lib/format";
import { syncInvoiceCredit } from "./billing";
import { audit, ServiceError, SYSTEM } from "./core";
import { invoiceIdFromOrder, orderIdFor, type PaymentGateway } from "./gateway";
import { notifyPayment } from "./messaging";

/** Buat halaman bayar untuk sisa tagihan milik penghuni (dipanggil dari portal). */
export async function startOnlinePayment(
  tx: Tx,
  gateway: PaymentGateway,
  input: { tenantId: string; invoiceId: string; finishUrl: string },
) {
  const [row] = await tx
    .select({ invoice: invoices, tenantName: tenants.fullName, phone: tenants.phone, roomCode: rooms.code })
    .from(invoices)
    .innerJoin(tenants, eq(tenants.id, invoices.tenantId))
    .innerJoin(rooms, eq(rooms.id, invoices.roomId))
    .where(and(eq(invoices.id, input.invoiceId), eq(invoices.tenantId, input.tenantId)));
  if (!row) throw new ServiceError("Tagihan tidak ditemukan.");
  if (row.invoice.status !== "issued" && row.invoice.status !== "partial")
    throw new ServiceError("Tagihan ini sudah lunas.");
  const amount = row.invoice.total - row.invoice.paidAmount;
  if (amount <= 0) throw new ServiceError("Tidak ada sisa tagihan.");

  const { url } = await gateway.createCheckout({
    orderId: orderIdFor(row.invoice.id),
    amount,
    customer: { name: row.tenantName, phone: row.phone },
    description: `Sewa ${formatPeriod(row.invoice.period)} kamar ${row.roomCode}`,
    finishUrl: input.finishUrl,
  });
  await tx.update(invoices).set({ paymentLink: url }).where(eq(invoices.id, row.invoice.id));
  return url;
}

export type NotificationResult = "invalid" | "ignored" | "recorded" | "duplicate";

/**
 * Proses notifikasi gateway. Tidak pernah mempercayai isi notifikasi untuk
 * nominal/status: hanya dipakai sebagai pemicu, lalu status dicek ulang ke API.
 * Idempoten: gateway_ref (transaction_id) unik.
 */
export async function handleGatewayNotification(
  db: Db,
  gateway: PaymentGateway,
  body: unknown,
): Promise<NotificationResult> {
  const verified = gateway.verifyNotification(body);
  if (!verified.ok) return "invalid";
  const invoiceId = invoiceIdFromOrder(verified.orderId);
  if (!invoiceId) return "ignored";

  const status = await gateway.getStatus(verified.orderId);
  if (status.state !== "settled" || !status.transactionId || status.amount <= 0) return "ignored";

  return db.transaction(async (tx) => {
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!invoice) return "ignored";
    const [payment] = await tx
      .insert(payments)
      .values({
        propertyId: invoice.propertyId,
        invoiceId,
        tenantId: invoice.tenantId,
        amount: status.amount,
        paidAt: new Date(),
        method: status.method,
        status: "verified",
        submittedBy: "gateway",
        verifiedAt: new Date(),
        gatewayRef: status.transactionId,
        notes: `${gateway.name} ${verified.orderId}`,
      })
      .onConflictDoNothing({ target: payments.gatewayRef })
      .returning();
    if (!payment) return "duplicate";

    await syncInvoiceCredit(tx, invoiceId);
    await notifyPayment(tx, payment.id, "confirmed");
    await audit(tx, SYSTEM, {
      propertyId: invoice.propertyId,
      action: "payment.gateway",
      entityType: "payment",
      entityId: payment.id,
      after: { orderId: verified.orderId, amount: status.amount, invoiceStatus: invoice.status },
    });
    return "recorded";
  });
}

/** Tagihan terbuka yang bisa dibayar online (untuk tombol di portal). */
export async function payableInvoiceIds(tx: Tx, tenantId: string) {
  const rows = await tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.tenantId, tenantId), inArray(invoices.status, ["issued", "partial"])));
  return new Set(rows.map((r) => r.id));
}
