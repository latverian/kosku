import { NextResponse } from "next/server";
import { adminDb } from "@/db";
import { cronAuthorized } from "@/server/cron-auth";
import { runSendMessages } from "@/services/jobs";
import { providerFromEnv } from "@/services/whatsapp";

export const maxDuration = 60;

/**
 * Kirim antrian WA. Vercel Cron (harian 08.05 WIB) sebagai cadangan; untuk
 * pengiriman tiap 5 menit jadwalkan endpoint ini dengan pg_cron (lihat README).
 */
async function handle(request: Request) {
  const auth = cronAuthorized(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const result = await runSendMessages(adminDb(), providerFromEnv(), { limit: 20, deadlineMs: 45_000 });
  return NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
}

export const GET = handle;
export const POST = handle;
