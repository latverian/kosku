/**
 * Portal penghuni (specs/02 M8). Tidak memakai RLS: setiap fungsi di sini
 * menerima tenantId yang SUDAH divalidasi dari token oleh `resolvePortal`,
 * dan semua query wajib difilter dengan tenantId tersebut.
 */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { invoices, leases, payments, properties, propertySettings, rooms, tenants } from "@/db/schema";
import { addDays, todayIn, type IsoDate } from "@/lib/billing";
import { hashPortalToken, looksLikePortalToken } from "@/lib/portal-token";
import { must, ServiceError } from "./core";
import { notifyProofUploaded } from "./messaging";

/** Link tetap berlaku 30 hari setelah check-out (FR-8.3). */
export const PORTAL_GRACE_DAYS = 30;

export type PortalSession = NonNullable<Awaited<ReturnType<typeof resolvePortal>>>;

export async function resolvePortal(tx: Tx, token: string, todayOverride?: IsoDate) {
  if (!looksLikePortalToken(token)) return null;
  const [row] = await tx
    .select({ tenant: tenants, property: properties, settings: propertySettings })
    .from(tenants)
    .innerJoin(properties, eq(properties.id, tenants.propertyId))
    .innerJoin(propertySettings, eq(propertySettings.propertyId, tenants.propertyId))
    .where(and(eq(tenants.portalTokenHash, hashPortalToken(token)), isNull(tenants.archivedAt)));
  if (!row) return null;

  const leaseRows = await tx
    .select({ lease: leases, roomCode: rooms.code })
    .from(leases)
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .where(eq(leases.tenantId, row.tenant.id))
    .orderBy(desc(leases.startDate));
  const active = leaseRows.find((l) => l.lease.status === "active") ?? null;
  const today = todayOverride ?? todayIn(row.property.timezone);
  if (!active) {
    const last = leaseRows[0];
    if (!last?.lease.endDate || addDays(last.lease.endDate, PORTAL_GRACE_DAYS) < today) return null;
  }
  return {
    tenantId: row.tenant.id,
    tenantName: row.tenant.fullName,
    propertyId: row.property.id,
    propertyName: row.property.name,
    contactPhone: row.property.contactPhone,
    rules: row.property.rules,
    timezone: row.property.timezone,
    bankAccounts: row.settings.bankAccounts,
    roomCode: active?.roomCode ?? leaseRows[0]?.roomCode ?? null,
    active: Boolean(active),
    today,
  };
}

export async function portalInvoices(tx: Tx, tenantId: string) {
  const rows = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.tenantId, tenantId), inArray(invoices.status, ["issued", "partial", "paid"])))
    .orderBy(desc(invoices.dueDate))
    .limit(24);
  const ids = rows.map((r) => r.id);
  const paymentRows = ids.length
    ? await tx
        .select()
        .from(payments)
        .where(and(eq(payments.tenantId, tenantId), inArray(payments.invoiceId, ids)))
        .orderBy(desc(payments.createdAt))
    : [];
  return rows.map((inv) => ({ ...inv, payments: paymentRows.filter((p) => p.invoiceId === inv.id) }));
}

/** Penghuni mengirim bukti transfer → pembayaran "menunggu verifikasi" (FR-4.2). */
export async function submitPaymentProof(
  tx: Tx,
  tenantId: string,
  input: { invoiceId: string; amount: number; paidAt: IsoDate; proofPath: string; notes: string | null },
) {
  const invoice = must(
    (
      await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, input.invoiceId), eq(invoices.tenantId, tenantId)))
    )[0],
    "Tagihan",
  );
  if (invoice.status !== "issued" && invoice.status !== "partial")
    throw new ServiceError("Tagihan ini sudah lunas atau dibatalkan.");
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0)
    throw new ServiceError("Nominal harus lebih dari 0.", "amount");
  const pending = await tx
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.invoiceId, invoice.id), eq(payments.status, "pending")));
  if (pending.length >= 3)
    throw new ServiceError("Masih ada bukti yang menunggu verifikasi. Tunggu konfirmasi pengelola dulu ya.");

  const [payment] = await tx
    .insert(payments)
    .values({
      propertyId: invoice.propertyId,
      invoiceId: invoice.id,
      tenantId,
      amount: input.amount,
      paidAt: new Date(`${input.paidAt}T05:00:00Z`),
      method: "transfer",
      status: "pending",
      submittedBy: "tenant",
      proofPath: input.proofPath,
      notes: input.notes,
    })
    .returning();
  await notifyProofUploaded(tx, payment.id);
  return payment;
}
