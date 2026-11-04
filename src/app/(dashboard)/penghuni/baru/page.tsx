import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { asUser } from "@/db";
import { todayIn } from "@/lib/billing";
import { requireContext } from "@/server/actions";
import { getSettings } from "@/services/properties";
import { listAvailableRooms } from "@/services/tenants";
import { CheckInWizard } from "./check-in-wizard";

export const metadata: Metadata = { title: "Check-in penghuni" };

export default async function CheckInPage({ searchParams }: PageProps<"/penghuni/baru">) {
  const { kamar } = await searchParams;
  const { user, property } = await requireContext();
  const { rooms, settings } = await asUser(user.id, async (tx) => ({
    rooms: await listAvailableRooms(tx, property.id),
    settings: await getSettings(tx, property.id),
  }));
  const preselected = typeof kamar === "string" && rooms.some((r) => r.id === kamar) ? kamar : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/penghuni" className="text-sm text-muted-foreground hover:underline">
        ← Penghuni
      </Link>
      <PageHeader title="Check-in penghuni" />
      {rooms.length === 0 ? (
        <Card className="p-6 text-sm">
          Tidak ada kamar yang bisa ditempati.{" "}
          <Link href="/kamar/baru" className="font-medium text-primary hover:underline">
            Tambah kamar
          </Link>{" "}
          atau ubah status kamar perbaikan.
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <CheckInWizard
              rooms={rooms}
              preselectedRoomId={preselected}
              today={todayIn(property.timezone)}
              settings={{
                prorateFirstMonth: settings.prorateFirstMonth,
                invoiceLeadDays: settings.invoiceLeadDays,
              }}
              nikEnabled={Boolean(process.env.NIK_ENCRYPTION_KEY)}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
