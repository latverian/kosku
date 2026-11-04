/**
 * Logika tanggal tagihan — murni (tanpa I/O) agar mudah diuji.
 * Tanggal kalender direpresentasikan sebagai string ISO "YYYY-MM-DD".
 * Lihat specs/02-requirements.md (M3) dan specs/05-architecture.md § 2.
 */
import { TZDate } from "@date-fns/tz";

export type IsoDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: IsoDate): { y: number; m: number; d: number } {
  const match = ISO_DATE.exec(value);
  if (!match) throw new RangeError(`Format tanggal harus YYYY-MM-DD, dapat: ${value}`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) {
    throw new RangeError(`Tanggal tidak valid: ${value}`);
  }
  return { y, m, d };
}

export function toIsoDate(y: number, m: number, d: number): IsoDate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Jumlah hari dalam bulan (m: 1–12). */
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "Hari ini" sebagai tanggal kalender di zona waktu properti. */
export function todayIn(timezone: string, now: Date = new Date()): IsoDate {
  const z = new TZDate(now.getTime(), timezone);
  return toIsoDate(z.getFullYear(), z.getMonth() + 1, z.getDate());
}

/** Selisih hari kalender: b - a. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const pa = parseIsoDate(a);
  const pb = parseIsoDate(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const { y, m, d } = parseIsoDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return toIsoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Periode = tanggal 1 di bulan tersebut. "2026-11-17" → "2026-11-01" */
export function periodOf(date: IsoDate): IsoDate {
  const { y, m } = parseIsoDate(date);
  return toIsoDate(y, m, 1);
}

export function addMonths(period: IsoDate, months: number): IsoDate {
  const { y, m } = parseIsoDate(period);
  const index = y * 12 + (m - 1) + months;
  return toIsoDate(Math.floor(index / 12), (index % 12) + 1, 1);
}

export function assertBillingDay(billingDay: number): void {
  if (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 28) {
    throw new RangeError(`Tanggal tagih harus 1–28, dapat: ${billingDay}`);
  }
}

/** Jatuh tempo untuk suatu periode. Tanggal tagih dibatasi 1–28 → selalu valid. */
export function dueDate(period: IsoDate, billingDay: number): IsoDate {
  assertBillingDay(billingDay);
  const { y, m } = parseIsoDate(period);
  return toIsoDate(y, m, billingDay);
}

/**
 * Tanggal tagih default dari tanggal masuk (FR-2.2): sama dengan tanggal masuk,
 * maksimum 28 agar aman di bulan Februari.
 */
export function defaultBillingDay(startDate: IsoDate): number {
  return Math.min(parseIsoDate(startDate).d, 28);
}
