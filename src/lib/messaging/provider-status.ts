/** Status pengiriman dari webhook penyedia WA → status di tabel messages. */
export type DeliveryStatus = "sent" | "delivered" | "read" | "failed";

const ORDER: Record<string, number> = { queued: 0, sending: 1, sent: 2, delivered: 3, read: 4 };

export function mapProviderStatus(value: unknown): DeliveryStatus | null {
  const v = String(value ?? "")
    .toLowerCase()
    .trim();
  if (["sent", "terkirim", "success"].includes(v)) return "sent";
  if (["delivered", "diterima"].includes(v)) return "delivered";
  if (["read", "dibaca", "seen"].includes(v)) return "read";
  if (["failed", "gagal", "invalid", "error"].includes(v)) return "failed";
  return null;
}

/** Status hanya boleh maju (dibaca tidak mundur jadi terkirim). */
export function shouldAdvance(current: string, next: DeliveryStatus): boolean {
  if (next === "failed") return current === "sent" || current === "sending";
  return (ORDER[next] ?? 0) > (ORDER[current] ?? -1);
}
