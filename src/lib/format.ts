/**
 * Format tampilan untuk UI berbahasa Indonesia.
 * Uang selalu bilangan bulat Rupiah (lihat specs/04-database.md).
 */
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";

export const DEFAULT_TIMEZONE = "Asia/Jakarta";

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** 1500000 → "Rp1.500.000" */
export function formatRupiah(amount: number): string {
  assertInteger(amount);
  // Intl menyisipkan spasi tak-putus ("Rp 1.500.000"); spesifikasi memakai "Rp1.500.000".
  return rupiah.format(amount).replace(/\s/g, "");
}

/** 13500000 → "Rp13,5 jt" untuk kartu ringkasan yang sempit. */
export function formatRupiahShort(amount: number): string {
  assertInteger(amount);
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const short = (value: number, unit: string) =>
    `${sign}Rp${value.toLocaleString("id-ID", { maximumFractionDigits: 1 })} ${unit}`;
  if (abs >= 1_000_000_000) return short(abs / 1_000_000_000, "M");
  if (abs >= 1_000_000) return short(abs / 1_000_000, "jt");
  if (abs >= 1_000) return short(abs / 1_000, "rb");
  return formatRupiah(amount);
}

/** "2026-11-05" atau Date → "5 Nov 2026" (zona waktu properti). */
export function formatDate(value: Date | string, timezone: string = DEFAULT_TIMEZONE): string {
  return format(toZoned(value, timezone), "d MMM yyyy", { locale: localeId });
}

/** "2026-11-01" → "November 2026" */
export function formatPeriod(period: string): string {
  return format(toZoned(period, "UTC"), "LLLL yyyy", { locale: localeId });
}

/** NIK 16 digit → "3273********0001" (NFR-4). */
export function maskNik(nik: string): string {
  const digits = nik.replace(/\D/g, "");
  if (digits.length < 8) return "*".repeat(digits.length);
  return digits.slice(0, 4) + "*".repeat(digits.length - 8) + digits.slice(-4);
}

/**
 * Normalisasi nomor WA Indonesia ke format E.164 tanpa "+": "6281234567890".
 * Menerima "0812-3456-7890", "+62 812 3456 7890", "812..." dll.
 * Mengembalikan null jika tidak valid.
 */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  else if (digits.startsWith("8")) digits = "62" + digits;
  return /^62[0-9]{8,13}$/.test(digits) ? digits : null;
}

function toZoned(value: Date | string, timezone: string): TZDate {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // Tanggal kalender murni: jangan digeser zona waktu.
    const [y, m, d] = value.split("-").map(Number);
    return new TZDate(y, m - 1, d, timezone);
  }
  return new TZDate(new Date(value).getTime(), timezone);
}

function assertInteger(amount: number) {
  if (!Number.isSafeInteger(amount)) {
    throw new TypeError(`Nominal harus bilangan bulat Rupiah, dapat: ${amount}`);
  }
}
