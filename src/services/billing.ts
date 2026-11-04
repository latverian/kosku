/**
 * Tagihan, pembayaran, dan saldo kredit (specs/02 M3 & M4).
 * Total & status tagihan dihitung trigger database; service ini hanya
 * menambah item/pembayaran lalu membaca ulang hasilnya.
 */
import { and, asc, desc, eq, inArray, like, lt, or, sql, sum } from "drizzle-orm";
import type { Tx } from "@/db/client";
import {
  invoiceItems,
  invoices,
  leases,
  payments,
  properties,
  propertySettings,
  rooms,
  tenantCredits,
  tenants,
} from "@/db/schema";
import { addDays, invoiceNumber, planInvoices, todayIn, type InvoicePlan, type IsoDate } from "@/lib/billing";
import { lateFee, type LateFeeRule } from "@/lib/billing/late-fee";
import { formatDate, formatPeriod, formatRupiah } from "@/lib/format";
import { audit, must, ServiceError, type Actor } from "./core";
import { notifyPayment } from "./messaging";

type InvoiceItemType = (typeof invoiceItems.$inferInsert)["type"];
type PaymentMethod = (typeof payments.$inferInsert)["method"];

// ---------------------------------------------------------------------------
// Pembuatan tagihan
// ---------------------------------------------------------------------------

export function rentDescription(plan: InvoicePlan): string {
  if (plan.prorated) {
    return `Sewa ${formatDate(plan.coversFrom)} – ${formatDate(addDays(plan.coversTo, -1))} (prorata)`;
  }
  return `Sewa ${formatPeriod(plan.period)} (${formatDate(plan.coversFrom)} – ${formatDate(addDays(plan.coversTo, -1))})`;
}

async function uniqueInvoiceNumber(tx: Tx, base: string): Promise<string> {
  const taken = await tx
    .select({ number: invoices.number })
    .from(invoices)
    .where(or(eq(invoices.number, base), like(invoices.number, `${base}-%`)));
  if (taken.length === 0) return base;
  const used = new Set(taken.map((t) => t.number));
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
}

/**
 * Buat tagihan yang seharusnya sudah ada untuk satu sewa aktif. Idempoten:
 * aman dipanggil berkali-kali (UNIQUE(lease_id, period) di database).
 */
export async function generateInvoicesForLease(tx: Tx, actor: Actor, leaseId: string, today?: IsoDate) {
  const [row] = await tx
    .select({
      lease: leases,
      roomCode: rooms.code,
      propertyCode: properties.code,
      timezone: properties.timezone,
      settings: propertySettings,
    })
    .from(leases)
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .innerJoin(propertySettings, eq(propertySettings.propertyId, leases.propertyId))
    .where(eq(leases.id, leaseId));
  if (!row || row.lease.status !== "active") return [];

  const { lease, settings } = row;
  const date = today ?? todayIn(row.timezone);
  const existing = await tx
    .select({ period: invoices.period })
    .from(invoices)
    .where(eq(invoices.leaseId, leaseId));

  const plans = planInvoices(
    {
      startDate: lease.startDate,
      endDate: lease.endDate,
      billingDay: lease.billingDay,
      monthlyRent: lease.monthlyRent,
      billingStartPeriod: lease.billingStartPeriod,
    },
    { invoiceLeadDays: settings.invoiceLeadDays, prorateFirstMonth: settings.prorateFirstMonth },
    date,
    new Set(existing.map((e) => e.period)),
  );

  const created = [];
  for (const plan of plans) {
    const number = await uniqueInvoiceNumber(tx, invoiceNumber(row.propertyCode, plan.period, row.roomCode));
    const [invoice] = await tx
      .insert(invoices)
      .values({
        propertyId: lease.propertyId,
        leaseId: lease.id,
        tenantId: lease.tenantId,
        roomId: lease.roomId,
        number,
        period: plan.period,
        issueDate: date < plan.dueDate ? date : plan.dueDate,
        dueDate: plan.dueDate,
        coversFrom: plan.coversFrom,
        coversTo: plan.coversTo,
      })
      .onConflictDoNothing({ target: [invoices.leaseId, invoices.period] })
      .returning();
    if (!invoice) continue; // dibuat proses lain bersamaan

    await tx.insert(invoiceItems).values({
      invoiceId: invoice.id,
      type: "rent",
      description: rentDescription(plan),
      amount: plan.rent,
      meta: { coversFrom: plan.coversFrom, coversTo: plan.coversTo, prorated: plan.prorated },
    });
    await applyCredit(tx, invoice.id);
    await audit(tx, actor, {
      propertyId: lease.propertyId,
      action: "invoice.generate",
      entityType: "invoice",
      entityId: invoice.id,
      after: { number, period: plan.period, rent: plan.rent },
    });
    created.push(invoice);
  }
  return created;
}

