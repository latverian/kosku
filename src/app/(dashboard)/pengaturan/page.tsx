import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { asUser } from "@/db";
import { requireContext } from "@/server/actions";
import { getProperty, getSettings } from "@/services/properties";
import { PropertyForm, SettingsForm } from "./forms";

export const metadata: Metadata = { title: "Pengaturan" };

export default async function SettingsPage({ searchParams }: PageProps<"/pengaturan">) {
  const { baru } = await searchParams;
  const { user, property } = await requireContext();
  const { detail, settings } = await asUser(user.id, async (tx) => ({
    detail: await getProperty(tx, property.id),
    settings: await getSettings(tx, property.id),
  }));
  const isNew = baru === "1";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold lg:text-2xl">Pengaturan</h1>

      {isNew && (
        <Card className="border-primary/40 bg-accent/40 p-4 text-sm">
          <p className="font-medium">Kos berhasil dibuat 🎉</p>
          <p className="text-muted-foreground">
            Langkah 2: isi rekening bank di bawah. Langkah 3:{" "}
            <Link href="/kamar/baru" className="font-medium text-primary hover:underline">
              tambah kamar
            </Link>
            .
          </p>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Rekening, tagihan & denda</CardTitle>
          <CardDescription>Aturan yang dipakai saat tagihan dibuat otomatis.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm settings={settings} highlightBank={isNew} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data kos</CardTitle>
        </CardHeader>
        <CardContent>
          <PropertyForm property={detail} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Segera hadir</CardTitle>
          <CardDescription>
            Jadwal pengingat & koneksi WhatsApp (Fase 2), kelola tim pengelola (Fase 3).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Kembali ke dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
