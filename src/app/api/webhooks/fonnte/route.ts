import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/db";
import { mapProviderStatus } from "@/lib/messaging/provider-status";
import { updateDeliveryStatus } from "@/services/messaging";

/**
 * Webhook status pesan Fonnte (Device → Webhook update status), URL:
 *   https://DOMAIN/api/webhooks/fonnte?secret=<FONNTE_WEBHOOK_SECRET>
 * Format body Fonnte bisa JSON atau form; field yang dibaca: id & status/state.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.FONNTE_WEBHOOK_SECRET;
  const given = request.nextUrl.searchParams.get("secret") ?? "";
  if (
    !secret ||
    given.length !== secret.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(secret))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown> = {};
  const type = request.headers.get("content-type") ?? "";
  try {
    body = type.includes("json") ? await request.json() : Object.fromEntries(await request.formData());
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }
  const id = String(body.id ?? body.message_id ?? "");
  const status = mapProviderStatus(body.status ?? body.state ?? body.message_status);
  if (!id || !status) return NextResponse.json({ ok: true, updated: false });
  const updated = await updateDeliveryStatus(adminDb(), id, status);
  return NextResponse.json({ ok: true, updated });
}