/** Semua sewa aktif di satu properti. Dipakai cron harian & tombol "Buat tagihan sekarang". */
export async function generateInvoicesForProperty(tx: Tx, actor: Actor, propertyId: string, today?: IsoDate) {
  const active = await tx
    .select({ id: leases.id })
    .from(leases)
    .where(and(eq(leases.propertyId, propertyId), eq(leases.status, "active")));
  let count = 0;
  for (const lease of active) {
    count += (await generateInvoicesForLease(tx, actor, lease.id, today)).length;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Denda keterlambatan otomatis (FR-3.7)
// ---------------------------------------------------------------------------

/**
 * Perbarui item denda otomatis (meta.auto = true) pada tagihan terlambat.
 * Idempoten: nominal dihitung ulang dari aturan, bukan ditambah terus.
 * Tagihan yang sudah lunas tidak disentuh, jadi denda berhenti bertambah.
 */
export async function applyLateFees(tx: Tx, actor: Actor, propertyId: string, today: IsoDate) {
  const [settings] = await tx
    .select()
    .from(propertySettings)
    .where(eq(propertySettings.propertyId, propertyId));
  if (!settings || settings.lateFeeType === "none") return 0;
  const rule: LateFeeRule =
    settings.lateFeeType === "fixed"
      ? { type: "fixed", amount: settings.lateFeeAmount, graceDays: settings.lateFeeGraceDays }
      : {
          type: "daily",
          amount: settings.lateFeeAmount,
          graceDays: settings.lateFeeGraceDays,
          max: settings.lateFeeMax,
        };

  const overdue = await tx
    .select({ id: invoices.id, dueDate: invoices.dueDate, number: invoices.number })
    .from(invoices)
    .where(
      and(
        eq(invoices.propertyId, propertyId),
        inArray(invoices.status, ["issued", "partial"]),
        lt(invoices.dueDate, today),
      ),
    );

  let changed = 0;
  for (const inv of overdue) {
    const fee = lateFee(rule, inv.dueDate, today);
    const [auto] = await tx
      .select()
      .from(invoiceItems)
      .where(
        and(
          eq(invoiceItems.invoiceId, inv.id),
          eq(invoiceItems.type, "late_fee"),
          sql`${invoiceItems.meta}->>'auto' = 'true'`,
        ),
      );
    const description =
      rule.type === "daily"
        ? `Denda keterlambatan (${formatRupiah(rule.amount)}/hari)`
        : "Denda keterlambatan";
    if (fee <= 0 || auto?.amount === fee) continue;
    if (auto) {
      await tx
        .update(invoiceItems)
        .set({ amount: fee, description, meta: { auto: true, asOf: today } })
        .where(eq(invoiceItems.id, auto.id));
    } else {
      await tx.insert(invoiceItems).values({
        invoiceId: inv.id,
        type: "late_fee",
        description,
        amount: fee,
        meta: { auto: true, asOf: today },
      });
    }
    await syncInvoiceCredit(tx, inv.id);
    await audit(tx, actor, {
      propertyId,
      action: "invoice.late_fee",
      entityType: "invoice",
      entityId: inv.id,
      before: auto?.amount ?? 0,
      after: fee,
    });
    changed++;
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Item & pembatalan tagihan
// ---------------------------------------------------------------------------

async function invoiceOrThrow(tx: Tx, invoiceId: string) {
  return must((await tx.select().from(invoices).where(eq(invoices.id, invoiceId)))[0], "Tagihan");
}

function assertEditable(invoice: { status: string }) {
  if (invoice.status === "paid") throw new ServiceError("Tagihan sudah lunas dan tidak bisa diubah.");
  if (invoice.status === "void") throw new ServiceError("Tagihan sudah dibatalkan.");
}

export async function addInvoiceItem(
  tx: Tx,
  actor: Actor,
  invoiceId: string,
  input: { type: Exclude<InvoiceItemType, "rent">; description: string; amount: number },
) {
  const invoice = await invoiceOrThrow(tx, invoiceId);
  assertEditable(invoice);
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new ServiceError("Nominal harus lebih dari 0.", "amount");
  }
  const amount = input.type === "discount" ? -input.amount : input.amount;
  if (input.type === "discount" && invoice.total + amount < 0) {
    throw new ServiceError("Diskon melebihi total tagihan.", "amount");
  }
  const [item] = await tx
    .insert(invoiceItems)
    .values({ invoiceId, type: input.type, description: input.description, amount })
    .returning();
  await syncInvoiceCredit(tx, invoiceId);
  await audit(tx, actor, {
    propertyId: invoice.propertyId,
    action: "invoice.item_add",
    entityType: "invoice",
    entityId: invoiceId,
    after: item,
  });
  return item;
}

export async function removeInvoiceItem(tx: Tx, actor: Actor, itemId: string) {
  const [item] = await tx.select().from(invoiceItems).where(eq(invoiceItems.id, itemId));
  if (!item) throw new ServiceError("Item tidak ditemukan.");
  const invoice = await invoiceOrThrow(tx, item.invoiceId);
  assertEditable(invoice);
  if (item.type === "rent") {
    const rentItems = await tx
      .select({ id: invoiceItems.id })
      .from(invoiceItems)
      .where(and(eq(invoiceItems.invoiceId, invoice.id), eq(invoiceItems.type, "rent")));
    if (rentItems.length <= 1)
      throw new ServiceError("Item sewa utama tidak bisa dihapus. Batalkan tagihan jika perlu.");
  }
  await tx.delete(invoiceItems).where(eq(invoiceItems.id, itemId));
  await syncInvoiceCredit(tx, invoice.id);
  await audit(tx, actor, {
    propertyId: invoice.propertyId,
    action: "invoice.item_remove",
    entityType: "invoice",
    entityId: invoice.id,
    before: item,
  });
}

export async function voidInvoice(tx: Tx, actor: Actor, invoiceId: string, reason: string) {
  const invoice = await invoiceOrThrow(tx, invoiceId);
  if (invoice.status === "void") throw new ServiceError("Tagihan sudah dibatalkan.");
  if (!reason.trim()) throw new ServiceError("Alasan pembatalan wajib diisi.", "reason");
  const paid = await tx
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.invoiceId, invoiceId),
        inArray(payments.status, ["verified", "pending"]),
        sql`${payments.method} <> 'credit'`,
      ),
    );
  if (paid.length > 0) {
    throw new ServiceError(
      "Tagihan masih punya pembayaran. Tolak atau batalkan pembayarannya terlebih dahulu.",
    );
  }
  await releaseCreditPayments(tx, invoiceId, `Tagihan ${invoice.number} dibatalkan`);
  const [after] = await tx
    .update(invoices)
    .set({ status: "void", voidReason: reason.trim() })
    .where(eq(invoices.id, invoiceId))
    .returning();
  await audit(tx, actor, {
    propertyId: invoice.propertyId,
    action: "invoice.void",
    entityType: "invoice",
    entityId: invoiceId,
    before: invoice,
    after,
  });
  return after;
}

