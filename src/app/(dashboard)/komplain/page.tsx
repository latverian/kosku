import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Komplain" };

export default function Page() {
  return (
    <ComingSoon
      title="Komplain"
      phase={2}
      features={[
        "Kanban komplain: Baru → Diproses → Selesai",
        "Foto, prioritas, penugasan teknisi, komentar",
        "Notifikasi WA ke pemilik & penghuni",
      ]}
    />
  );
}
