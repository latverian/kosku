import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireContext } from "@/server/actions";
import { CreateRoomsForm } from "../room-form";

export const metadata: Metadata = { title: "Tambah kamar" };

export default async function NewRoomPage() {
  await requireContext();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/kamar" className="text-sm text-muted-foreground hover:underline">
        ← Kamar
      </Link>
      <PageHeader title="Tambah kamar" description="Tambah satu kamar, atau satu lantai sekaligus." />
      <Card>
        <CardContent className="pt-4">
          <CreateRoomsForm />
        </CardContent>
      </Card>
    </div>
  );
}
