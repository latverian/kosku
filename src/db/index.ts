import "server-only";
import { createDb, withUser, type Db, type Tx } from "./client";

export * as schema from "./schema";
export type { Db, Tx };

const globalForDb = globalThis as unknown as { __kosku_db?: Db };

function getDb(): Db {
  if (!globalForDb.__kosku_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL belum diatur. Lihat .env.example.");
    // Disimpan di globalThis agar hot reload saat development tidak membuat koneksi baru terus.
    globalForDb.__kosku_db = createDb(url).db;
  }
  return globalForDb.__kosku_db;
}

/** Koneksi admin — MELEWATI RLS. Hanya untuk cron, webhook, portal penghuni. */
export function adminDb(): Db {
  return getDb();
}

/** Query sebagai user yang login, RLS berlaku. */
export function asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withUser(getDb(), userId, fn);
}