// ---------------------------------------------------------------------------
// Pembayaran
// ---------------------------------------------------------------------------

export async function recordPayment(
  tx: Tx,
  actor: Actor,
  input: {
    invoiceId: string;
    amount: number;
    method: Exclude<PaymentMethod, "credit">;
    paidAt: Date;
    notes?: string | null;
    /** kirim WA konfirmasi ke penghuni (default ya) */
    notify?: boolean;
  },
) {
  if (actor.type !== "user") throw new ServiceError("Pembayaran manual harus dicatat oleh pengguna.");
  const invoice = await invoiceOrThrow(tx, input.invoiceId);
  if (invoice.status === "void") throw new ServiceError("Tagihan sudah dibatalkan.");
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0)
    throw new ServiceError("Nominal harus lebih dari 0.", "amount");

  const [payment] = await tx
    .insert(payments)
    .values({
      propertyId: invoice.propertyId,
      invoiceId: invoice.id,
      tenantId: invoice.tenantId,
      amount: input.amount,
      paidAt: input.paidAt,
      method: input.method,
      status: "verified",
      submittedBy: "staff",
      recordedBy: actor.id,
      verifiedBy: actor.id,
      verifiedAt: new Date(),
      notes: input.notes ?? null,
    })
    .returning();
  await syncInvoiceCredit(tx, invoice.id);
  if (input.notify !== false) await notifyPayment(tx, payment.id, "confirmed");
  await audit(tx, actor, {
    propertyId: invoice.propertyId,
    action: "payment.record",
    entityType: "payment",
    entityId: payment.id,
    after: payment,
  });
  return payment;
}

