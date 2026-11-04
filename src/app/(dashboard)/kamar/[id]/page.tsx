import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Detail Kamar" };

export default function Page() {
  return (
    <ComingSoon
      title="Detail Kamar"
      phase={1}
      features={[
        "Penghuni saat ini dan riwayat penghuni",
        "Tagihan & pembayaran kamar ini",
        "Komplain terkait kamar",
      ]}
    />
  );
}
