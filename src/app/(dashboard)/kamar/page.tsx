import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Kamar" };

export default function Page() {
  return (
    <ComingSoon
      title="Kamar"
      phase={1}
      features={[
        "Daftar & kisi kamar dengan filter status, tipe, lantai",
        "Tambah kamar satu per satu atau massal",
        "Ubah harga, fasilitas, foto, dan status perbaikan",
      ]}
    />
  );
}
