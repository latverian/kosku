/**
 * Pembuat koneksi Drizzle. Tidak memakai "server-only" agar bisa dipakai
 * skrip seed & tes. Kode aplikasi memakai src/db/index.ts.
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb(url: string) {
  const client = postgres(url, {
    // Wajib untuk pooler Supabase (mode transaction, port 6543).
    prepare: false,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
  });
  return { db: drizzle(client, { schema }), client };
}

export type Db = ReturnType<typeof createDb>["db"];
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Jalankan query sebagai user tertentu sehingga Row Level Security berlaku,
 * sama seperti request lewat Supabase API. Gunakan ini untuk SEMUA request
 * dari pemilik/pengelola. Koneksi admin (tanpa RLS) hanya untuk cron,
 * webhook, dan portal penghuni yang sudah memvalidasi token.
 */
export async function withUser<T>(db: Db, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const claims = JSON.stringify({ sub: userId, role: "authenticated" });
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${claims}, true), set_config('request.jwt.claim.sub', ${userId}, true)`,
    );
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}
