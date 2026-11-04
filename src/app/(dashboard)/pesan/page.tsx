import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Pesan WA" };

export default function Page() {
  return (
    <ComingSoon
      title="Pesan WA"
      phase={2}
      features={[
        "Pengingat otomatis H-3, H, H+1, H+3, H+7",
        "Log pesan, kirim ulang pesan gagal",
        "Edit template & broadcast pengumuman",
      ]}
    />
  );
}
