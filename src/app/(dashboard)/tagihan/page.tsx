import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Tagihan" };

export default function Page() {
  return (
    <ComingSoon
      title="Tagihan"
      phase={1}
      features={[
        "Tagihan bulanan dibuat otomatis",
        "Tambah item (listrik, laundry), koreksi, batalkan",
        "Unduh tagihan sebagai PDF",
      ]}
    />
  );
}
