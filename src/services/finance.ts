/**
 * Pengeluaran & laporan keuangan (specs/02 M9).
 *
 * Dua sudut pandang yang sengaja dibedakan:
 * - Laba-rugi (kas): uang yang benar-benar diterima pada bulan itu (tanggal
 *   bayar, zona waktu properti) dikurangi pengeluaran bulan itu. Potongan
 *   saldo kredit TIDAK dihitung sebagai pemasukan (uangnya sudah masuk di
 *   pembayaran sebelumnya).
 * - Penagihan: per periode tagihan, berapa ditagihkan vs sudah dibayar.
 */
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { expenses, invoices, payments, properties, rooms, tenants } from "@/db/schema";
import { addMonths, type IsoDate } from "@/lib/billing";
import { agingBucket, lastPeriods, monthRange, type AgingBucket, type ExpenseCategory } from "@/lib/finance";
import { audit, must, ServiceError, type Actor } from "./core";

// ---------------------------------------------------------------------------
// Pengeluaran
// ---------------------------------------------------------------------------

export type ExpenseInput = {
  category: ExpenseCategory;
  amount: number;
  spentOn: IsoDate;
  description: string | null;
  receiptPath?: string | null;
};

function validateExpense(input: ExpenseInput) {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0)
    throw new ServiceError("Nominal harus lebih dari 0.", "amount");
}

export async function createExpense(
  tx: Tx,
  actor: Actor & { type: "user" },
  propertyId: string,
  input: ExpenseInput,
) {
  validateExpense(input);
  const [row] = await tx
    .insert(expenses)
    .values({ propertyId, ...input, receiptPath: input.receiptPath ?? null, createdBy: actor.id })
    .returning();
  await audit(tx, actor, {
    propertyId,
    action: "expense.create",
    entityType: "expense",
    entityId: row.id,
    after: row,
  });
  return row;
}

export async function updateExpense(tx: Tx, actor: Actor, expenseId: string, input: ExpenseInput) {
  validateExpense(input);
  const before = must((await tx.select().from(expenses).where(eq(expenses.id, expenseId)))[0], "Pengeluaran");
  const [after] = await tx
    .update(expenses)
    .set({ ...input, receiptPath: input.receiptPath === undefined ? before.receiptPath : input.receiptPath })
    .where(eq(expenses.id, expenseId))
    .returning();
  await audit(tx, actor, {
    propertyId: before.propertyId,
    action: "expense.update",
    entityType: "expense",
    entityId: expenseId,
    before,
    after,
  });
  return after;
}

export async function deleteExpense(tx: Tx, actor: Actor, expenseId: string) {
  const [row] = await tx.delete(expenses).where(eq(expenses.id, expenseId)).returning();
  if (!row) throw new ServiceError("Pengeluaran tidak ditemukan atau kamu tidak punya akses.");
  await audit(tx, actor, {
    propertyId: row.propertyId,
    action: "expense.delete",
    entityType: "expense",
    entityId: expenseId,
    before: row,
  });
}

export async function listExpenses(tx: Tx, propertyId: string, period: IsoDate) {
  const { from, to } = monthRange(period);
  return tx
    .select()
    .from(expenses)
    .where(and(eq(expenses.propertyId, propertyId), gte(expenses.spentOn, from), lt(expenses.spentOn, to)))
    .orderBy(desc(expenses.spentOn), desc(expenses.createdAt));
}

// ---------------------------------------------------------------------------
// Laporan
// ---------------------------------------------------------------------------

async function timezoneOf(tx: Tx, propertyId: string) {
  const [p] = await tx
    .select({ tz: properties.timezone })
    .from(properties)
    .where(eq(properties.id, propertyId));
  return must(p, "Properti").tz;
}

/** Tanggal bayar (timestamptz) sebagai tanggal kalender di zona waktu properti. */
const paidDate = (tz: string) => sql`(${payments.paidAt} at time zone ${tz})::date`;

export type MonthlyReport = {
  period: IsoDate;
  incomeByMethod: { method: string; amount: number; count: number }[];
  income: number;
  creditApplied: number;
  expensesByCategory: { category: string; amount: number }[];
  expenses: number;
  net: number;
  billed: number;
  billedPaid: number;
  invoices: number;
};

