import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Penghuni" };

export default function Page() {
  return (
    <ComingSoon
      title="Penghuni"
      phase={1}
      features={[
        "Daftar penghuni aktif & alumni",
        "Check-in (wizard 3 langkah), check-out, pindah kamar",
        "Profil, kontak darurat, foto KTP (tersimpan privat)",
      ]}
    />
  );
}