async function pendingPaymentOrThrow(tx: Tx, paymentId: string) {
  const payment = must((await tx.select().from(payments).where(eq(payments.id, paymentId)))[0], "Pembayaran");
  if (payment.status !== "pending") throw new ServiceError("Pembayaran ini sudah diproses.");
  return payment;
}

export async function verifyPayment(tx: Tx, actor: Actor, paymentId: string) {
  if (actor.type !== "user") throw new ServiceError("Verifikasi harus dilakukan pengguna.");
  const payment = await pendingPaymentOrThrow(tx, paymentId);
  const [after] = await tx
    .update(payments)
    .set({ status: "verified", verifiedBy: actor.id, verifiedAt: new Date(), rejectionReason: null })
    .where(eq(payments.id, paymentId))
    .returning();
  await syncInvoiceCredit(tx, payment.invoiceId);
  await notifyPayment(tx, paymentId, "confirmed");
  await audit(tx, actor, {
    propertyId: payment.propertyId,
    action: "payment.verify",
    entityType: "payment",
    entityId: paymentId,
    before: payment,
    after,
  });
  return after;
}

export async function rejectPayment(tx: Tx, actor: Actor, paymentId: string, reason: string) {
  if (actor.type !== "user") throw new ServiceError("Penolakan harus dilakukan pengguna.");
  if (!reason.trim()) throw new ServiceError("Alasan penolakan wajib diisi.", "reason");
  const payment = await pendingPaymentOrThrow(tx, paymentId);
  const [after] = await tx
    .update(payments)
    .set({ status: "rejected", rejectionReason: reason.trim(), verifiedBy: actor.id, verifiedAt: new Date() })
    .where(eq(payments.id, paymentId))
    .returning();
  await syncInvoiceCredit(tx, payment.invoiceId);
  await notifyPayment(tx, paymentId, "rejected");
  await audit(tx, actor, {
    propertyId: payment.propertyId,
    action: "payment.reject",
    entityType: "payment",
    entityId: paymentId,
    before: payment,
    after,
  });
  return after;
}

// ---------------------------------------------------------------------------
// Saldo kredit (FR-4.5)
// ---------------------------------------------------------------------------

export async function creditBalance(tx: Tx, tenantId: string): Promise<number> {
  const [row] = await tx
    .select({ balance: sum(tenantCredits.amount).mapWith(Number) })
    .from(tenantCredits)
    .where(eq(tenantCredits.tenantId, tenantId));
  return row?.balance ?? 0;
}

