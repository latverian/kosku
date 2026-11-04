import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Pengaturan" };

export default function Page() {
  return (
    <ComingSoon
      title="Pengaturan"
      phase={1}
      features={[
        "Data kos & rekening bank",
        "Aturan tagihan, denda, dan jadwal pengingat",
        "Hubungkan WhatsApp & kelola tim",
      ]}
    />
  );
}
