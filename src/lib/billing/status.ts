/**
 * Status tagihan — cermin logika trigger recalc_invoice di database
 * (drizzle/0001_triggers_and_rls.sql). Dipakai di UI & tes.
 */
import type { IsoDate } from "./dates";

export type InvoiceStatus = "draft" | "issued" | "partial" | "paid" | "void";

export function computeInvoiceStatus(input: {
  current: InvoiceStatus;
  total: number;
  paidAmount: number;
}): InvoiceStatus {
  const { current, total, paidAmount } = input;
  if (current === "void" || current === "draft") return current;
  if (paidAmount >= total) return "paid";
  if (paidAmount > 0) return "partial";
  return "issued";
}

/** "Terlambat" bukan status tersimpan, tapi kondisi turunan (FR-3.5). */
export function isOverdue(invoice: { status: InvoiceStatus; dueDate: IsoDate }, today: IsoDate): boolean {
  return (invoice.status === "issued" || invoice.status === "partial") && invoice.dueDate < today;
}

/** Status yang ditampilkan ke pengguna, termasuk kondisi turunan. */
export type DisplayStatus = "paid" | "upcoming" | "partial" | "overdue" | "pending" | "void" | "draft";

export function displayStatus(
  invoice: { status: InvoiceStatus; dueDate: IsoDate; hasPendingPayment?: boolean },
  today: IsoDate,
): DisplayStatus {
  if (invoice.status === "paid") return "paid";
  if (invoice.status === "void") return "void";
  if (invoice.status === "draft") return "draft";
  if (invoice.hasPendingPayment) return "pending";
  if (isOverdue(invoice, today)) return "overdue";
  if (invoice.status === "partial") return "partial";
  return "upcoming";
}

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  paid: "Lunas",
  upcoming: "Belum jatuh tempo",
  partial: "Dibayar sebagian",
  overdue: "Terlambat",
  pending: "Menunggu verifikasi",
  void: "Dibatalkan",
  draft: "Draf",
};

/** Nomor tagihan FR-3.4: KSK-<properti>-<YYYYMM>-<kamar> */
export function invoiceNumber(propertyCode: string, period: IsoDate, roomCode: string): string {
  const yyyymm = period.slice(0, 4) + period.slice(5, 7);
  const room = roomCode.toUpperCase().replace(/[^A-Z0-9]+/g, "");
  return `KSK-${propertyCode.toUpperCase()}-${yyyymm}-${room}`;
}