/**
 * Samakan saldo kredit dengan kelebihan bayar tagihan ini:
 * kelebihan = max(0, dibayar − total). Selisih terhadap kredit yang sudah
 * tercatat dari tagihan ini dicatat sebagai baris baru (bisa negatif bila
 * pembayaran ditolak atau total bertambah).
 */
export async function syncInvoiceCredit(tx: Tx, invoiceId: string) {
  const invoice = await invoiceOrThrow(tx, invoiceId);
  const desired = invoice.status === "void" ? 0 : Math.max(0, invoice.paidAmount - invoice.total);
  const invoicePayments = await tx
    .select({ id: payments.id, status: payments.status })
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId))
    .orderBy(desc(payments.createdAt));
  if (invoicePayments.length === 0) return;

  const [row] = await tx
    .select({ total: sum(tenantCredits.amount).mapWith(Number) })
    .from(tenantCredits)
    .where(
      inArray(
        tenantCredits.sourcePaymentId,
        invoicePayments.map((p) => p.id),
      ),
    );
  const recorded = row?.total ?? 0;
  const delta = desired - recorded;
  if (delta === 0) return;

  const source = invoicePayments.find((p) => p.status === "verified") ?? invoicePayments[0];
  await tx.insert(tenantCredits).values({
    propertyId: invoice.propertyId,
    tenantId: invoice.tenantId,
    amount: delta,
    sourcePaymentId: source.id,
    note: delta > 0 ? `Kelebihan bayar ${invoice.number}` : `Koreksi kelebihan bayar ${invoice.number}`,
  });
}

/**
 * Kembalikan pembayaran dari saldo kredit ke saldo penghuni (sebelum tagihan
 * dibatalkan). Pembayaran tidak dihapus, hanya ditandai ditolak agar jejaknya ada.
 */
export async function releaseCreditPayments(tx: Tx, invoiceId: string, note: string) {
  const released = await tx
    .update(payments)
    .set({ status: "rejected", rejectionReason: note })
    .where(
      and(eq(payments.invoiceId, invoiceId), eq(payments.method, "credit"), eq(payments.status, "verified")),
    )
    .returning();
  for (const p of released) {
    await tx.insert(tenantCredits).values({
      propertyId: p.propertyId,
      tenantId: p.tenantId,
      amount: p.amount,
      note,
    });
  }
  return released;
}

/** Pakai saldo kredit penghuni untuk tagihan baru (otomatis saat tagihan dibuat). */
export async function applyCredit(tx: Tx, invoiceId: string) {
  const invoice = await invoiceOrThrow(tx, invoiceId);
  const balance = await creditBalance(tx, invoice.tenantId);
  const remaining = invoice.total - invoice.paidAmount;
  const amount = Math.min(balance, remaining);
  if (amount <= 0) return null;

  const [payment] = await tx
    .insert(payments)
    .values({
      propertyId: invoice.propertyId,
      invoiceId,
      tenantId: invoice.tenantId,
      amount,
      paidAt: new Date(),
      method: "credit",
      status: "verified",
      submittedBy: "system",
      verifiedAt: new Date(),
      notes: "Dipotong dari saldo kelebihan bayar",
    })
    .returning();
  await tx.insert(tenantCredits).values({
    propertyId: invoice.propertyId,
    tenantId: invoice.tenantId,
    amount: -amount,
    appliedInvoiceId: invoiceId,
    note: `Dipakai untuk ${invoice.number}`,
  });
  return payment;
}

// ---------------------------------------------------------------------------
// Query untuk halaman
// ---------------------------------------------------------------------------

export type InvoiceFilter = {
  period?: IsoDate;
  status?: "open" | "overdue" | "paid" | "void" | "all";
  tenantId?: string;
};

