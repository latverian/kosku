import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/server/auth";
import { getActiveProperty } from "@/server/dashboard";
import { CreatePropertyForm } from "./property-form";

export const metadata: Metadata = { title: "Buat kos" };

export default async function StartPage({ searchParams }: PageProps<"/mulai">) {
  const { baru } = await searchParams;
  const user = await getCurrentUser();
  const existing = await getActiveProperty(user.id);
  if (existing && baru !== "1") redirect("/");

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle className="text-xl">
          {existing ? "Tambah kos baru" : "Selamat datang di Kosku 👋"}
        </CardTitle>
        <CardDescription>
          Langkah 1 dari 3: isi data kos kamu. Setelah ini, tambah rekening bank lalu kamar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CreatePropertyForm />
      </CardContent>
    </Card>
  );
}
