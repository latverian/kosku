import "server-only";
import { after } from "next/server";
import { adminDb } from "@/db";
import { sendQueued } from "@/services/messaging";
import { providerFromEnv } from "@/services/whatsapp";

/**
 * Kirim pesan yang baru masuk antrian segera setelah respons dikirim, agar
 * notifikasi (konfirmasi bayar, komplain baru) tidak menunggu cron. Pesan di
 * jam tenang tetap menunggu jadwalnya.
 */
export function dispatchSoon(propertyId: string) {
  after(async () => {
    try {
      await sendQueued(adminDb(), providerFromEnv(), {
        propertyId,
        limit: 5,
        delayMs: 500,
        deadlineMs: 20_000,
      });
    } catch (error) {
      console.error("dispatchSoon gagal", error);
    }
  });
}
