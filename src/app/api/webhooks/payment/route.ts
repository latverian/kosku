import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { adminDb, schema } from "@/db";
import { dispatchSoon } from "@/server/dispatch";
import { gatewayFromEnv, invoiceIdFromOrder } from "@/services/gateway";
import { handleGatewayNotification } from "@/services/online-payment";

/** Notifikasi pembayaran dari Midtrans (Settings → Payment → Notification URL). */
export async function POST(request: Request) {
  const gateway = gatewayFromEnv();
  if (!gateway) return NextResponse.json({ error: "Payment gateway belum dikonfigurasi" }, { status: 503 });
  const body = await request.json().catch(() => null);
  try {
    const result = await handleGatewayNotification(adminDb(), gateway, body);
    if (result === "invalid") return NextResponse.json({ error: "Signature tidak valid" }, { status: 401 });
    if (result === "recorded") {
      const invoiceId = invoiceIdFromOrder(String((body as { order_id?: string }).order_id));
      const [inv] = invoiceId
        ? await adminDb()
            .select({ propertyId: schema.invoices.propertyId })
            .from(schema.invoices)
            .where(eq(schema.invoices.id, invoiceId))
        : [];
      if (inv) dispatchSoon(inv.propertyId);
    }
    // 200 agar Midtrans berhenti mengirim ulang
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("Webhook pembayaran gagal", error);
    // 500 → Midtrans akan mencoba lagi
    return NextResponse.json({ error: "Gagal memproses" }, { status: 500 });
  }
}
