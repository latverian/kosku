import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Keuangan" };

export default function Page() {
  return (
    <ComingSoon
      title="Keuangan"
      phase={3}
      features={[
        "Pencatatan pengeluaran + foto nota",
        "Laporan laba-rugi bulanan & tahunan",
        "Ekspor Excel dan PDF",
      ]}
    />
  );
}
