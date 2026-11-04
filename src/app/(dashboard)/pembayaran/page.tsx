import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { VerifyRejectButtons } from "@/components/billing-forms";
import { EmptyState, PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { asUser } from "@/db";
import { formatDate, formatRupiah } from "@/lib/format";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { requireContext } from "@/server/actions";
import { listPayments } from "@/services/billing";

export const metadata: Metadata = { title: "Pembayaran" };

export default async function PaymentsPage({ searchParams }: PageProps<"/pembayaran">) {
  const { tab } = await searchParams;
  const { user, property } = await requireContext();
  const showAll = tab === "semua";
  const [pending, rows] = await asUser(user.id, async (tx) => {
    const p = await listPayments(tx, property.id, "pending");
    return [p, showAll ? await listPayments(tx, property.id) : p] as const;
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pembayaran"
        actions={
          <Link href="/pembayaran/catat" className={buttonVariants()}>
            <Plus aria-hidden /> Catat pembayaran
          </Link>
        }
      />
      <nav aria-label="Jenis" className="inline-grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {[
          ["", `Perlu verifikasi (${pending.length})`],
          ["semua", "Semua"],
        ].map(([value, label]) => {
          const active = (value === "semua") === showAll;
          return (
            <Link
              key={value}
              href={value ? `/pembayaran?tab=${value}` : "/pembayaran"}
              aria-current={active ? "page" : undefined}
              className={cn(
                "grid h-9 place-items-center rounded-md px-3 text-sm font-medium",
                active ? "bg-card shadow-xs" : "text-muted-foreground",
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <EmptyState>
          {showAll ? "Belum ada pembayaran." : "Tidak ada bukti bayar yang perlu diverifikasi. 🎉"}
        </EmptyState>
      ) : (
        <Card className="divide-y overflow-hidden p-0">
          {rows.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-muted text-sm font-semibold tabular">
                {p.roomCode}
              </span>
              <Link href={`/tagihan/${p.invoiceId}`} className="min-w-0 flex-1 hover:underline">
                <span className="block font-medium tabular">
                  {formatRupiah(p.amount)}{" "}
                  <span className="font-normal text-muted-foreground">· {p.tenantName}</span>
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {PAYMENT_METHOD_LABEL[p.method]} · {formatDate(p.paidAt, property.timezone)} · tagihan{" "}
                  {formatRupiah(p.invoiceTotal)}
                  {showAll ? ` · ${PAYMENT_STATUS_LABEL[p.status]}` : ""}
                </span>
              </Link>
              {p.status === "pending" && (
                <div className="basis-full pl-14 sm:basis-auto sm:pl-0">
                  <VerifyRejectButtons paymentId={p.id} />
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
      {!showAll && pending.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Foto bukti transfer dari penghuni tampil di sini mulai Fase 2 (portal penghuni).
        </p>
      )}
    </div>
  );
}
