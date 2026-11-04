/**
 * Job terjadwal (specs/05-architecture.md § 2). Dijalankan dengan koneksi
 * admin (tanpa RLS) per properti & per langkah, masing-masing dalam
 * transaksinya sendiri agar kegagalan satu kos/langkah tidak menggagalkan
 * yang lain. Setiap eksekusi dicatat di job_runs.
 */
import { eq, isNull } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { jobRuns, properties } from "@/db/schema";
import { todayIn, type IsoDate } from "@/lib/billing";
import { applyLateFees, generateInvoicesForProperty } from "./billing";
import { SYSTEM } from "./core";
import { configFromEnv, scheduleReminders, sendQueued, type MessagingConfig } from "./messaging";
import type { WhatsAppProvider } from "./whatsapp";

export type JobName = "generate_invoices" | "apply_late_fees" | "schedule_reminders" | "send_messages";
export type JobResult = {
  propertyId: string | null;
  code: string;
  job: JobName;
  status: "success" | "failed";
  processed: number;
  error?: string;
};

async function track(
  db: Db,
  job: JobName,
  property: { id: string | null; code: string },
  fn: () => Promise<number>,
): Promise<JobResult> {
  const [run] = await db
    .insert(jobRuns)
    .values({ job, propertyId: property.id })
    .returning({ id: jobRuns.id });
  try {
    const processed = await fn();
    await db
      .update(jobRuns)
      .set({ status: "success", processed, finishedAt: new Date() })
      .where(eq(jobRuns.id, run.id));
    return { propertyId: property.id, code: property.code, job, status: "success", processed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(jobRuns)
      .set({ status: "failed", error: message.slice(0, 2000), finishedAt: new Date() })
      .where(eq(jobRuns.id, run.id));
    return {
      propertyId: property.id,
      code: property.code,
      job,
      status: "failed",
      processed: 0,
      error: message,
    };
  }
}

async function activeProperties(db: Db) {
  return db
    .select({ id: properties.id, code: properties.code, timezone: properties.timezone })
    .from(properties)
    .where(isNull(properties.archivedAt));
}

const STEPS: {
  job: Exclude<JobName, "send_messages">;
  run: (tx: Tx, propertyId: string, today: IsoDate, now: Date, cfg: MessagingConfig) => Promise<number>;
}[] = [
  { job: "generate_invoices", run: (tx, id, today) => generateInvoicesForProperty(tx, SYSTEM, id, today) },
  { job: "apply_late_fees", run: (tx, id, today) => applyLateFees(tx, SYSTEM, id, today) },
  { job: "schedule_reminders", run: (tx, id, _today, now, cfg) => scheduleReminders(tx, id, now, cfg) },
];

/** Job pagi: buat tagihan → denda → jadwalkan pengingat, untuk semua kos. */
export async function runDaily(
  db: Db,
  opts: { now?: Date; only?: Exclude<JobName, "send_messages">[]; cfg?: MessagingConfig } = {},
): Promise<JobResult[]> {
  const now = opts.now ?? new Date();
  const cfg = opts.cfg ?? configFromEnv();
  const results: JobResult[] = [];
  for (const property of await activeProperties(db)) {
    const today = todayIn(property.timezone, now);
    for (const step of STEPS) {
      if (opts.only && !opts.only.includes(step.job)) continue;
      results.push(
        await track(db, step.job, property, () =>
          db.transaction((tx) => step.run(tx, property.id, today, now, cfg)),
        ),
      );
    }
  }
  return results;
}

/** Dipertahankan untuk endpoint lama /api/cron/generate-invoices. */
export function runGenerateInvoices(db: Db, opts: { now?: Date } = {}) {
  return runDaily(db, { ...opts, only: ["generate_invoices"] });
}

/** Kirim pesan yang sudah waktunya (semua kos). */
export async function runSendMessages(
  db: Db,
  provider: WhatsAppProvider,
  opts: Parameters<typeof sendQueued>[2] = {},
) {
  let summary = { sent: 0, failed: 0, retried: 0, skipped: 0 };
  const result = await track(db, "send_messages", { id: null, code: "*" }, async () => {
    summary = await sendQueued(db, provider, opts);
    return summary.sent;
  });
  return { ...result, ...summary };
}
