import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Pembayaran" };

export default function Page() {
  return (
    <ComingSoon
      title="Pembayaran"
      phase={1}
      features={[
        "Catat pembayaran tunai/transfer",
        "Verifikasi atau tolak bukti transfer dari penghuni",
        "Saldo kelebihan bayar otomatis dipakai bulan berikutnya",
      ]}
    />
  );
}
