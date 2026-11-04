import { Download, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FinanceChart } from "@/components/finance-chart";
import { EmptyState, PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { asUser } from "@/db";
import { periodOf, todayIn } from "@/lib/billing";
import { AGING_LABEL, EXPENSE_CATEGORIES, periodFromMonthParam, type AgingBucket } from "@/lib/finance";
import { formatDate, formatPeriod, formatRupiah } from "@/lib/format";
import { PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { requireContext } from "@/server/actions";
import { getMembership } from "@/server/membership";
import { signedUrl } from "@/server/uploads";
import { agingReport, listExpenses, monthlyReport, monthlySeries } from "@/services/finance";
import { DeleteExpenseButton, ExpenseForm } from "./forms";

export const metadata: Metadata = { title: "Keuangan" };

const TABS = [
  { value: "ringkasan", label: "Ringkasan" },
  { value: "pengeluaran", label: "Pengeluaran" },
  { value: "tunggakan", label: "Tunggakan" },
] as const;

const SHORT_MONTH = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" });

export default async function FinancePage({ searchParams }: PageProps<"/keuangan">) {
  const sp = await searchParams;
  const { user, property } = await requireContext();
  const membership = await getMembership(user, property.id);
  if (!membership.canViewFinance && !user.preview) {
    return (
      <div className="space-y-4">
        <PageHeader title="Keuangan" />
        <EmptyState>Halaman ini hanya untuk pemilik atau pengelola dengan izin keuangan.</EmptyState>
      </div>
    );
  }

  const today = todayIn(property.timezone);
  const period = periodFromMonthParam(sp.bulan) ?? periodOf(today);
  const tab = TABS.find((t) => t.value === sp.tab)?.value ?? "ringkasan";
  const month = period.slice(0, 7);
  const qs = (next: Record<string, string>) => {
    const params = new URLSearchParams({
      ...(tab !== "ringkasan" ? { tab } : {}),
      ...(month !== today.slice(0, 7) ? { bulan: month } : {}),
      ...next,
    });
    for (const [k, v] of [...params]) if (!v) params.delete(k);
    const q = params.toString();
    return q ? `/keuangan?${q}` : "/keuangan";
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Keuangan"
        description={tab === "tunggakan" ? "Per hari ini" : formatPeriod(period)}
        actions={
          tab !== "tunggakan" && (
            <form className="flex items-center gap-2">
              {tab !== "ringkasan" && <input type="hidden" name="tab" value={tab} />}
              <Input
                type="month"
                name="bulan"
                defaultValue={month}
                aria-label="Bulan"
                className="h-9 w-auto"
              />
              <button type="submit" className="h-9 rounded-lg border bg-card px-3 text-sm">
                Tampilkan
              </button>
            </form>
          )
        }
      />
      <nav aria-label="Bagian" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={qs({ tab: t.value === "ringkasan" ? "" : t.value })}
            aria-current={tab === t.value ? "page" : undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm",
              tab === t.value
                ? "border-primary bg-accent text-accent-foreground"
                : "bg-card text-muted-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "ringkasan" && (
        <Summary userId={user.id} propertyId={property.id} period={period} month={month} />
      )}
      {tab === "pengeluaran" && (
        <Expenses userId={user.id} propertyId={property.id} period={period} today={today} />
      )}
      {tab === "tunggakan" && <Aging userId={user.id} propertyId={property.id} today={today} />}
    </div>
  );
}

async function Summary({
  userId,
  propertyId,
  period,
  month,
}: {
  userId: string;
  propertyId: string;
  period: string;
  month: string;
}) {
  const { report, series } = await asUser(userId, async (tx) => ({
    report: await monthlyReport(tx, propertyId, period),
    series: await monthlySeries(tx, propertyId, period, 12),
  }));
  const chart = series.map((m) => ({
    label: SHORT_MONTH.format(new Date(`${m.period}T00:00:00Z`)),
    income: m.income,
    expenses: m.expenses,
  }));

  return (
    <>
      <section aria-label="Ringkasan bulan" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pemasukan (kas)" value={formatRupiah(report.income)} />
        <Stat label="Pengeluaran" value={formatRupiah(report.expenses)} />
        <Stat
          label="Laba bersih"
          value={formatRupiah(report.net)}
          tone={report.net < 0 ? "text-status-overdue" : "text-status-paid"}
        />
        <Stat
          label="Tagihan periode ini"
          value={`${formatRupiah(report.billedPaid)}`}
          hint={`dibayar dari ${formatRupiah(report.billed)} (${report.invoices} tagihan)`}
        />
      </section>

      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/reports/monthly?bulan=${month}&format=xlsx`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Download aria-hidden /> Excel bulan ini
        </a>
        <a
          href={`/api/reports/monthly?bulan=${month}&format=pdf`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Download aria-hidden /> PDF bulan ini
        </a>
        <a
          href={`/api/reports/yearly?akhir=${month}&format=xlsx`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Download aria-hidden /> Excel 12 bulan
        </a>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pemasukan per metode</CardTitle>
          </CardHeader>
          <CardContent>
            {report.incomeByMethod.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada pembayaran bulan ini.</p>
            ) : (
              <BreakdownTable
                rows={report.incomeByMethod.map((m) => ({
                  label: `${PAYMENT_METHOD_LABEL[m.method as keyof typeof PAYMENT_METHOD_LABEL] ?? m.method} (${m.count}×)`,
                  amount: m.amount,
                }))}
                total={report.income}
              />
            )}
            {report.creditApplied > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                + {formatRupiah(report.creditApplied)} dipotong dari saldo kelebihan bayar (tidak dihitung
                sebagai pemasukan baru).
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pengeluaran per kategori</CardTitle>
          </CardHeader>
          <CardContent>
            {report.expensesByCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada pengeluaran.{" "}
                <Link
                  href={`/keuangan?tab=pengeluaran&bulan=${month}`}
                  className="text-primary hover:underline"
                >
                  Catat pengeluaran
                </Link>
              </p>
            ) : (
              <BreakdownTable
                rows={report.expensesByCategory.map((c) => ({
                  label: EXPENSE_CATEGORIES[c.category as keyof typeof EXPENSE_CATEGORIES] ?? c.category,
                  amount: c.amount,
                }))}
                total={report.expenses}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>12 bulan terakhir</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FinanceChart data={chart} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm tabular">
              <caption className="sr-only">Pemasukan, pengeluaran, laba, dan penagihan per bulan</caption>
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 font-medium">Bulan</th>
                  <th className="py-2 text-right font-medium">Pemasukan</th>
                  <th className="py-2 text-right font-medium">Pengeluaran</th>
                  <th className="py-2 text-right font-medium">Laba</th>
                  <th className="py-2 text-right font-medium">Ditagihkan</th>
                  <th className="py-2 text-right font-medium">Terbayar</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[...series].reverse().map((m) => (
                  <tr key={m.period}>
                    <td className="py-2">{formatPeriod(m.period)}</td>
                    <td className="py-2 text-right">{formatRupiah(m.income)}</td>
                    <td className="py-2 text-right">{formatRupiah(m.expenses)}</td>
                    <td className={cn("py-2 text-right", m.net < 0 && "text-status-overdue")}>
                      {formatRupiah(m.net)}
                    </td>
                    <td className="py-2 text-right">{formatRupiah(m.billed)}</td>
                    <td className="py-2 text-right">{formatRupiah(m.billedPaid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

async function Expenses({
  userId,
  propertyId,
  period,
  today,
}: {
  userId: string;
  propertyId: string;
  period: string;
  today: string;
}) {
  const rows = await asUser(userId, (tx) => listExpenses(tx, propertyId, period));
  const receipts = new Map(
    await Promise.all(
      rows
        .filter((r) => r.receiptPath)
        .map(async (r) => [r.id, await signedUrl("receipts", r.receiptPath)] as const),
    ),
  );
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="self-start">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Daftar pengeluaran</CardTitle>
          <span className="text-sm font-medium tabular">{formatRupiah(total)}</span>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {rows.length === 0 ? (
            <p className="px-4 pb-2 text-sm text-muted-foreground">Belum ada pengeluaran bulan ini.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {r.description ?? EXPENSE_CATEGORIES[r.category as keyof typeof EXPENSE_CATEGORIES]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {EXPENSE_CATEGORIES[r.category as keyof typeof EXPENSE_CATEGORIES] ?? r.category} ·{" "}
                      {formatDate(r.spentOn)}
                      {r.complaintId ? " · dari komplain" : ""}
                    </span>
                    {receipts.get(r.id) && (
                      <a
                        href={receipts.get(r.id)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-primary hover:underline"
                      >
                        Lihat nota
                      </a>
                    )}
                  </span>
                  <span className="tabular">{formatRupiah(r.amount)}</span>
                  <DeleteExpenseButton expenseId={r.id} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card className="self-start">
        <CardHeader>
          <CardTitle>Catat pengeluaran</CardTitle>
        </CardHeader>
        <CardContent>
          <ExpenseForm today={today} />
        </CardContent>
      </Card>
    </div>
  );
}

const BUCKETS: AgingBucket[] = ["d30plus", "d8_30", "d1_7", "current"];

async function Aging({ userId, propertyId, today }: { userId: string; propertyId: string; today: string }) {
  const aging = await asUser(userId, (tx) => agingReport(tx, propertyId, today));
  return (
    <>
      <section aria-label="Total tunggakan" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {BUCKETS.map((b) => (
          <Stat
            key={b}
            label={AGING_LABEL[b]}
            value={formatRupiah(aging.totals[b])}
            tone={b === "d30plus" && aging.totals[b] > 0 ? "text-status-overdue" : undefined}
          />
        ))}
      </section>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- unduhan file dari route handler, bukan navigasi halaman */}
      <a href="/api/reports/aging?format=xlsx" className={buttonVariants({ variant: "outline", size: "sm" })}>
        <Download aria-hidden /> Excel tunggakan
      </a>
      {aging.rows.length === 0 ? (
        <EmptyState>Tidak ada tagihan yang belum lunas. 🎉</EmptyState>
      ) : (
        BUCKETS.filter((b) => aging.rows.some((r) => r.bucket === b)).map((b) => (
          <section key={b} className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">{AGING_LABEL[b]}</h2>
            <Card className="divide-y overflow-hidden p-0">
              {aging.rows
                .filter((r) => r.bucket === b)
                .map((r) => (
                  <div key={r.invoiceId} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted font-semibold tabular">
                      {r.roomCode}
                    </span>
                    <Link href={`/tagihan/${r.invoiceId}`} className="min-w-0 flex-1 hover:underline">
                      <span className="block truncate font-medium">{r.tenantName}</span>
                      <span className="text-xs text-muted-foreground">
                        Jatuh tempo {formatDate(r.dueDate)}
                      </span>
                    </Link>
                    <span className="font-medium tabular">{formatRupiah(r.remaining)}</span>
                    <a
                      href={`https://wa.me/${r.phone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`WhatsApp ${r.tenantName}`}
                      className="grid size-9 place-items-center rounded-lg hover:bg-muted"
                    >
                      <MessageCircle className="size-4" aria-hidden />
                    </a>
                  </div>
                ))}
            </Card>
          </section>
        ))
      )}
    </>
  );
}

function BreakdownTable({ rows, total }: { rows: { label: string; amount: number }[]; total: number }) {
  return (
    <table className="w-full text-sm tabular">
      <tbody className="divide-y">
        {rows.map((r) => (
          <tr key={r.label}>
            <td className="py-2">{r.label}</td>
            <td className="py-2 text-right">{formatRupiah(r.amount)}</td>
            <td className="w-14 py-2 text-right text-xs text-muted-foreground">
              {total ? Math.round((r.amount / total) * 100) : 0}%
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot className="border-t-2 font-medium">
        <tr>
          <td className="py-2">Total</td>
          <td className="py-2 text-right">{formatRupiah(total)}</td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold tabular lg:text-xl", tone)}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
