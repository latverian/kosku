/**
 * Job terjadwal (specs/05-architecture.md § 2). Dijalankan dengan koneksi
 * admin (tanpa RLS) per properti, masing-masing dalam transaksinya sendiri
 * agar kegagalan satu kos tidak menggagalkan yang lain.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { jobRuns, properties } from "@/db/schema";
import { todayIn, type IsoDate } from "@/lib/billing";
import { generateInvoicesForProperty } from "./billing";
import { SYSTEM } from "./core";

export type JobResult = {
  propertyId: string;
  code: string;
  status: "success" | "failed";
  processed: number;
  error?: string;
};

export async function runGenerateInvoices(db: Db, opts: { now?: Date } = {}): Promise<JobResult[]> {
  const list = await db
    .select({ id: properties.id, code: properties.code, timezone: properties.timezone })
    .from(properties)
    .where(isNull(properties.archivedAt));

  const results: JobResult[] = [];
  for (const property of list) {
    const today: IsoDate = todayIn(property.timezone, opts.now);
    const [run] = await db
      .insert(jobRuns)
      .values({ job: "generate_invoices", propertyId: property.id })
      .returning({ id: jobRuns.id });
    try {
      const processed = await db.transaction((tx) =>
        generateInvoicesForProperty(tx, SYSTEM, property.id, today),
      );
      await db
        .update(jobRuns)
        .set({ status: "success", processed, finishedAt: new Date() })
        .where(and(eq(jobRuns.id, run.id)));
      results.push({ propertyId: property.id, code: property.code, status: "success", processed });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .update(jobRuns)
        .set({ status: "failed", error: message.slice(0, 2000), finishedAt: new Date() })
        .where(eq(jobRuns.id, run.id));
      results.push({
        propertyId: property.id,
        code: property.code,
        status: "failed",
        processed: 0,
        error: message,
      });
    }
  }
  return results;
}
