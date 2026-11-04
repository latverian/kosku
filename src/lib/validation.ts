/** Skema Zod bersama untuk form (input dari FormData selalu string). */
import { z } from "zod";
import { normalizePhone } from "./format";

const empty = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/** "1.500.000", "Rp 1.500.000", "1500000" → 1500000 */
export function parseRupiah(value: string): number | null {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

export const money = (label: string) =>
  z.string({ error: `${label} wajib diisi` }).transform((v, ctx) => {
    const n = parseRupiah(v);
    if (n === null) {
      ctx.addIssue({ code: "custom", message: `${label} wajib diisi` });
      return z.NEVER;
    }
    return n;
  });

export const optionalMoney = z
  .string()
  .optional()
  .transform((v) => (v ? (parseRupiah(v) ?? 0) : 0));

export const optionalText = z
  .preprocess(empty, z.string().trim().max(2000).optional())
  .transform((v) => v ?? null);

export const requiredText = (label: string, max = 200) =>
  z
    .string({ error: `${label} wajib diisi` })
    .trim()
    .min(1, `${label} wajib diisi`)
    .max(max, `${label} terlalu panjang`);

export const isoDate = (label: string) =>
  z.string({ error: `${label} wajib diisi` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${label} tidak valid`);

export const optionalIsoDate = z
  .preprocess(
    empty,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid")
      .optional(),
  )
  .transform((v) => v ?? null);

export const intInRange = (label: string, min: number, max: number) =>
  z.coerce
    .number({ error: `${label} wajib diisi` })
    .int(`${label} harus bilangan bulat`)
    .min(min, `${label} minimal ${min}`)
    .max(max, `${label} maksimal ${max}`);

export const phone = (label: string) =>
  z.string({ error: `${label} wajib diisi` }).transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) {
      ctx.addIssue({ code: "custom", message: `${label} tidak valid. Contoh: 0812 3456 7890` });
      return z.NEVER;
    }
    return p;
  });

export const optionalPhone = z.preprocess(empty, z.string().optional()).transform((v, ctx) => {
  if (!v) return null;
  const p = normalizePhone(v);
  if (!p) {
    ctx.addIssue({ code: "custom", message: "Nomor HP tidak valid" });
    return z.NEVER;
  }
  return p;
});

export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const optionalEmail = z
  .preprocess(empty, z.email("Format email tidak valid").optional())
  .transform((v) => v ?? null);