export async function monthlyReport(tx: Tx, propertyId: string, period: IsoDate): Promise<MonthlyReport> {
  const tz = await timezoneOf(tx, propertyId);
  const { from, to } = monthRange(period);

  const byMethod = await tx
    .select({
      method: payments.method,
      amount: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(payments)
    .where(
      and(
        eq(payments.propertyId, propertyId),
        eq(payments.status, "verified"),
        sql`${paidDate(tz)} >= ${from}::date and ${paidDate(tz)} < ${to}::date`,
      ),
    )
    .groupBy(payments.method)
    .orderBy(desc(sql`sum(${payments.amount})`));

  const byCategory = await tx
    .select({
      category: expenses.category,
      amount: sql<number>`coalesce(sum(${expenses.amount}), 0)`.mapWith(Number),
    })
    .from(expenses)
    .where(and(eq(expenses.propertyId, propertyId), gte(expenses.spentOn, from), lt(expenses.spentOn, to)))
    .groupBy(expenses.category)
    .orderBy(desc(sql`sum(${expenses.amount})`));

  const [billing] = await tx
    .select({
      billed: sql<number>`coalesce(sum(${invoices.total}), 0)`.mapWith(Number),
      paid: sql<number>`coalesce(sum(least(${invoices.paidAmount}, ${invoices.total})), 0)`.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.propertyId, propertyId),
        eq(invoices.period, period),
        inArray(invoices.status, ["issued", "partial", "paid"]),
      ),
    );

  const cash = byMethod.filter((m) => m.method !== "credit");
  const income = cash.reduce((s, m) => s + m.amount, 0);
  const expenseTotal = byCategory.reduce((s, c) => s + c.amount, 0);
  return {
    period,
    incomeByMethod: cash,
    income,
    creditApplied: byMethod.find((m) => m.method === "credit")?.amount ?? 0,
    expensesByCategory: byCategory,
    expenses: expenseTotal,
    net: income - expenseTotal,
    billed: billing?.billed ?? 0,
    billedPaid: billing?.paid ?? 0,
    invoices: billing?.count ?? 0,
  };
}

export type MonthRow = {
  period: IsoDate;
  income: number;
  expenses: number;
  net: number;
  billed: number;
  billedPaid: number;
};

/** Ringkasan per bulan untuk `months` bulan s.d. `end` (grafik & laporan tahunan). */
export async function monthlySeries(
  tx: Tx,
  propertyId: string,
  end: IsoDate,
  months = 12,
): Promise<MonthRow[]> {
  const tz = await timezoneOf(tx, propertyId);
  const periods = lastPeriods(end, months);
  const from = periods[0];
  const to = addMonths(end, 1);
  const month = sql`date_trunc('month', ${paidDate(tz)})::date`;

  const income = await tx
    .select({
      period: sql<string>`${month}::text`,
      amount: sql<number>`sum(${payments.amount})`.mapWith(Number),
    })
    .from(payments)
    .where(
      and(
        eq(payments.propertyId, propertyId),
        eq(payments.status, "verified"),
        sql`${payments.method} <> 'credit'`,
        sql`${paidDate(tz)} >= ${from}::date and ${paidDate(tz)} < ${to}::date`,
      ),
    )
    // GROUP BY posisi kolom: zona waktu dikirim sebagai parameter terpisah di SELECT & GROUP BY
    .groupBy(sql`1`);
  const expenseRows = await tx
    .select({
      period: sql<string>`date_trunc('month', ${expenses.spentOn})::date::text`,
      amount: sql<number>`sum(${expenses.amount})`.mapWith(Number),
    })
    .from(expenses)
    .where(and(eq(expenses.propertyId, propertyId), gte(expenses.spentOn, from), lt(expenses.spentOn, to)))
    .groupBy(sql`date_trunc('month', ${expenses.spentOn})`);
  const billing = await tx
    .select({
      period: sql<string>`${invoices.period}::text`,
      billed: sql<number>`sum(${invoices.total})`.mapWith(Number),
      paid: sql<number>`sum(least(${invoices.paidAmount}, ${invoices.total}))`.mapWith(Number),
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.propertyId, propertyId),
        gte(invoices.period, from),
        lt(invoices.period, to),
        inArray(invoices.status, ["issued", "partial", "paid"]),
      ),
    )
    .groupBy(invoices.period);

  const map = <T extends { period: string }>(rows: T[]) =>
    new Map(rows.map((r) => [r.period.slice(0, 10), r]));
  const inc = map(income);
  const exp = map(expenseRows);
  const bil = map(billing);
  return periods.map((p) => {
    const i = inc.get(p)?.amount ?? 0;
    const e = exp.get(p)?.amount ?? 0;
    return {
      period: p,
      income: i,
      expenses: e,
      net: i - e,
      billed: bil.get(p)?.billed ?? 0,
      billedPaid: bil.get(p)?.paid ?? 0,
    };
  });
}

export type AgingRow = {
  invoiceId: string;
  number: string;
  tenantId: string;
  tenantName: string;
  phone: string;
  roomCode: string;
  dueDate: IsoDate;
  remaining: number;
  bucket: AgingBucket;
};

/** Tagihan belum lunas dikelompokkan menurut umur tunggakan. */
export async function agingReport(tx: Tx, propertyId: string, today: IsoDate) {
  const rows = await tx
    .select({
      invoiceId: invoices.id,
      number: invoices.number,
      tenantId: tenants.id,
      tenantName: tenants.fullName,
      phone: tenants.phone,
      roomCode: rooms.code,
      dueDate: invoices.dueDate,
      remaining: sql<number>`${invoices.total} - ${invoices.paidAmount}`.mapWith(Number),
    })
    .from(invoices)
    .innerJoin(tenants, eq(tenants.id, invoices.tenantId))
    .innerJoin(rooms, eq(rooms.id, invoices.roomId))
    .where(and(eq(invoices.propertyId, propertyId), inArray(invoices.status, ["issued", "partial"])))
    .orderBy(asc(invoices.dueDate));
  const list: AgingRow[] = rows.map((r) => ({ ...r, bucket: agingBucket(r.dueDate, today) }));
  const totals = { current: 0, d1_7: 0, d8_30: 0, d30plus: 0 } as Record<AgingBucket, number>;
  for (const r of list) totals[r.bucket] += r.remaining;
  return { rows: list, totals, total: list.reduce((s, r) => s + r.remaining, 0) };
}
