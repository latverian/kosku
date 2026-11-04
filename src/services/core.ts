/**
 * Dasar lapisan service: tipe aktor, error yang aman ditampilkan ke pengguna,
 * dan audit log. Service menerima `tx` (transaksi) sehingga bisa dipakai dari
 * server action (dengan RLS via asUser) maupun cron/tes.
 *
 * File di src/services TIDAK boleh import "server-only" atau next/* agar bisa
 * diuji langsung dengan Vitest.
 */
import type { Tx } from "@/db/client";
import { auditLogs } from "@/db/schema";

export type Actor = { type: "user"; id: string } | { type: "system"; id: null };

export const SYSTEM: Actor = { type: "system", id: null };

/** Error dengan pesan berbahasa Indonesia yang boleh ditampilkan ke pengguna. */
export class ServiceError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

type PgLike = { code?: string; message?: string; constraint_name?: string };

function pgCause(error: unknown): PgLike | null {
  let current: unknown = error;
  for (let i = 0; i < 5 && current; i++) {
    const c = current as PgLike & { cause?: unknown };
    if (typeof c.code === "string" && /^[0-9A-Z]{5}$/.test(c.code)) return c;
    current = c.cause;
  }
  return null;
}

/**
 * Ubah error database menjadi ServiceError yang ramah, atau null jika bukan
 * error yang dikenal (biarkan dilempar sebagai error 500).
 */
export function toServiceError(
  error: unknown,
  uniqueMessages: Record<string, string> = {},
): ServiceError | null {
  if (error instanceof ServiceError) return error;
  const pg = pgCause(error);
  if (!pg) return null;
  switch (pg.code) {
    case "23505":
      return new ServiceError(
        (pg.constraint_name && uniqueMessages[pg.constraint_name]) ?? "Data yang sama sudah ada.",
      );
    case "23514":
    case "P0001":
      // Pesan dari trigger kita sudah berbahasa Indonesia; constraint CHECK biasa tidak.
      return new ServiceError(
        pg.message && !pg.message.startsWith("new row") && !pg.message.includes("violates check constraint")
          ? pg.message
          : "Data tidak valid.",
      );
    case "23503":
      return new ServiceError("Data terkait tidak ditemukan atau masih dipakai.");
    case "42501":
      return new ServiceError("Kamu tidak punya akses untuk melakukan ini.");
    default:
      return null;
  }
}

export async function audit(
  tx: Tx,
  actor: Actor,
  entry: {
    propertyId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
  },
) {
  await tx.insert(auditLogs).values({
    propertyId: entry.propertyId,
    actorType: actor.type,
    actorId: actor.id,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}

/** Ambil baris pertama atau lempar ServiceError "tidak ditemukan". */
export function must<T>(row: T | undefined, what: string): T {
  if (!row) throw new ServiceError(`${what} tidak ditemukan.`);
  return row;
}
