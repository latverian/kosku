import type { Metadata } from "next";
import Link from "next/link";
import { RecordPaymentForm } from "@/components/billing-forms";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { asUser } from "@/db";
import { todayIn } from "@/lib/billing";
import { requireContext } from "@/server/actions";
import { listOpenInvoices } from "@/services/billing";

export const metadata: Metadata = { title: "Catat pembayaran" };

export default async function RecordPaymentPage() {
  const { user, property } = await requireContext();
  const invoices = await asUser(user.id, (tx) => listOpenInvoices(tx, property.id));
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/pembayaran" className="text-sm text-muted-foreground hover:underline">
        ← Pembayaran
      </Link>
      <PageHeader
        title="Catat pembayaran"
        description="Untuk pembayaran tunai atau transfer yang sudah kamu terima."
      />
      {invoices.length === 0 ? (
        <EmptyState>Tidak ada tagihan yang belum lunas.</EmptyState>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <RecordPaymentForm invoices={invoices} today={todayIn(property.timezone)} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
