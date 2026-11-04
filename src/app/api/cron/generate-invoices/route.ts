import { NextResponse } from "next/server";
import { adminDb } from "@/db";
import { cronAuthorized } from "@/server/cron-auth";
import { runGenerateInvoices } from "@/services/jobs";

// Batas waktu fungsi (detik). Vercel Hobby maksimum 60.
export const maxDuration = 60;

async function handle(request: Request) {
  const auth = cronAuthorized(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Tetap ada untuk kompatibilitas; jadwal utama sekarang /api/cron/daily.
  const results = await runGenerateInvoices(adminDb());
  const failed = results.filter((r) => r.status === "failed");
  return NextResponse.json(
    {
      ok: failed.length === 0,
      created: results.reduce((s, r) => s + r.processed, 0),
      properties: results.map(({ code, status, processed, error }) => ({ code, status, processed, error })),
    },
    { status: failed.length ? 500 : 200 },
  );
}

// Vercel Cron memanggil GET; POST untuk pemanggilan manual / pg_cron.
export const GET = handle;
export const POST = handle;