export async function listInvoices(tx: Tx, propertyId: string, today: IsoDate, filter: InvoiceFilter = {}) {
  const conditions = [eq(invoices.propertyId, propertyId)];
  if (filter.period) conditions.push(eq(invoices.period, filter.period));
  if (filter.tenantId) conditions.push(eq(invoices.tenantId, filter.tenantId));
  switch (filter.status) {
    case "open":
      conditions.push(inArray(invoices.status, ["issued", "partial"]));
      break;
    case "overdue":
      conditions.push(inArray(invoices.status, ["issued", "partial"]), lt(invoices.dueDate, today));
      break;
    case "paid":
      conditions.push(eq(invoices.status, "paid"));
      break;
    case "void":
      conditions.push(eq(invoices.status, "void"));
      break;
  }
  return tx
    .select({
      id: invoices.id,
      number: invoices.number,
      period: invoices.period,
      dueDate: invoices.dueDate,
      total: invoices.total,
      paidAmount: invoices.paidAmount,
      status: invoices.status,
      tenantName: tenants.fullName,
      tenantId: tenants.id,
      roomCode: rooms.code,
      hasPending: sql<boolean>`exists (select 1 from ${payments} p where p.invoice_id = ${invoices.id} and p.status = 'pending')`,
    })
    .from(invoices)
    .innerJoin(tenants, eq(tenants.id, invoices.tenantId))
    .innerJoin(rooms, eq(rooms.id, invoices.roomId))
    .where(and(...conditions))
    .orderBy(desc(invoices.dueDate), asc(rooms.code))
    .limit(200);
}

export async function getInvoiceDetail(tx: Tx, invoiceId: string) {
  const [row] = await tx
    .select({ invoice: invoices, tenantName: tenants.fullName, phone: tenants.phone, roomCode: rooms.code })
    .from(invoices)
    .innerJoin(tenants, eq(tenants.id, invoices.tenantId))
    .innerJoin(rooms, eq(rooms.id, invoices.roomId))
    .where(eq(invoices.id, invoiceId));
  if (!row) return null;
  const items = await tx
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId))
    .orderBy(asc(invoiceItems.createdAt));
  const paymentRows = await tx
    .select()
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId))
    .orderBy(desc(payments.createdAt));
  return { ...row, items, payments: paymentRows };
}

export async function listPayments(tx: Tx, propertyId: string, status?: "pending" | "verified" | "rejected") {
  const conditions = [eq(payments.propertyId, propertyId)];
  if (status) conditions.push(eq(payments.status, status));
  return tx
    .select({
      id: payments.id,
      amount: payments.amount,
      method: payments.method,
      status: payments.status,
      paidAt: payments.paidAt,
      createdAt: payments.createdAt,
      submittedBy: payments.submittedBy,
      proofPath: payments.proofPath,
      notes: payments.notes,
      rejectionReason: payments.rejectionReason,
      invoiceId: invoices.id,
      invoiceNumber: invoices.number,
      invoiceTotal: invoices.total,
      invoicePaid: invoices.paidAmount,
      tenantName: tenants.fullName,
      roomCode: rooms.code,
    })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .innerJoin(tenants, eq(tenants.id, payments.tenantId))
    .innerJoin(rooms, eq(rooms.id, invoices.roomId))
    .where(and(...conditions))
    .orderBy(desc(payments.createdAt))
    .limit(200);
}

/** Tagihan terbuka untuk pilihan di form "Catat pembayaran". */
export async function listOpenInvoices(tx: Tx, propertyId: string) {
  return tx
    .select({
      id: invoices.id,
      number: invoices.number,
      dueDate: invoices.dueDate,
      total: invoices.total,
      paidAmount: invoices.paidAmount,
      tenantName: tenants.fullName,
      roomCode: rooms.code,
    })
    .from(invoices)
    .innerJoin(tenants, eq(tenants.id, invoices.tenantId))
    .innerJoin(rooms, eq(rooms.id, invoices.roomId))
    .where(and(eq(invoices.propertyId, propertyId), inArray(invoices.status, ["issued", "partial"])))
    .orderBy(asc(invoices.dueDate), asc(rooms.code));
}
