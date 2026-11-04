import { NextResponse } from "next/server";
import { adminDb } from "@/db";
import { cronAuthorized } from "@/server/cron-auth";
import { runDaily } from "@/services/jobs";

export const maxDuration = 60;

/** 07.00 WIB: buat tagihan → denda → jadwalkan pengingat (dikirim mulai 08.00). */
async function handle(request: Request) {
  const auth = cronAuthorized(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const results = await runDaily(adminDb());
  const failed = results.filter((r) => r.status === "failed");
  return NextResponse.json(
    {
      ok: failed.length === 0,
      results: results.map(({ code, job, status, processed, error }) => ({
        code,
        job,
        status,
        processed,
        error,
      })),
    },
    { status: failed.length ? 500 : 200 },
  );
}

export const GET = handle;
export const POST = handle;
