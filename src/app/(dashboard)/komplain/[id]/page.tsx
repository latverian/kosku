import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Detail Komplain" };

export default function Page() {
  return (
    <ComingSoon
      title="Detail Komplain"
      phase={2}
      features={["Foto & deskripsi masalah", "Riwayat status dan komentar", "Biaya perbaikan → pengeluaran"]}
    />
  );
}
