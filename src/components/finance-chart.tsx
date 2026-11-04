"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { formatRupiah, formatRupiahShort } from "@/lib/format";

export type ChartRow = { label: string; income: number; expenses: number };

const SERIES = [
  { key: "income", name: "Pemasukan", color: "var(--series-1)" },
  { key: "expenses", name: "Pengeluaran", color: "var(--series-2)" },
] as const;

function ChartTooltip({ active, payload, label }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as ChartRow;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      {SERIES.map((s) => (
        <p key={s.key} className="flex items-center gap-2 tabular">
          <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
          <span className="text-muted-foreground">{s.name}</span>
          <span className="ml-auto pl-3">{formatRupiah(row[s.key])}</span>
        </p>
      ))}
      <p className="mt-1 border-t pt-1 text-muted-foreground tabular">
        Laba{" "}
        <span className="float-right pl-3 text-foreground">{formatRupiah(row.income - row.expenses)}</span>
      </p>
    </div>
  );
}

/**
 * Pemasukan vs pengeluaran per bulan (batang berkelompok, satu sumbu Rp).
 * Spesifikasi mark mengikuti skill dataviz: batang ≤24 px, ujung data
 * membulat 4 px, celah 2 px, grid samar, tooltip per batang, legend selalu ada.
 */
export function FinanceChart({ data }: { data: ChartRow[] }) {
  return (
    <figure className="space-y-2">
      <ul className="flex flex-wrap gap-4 text-sm" aria-label="Keterangan">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="size-3 rounded-sm" style={{ background: s.color }} aria-hidden />
            {s.name}
          </li>
        ))}
      </ul>
      <div
        className="h-64 w-full"
        role="img"
        aria-label="Grafik pemasukan dan pengeluaran 12 bulan terakhir. Angka lengkap ada di tabel di bawah."
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            barGap={2}
            barCategoryGap="20%"
            margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
          >
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              interval="preserveStartEnd"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={64}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickFormatter={(v: number) => formatRupiahShort(Math.round(v))}
            />
            <Tooltip
              content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} />}
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            />
            {SERIES.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                fill={s.color}
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
