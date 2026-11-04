import { sql } from "drizzle-orm";
import { createDb } from "@/db/client";
import * as s from "@/db/schema";

export function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL wajib untuk tes database");
  return createDb(url);
}

export async function createAuthUser(db: ReturnType<typeof connect>["db"], email: string) {
  const rows = await db.execute<{ id: string }>(
    sql`insert into auth.users (email, raw_user_meta_data) values (${email}, ${JSON.stringify({ full_name: email })}::jsonb) returning id`,
  );
  return rows[0].id;
}

export function uniqueCode() {
  // kode properti 2–5 huruf/angka kapital, unik per tes
  return "T" + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export { s };
