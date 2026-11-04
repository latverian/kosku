import type { Metadata } from "next";
import Link from "next/link";
import { GenerateNowButton } from "@/components/billing-forms";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { asUser } from "@/db";
import { displayStatus, periodOf, todayIn } from "@/lib/billing";
import { formatDate, formatPeriod, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireContext } from "@/server/actions";
import { listInvoices, type InvoiceFilter } from "@/services/billing";

export const metadata: Metadata = { title: "Tagihan" };

const TABS: { value: NonNullable<InvoiceFilter["status"]>; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "open", label: "Belum lunas" },
  { value: "overdue", label: "Terlambat" },
  { value: "paid", label: "Lunas" },
  { value: "void", label: "Dibatalkan" },
];

export default async function InvoicesPage({ searchParams }: PageProps<"/tagihan">) {
  const sp = await searchParams;
  const { user, property } = await requireContext();
  const today = todayIn(property.timezone);
  const status = TABS.some((t) => t.value === sp.status) ? (sp.status as InvoiceFilter["status"]) : "all";
  // Terlambat & belum lunas: semua periode. Lainnya: per bulan (default bulan ini).
  const month = typeof sp.bulan === "string" && /^\d{4}-\d{2}$/.test(sp.bulan) ? sp.bulan : today.slice(0, 7);
  const allPeriods = status === "overdue" || status === "open";
  const period = allPeriods ? undefined : `${month}-01`;

  const rows = await asUser(user.id, (tx) => listInvoices(tx, property.id, today, { status, period }));
  const active = rows.filter((r) => r.status !== "void");
  const billed = active.reduce((s, r) => s + r.total, 0);
  const paid = active.reduce((s, r) => s + Math.min(r.paidAmount, r.total), 0);

  const href = (next: { status?: string; bulan?: string }) => {
    const params = new URLSearchParams();
    const st = next.status ?? status;
    if (st && st !== "all") params.set("status", st);
    const b = next.bulan ?? month;
    if (b !== today.slice(0, 7)) params.set("bulan", b);
    const q = params.toString();
    return q ? `/tagihan?${q}` : "/tagihan";
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tagihan"
        description={allPeriods ? "Semua periode" : formatPeriod(period ?? periodOf(today))}
        actions={<GenerateNowButton />}
      />

      <div className="flex flex-wrap items-center gap-2">
        <nav
          aria-label="Status tagihan"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0"
        >
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={href({ status: t.value })}
              aria-current={status === t.value ? "page" : undefined}
              className={cn(
                "inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm",
                status === t.value
                  ? "border-primary bg-accent text-accent-foreground"
                  : "bg-card text-muted-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        {!allPeriods && (
          <form className="flex items-center gap-2">
            {status !== "all" && <input type="hidden" name="status" value={status} />}
            <Input type="month" name="bulan" defaultValue={month} aria-label="Bulan" className="h-9 w-auto" />
            <button type="submit" className="h-9 rounded-lg border bg-card px-3 text-sm">
              Tampilkan
            </button>
          </form>
        )}
      </div>

      {rows.length > 0 && (
        <p className="text-sm text-muted-foreground tabular">
          {active.length} tagihan · ditagihkan {formatRupiah(billed)} · diterima {formatRupiah(paid)} · sisa{" "}
          {formatRupiah(billed - paid)}
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState>Tidak ada tagihan untuk filter ini.</EmptyState>
      ) : (
        <Card className="divide-y overflow-hidden p-0">
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/tagihan/${r.id}`}
              className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted/60"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-muted text-sm font-semibold tabular">
                {r.roomCode}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.tenantName}</span>
                <span className="block truncate text-xs text-muted-foreground tabular">
                  {formatPeriod(r.period)} · jatuh tempo {formatDate(r.dueDate)}
                </span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <span className="text-sm font-medium tabular">{formatRupiah(r.total)}</span>
                <StatusBadge status={displayStatus({ ...r, hasPendingPayment: r.hasPending }, today)} />
              </span>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
