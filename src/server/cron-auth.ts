import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Endpoint cron hanya boleh dipanggil dengan header
 * `Authorization: Bearer <CRON_SECRET>` (Vercel Cron mengirimnya otomatis).
 */
export function cronAuthorized(
  request: Request,
): { ok: true } | { ok: false; status: number; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 500, error: "CRON_SECRET belum diatur" };
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}
