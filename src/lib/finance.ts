/** Logika laporan keuangan murni (specs/02 M9). */
import { addMonths, daysBetween, type IsoDate } from "./billing/dates";

export const EXPENSE_CATEGORIES = {
  electricity: "Listrik",
  water: "Air",
  internet: "Internet",
  cleaning: "Kebersihan",
  repair: "Perbaikan",
  salary: "Gaji",
  tax: "Pajak",
  other: "Lainnya",
} as const;
export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;

export type AgingBucket = "current" | "d1_7" | "d8_30" | "d30plus";
export const AGING_LABEL: Record<AgingBucket, string> = {
  current: "Belum jatuh tempo",
  d1_7: "Telat 1–7 hari",
  d8_30: "Telat 8–30 hari",
  d30plus: "Telat > 30 hari",
};

/** Kelompok umur tunggakan (FR-9.5). */
export function agingBucket(dueDate: IsoDate, today: IsoDate): AgingBucket {
  const late = daysBetween(dueDate, today);
  if (late <= 0) return "current";
  if (late <= 7) return "d1_7";
  if (late <= 30) return "d8_30";
  return "d30plus";
}

/** Daftar periode (tgl 1) dari `months` bulan terakhir s.d. `end`, urut naik. */
export function lastPeriods(end: IsoDate, months: number): IsoDate[] {
  return Array.from({ length: months }, (_, i) => addMonths(end, i - months + 1));
}

/** Batas bulan [awal, awal bulan berikutnya) untuk filter tanggal. */
export function monthRange(period: IsoDate): { from: IsoDate; to: IsoDate } {
  return { from: period, to: addMonths(period, 1) };
}

/** "2026-11" → "2026-11-01"; null bila tidak valid. */
export function periodFromMonthParam(value: unknown): IsoDate | null {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? `${value}-01` : null;
}

export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
