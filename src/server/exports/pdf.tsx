import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { addDays } from "@/lib/billing";
import { EXPENSE_CATEGORIES } from "@/lib/finance";
import { formatDate, formatPeriod, formatRupiah } from "@/lib/format";
import { ITEM_TYPE_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/labels";
import type { MonthlyReport } from "@/services/finance";

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111827" },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  muted: { color: "#6b7280" },
  section: { marginTop: 18 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
  },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    fontFamily: "Helvetica-Bold",
  },
  badge: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    fontFamily: "Helvetica-Bold",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#9ca3af",
    textAlign: "center",
  },
});

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={bold ? s.total : s.row}>
      <Text>{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}

export type InvoicePdfData = {
  propertyName: string;
  propertyAddress: string | null;
  number: string;
  period: string;
  dueDate: string;
  coversFrom: string | null;
  coversTo: string | null;
  status: string;
  tenantName: string;
  roomCode: string;
  items: { description: string; type: keyof typeof ITEM_TYPE_LABEL; amount: number }[];
  total: number;
  paidAmount: number;
  payments: { amount: number; method: keyof typeof PAYMENT_METHOD_LABEL; paidAt: Date }[];
  bankAccounts: { bank: string; number: string; holder: string }[];
  timezone: string;
};

/** Tagihan (belum lunas) atau kuitansi (lunas) — FR-3.8, FR-4.7. */
export async function invoicePdf(d: InvoicePdfData) {
  const paid = d.status === "paid";
  const remaining = Math.max(0, d.total - d.paidAmount);
  const doc = (
    <Document title={`${paid ? "Kuitansi" : "Tagihan"} ${d.number}`} author="Kosku">
      <Page size="A5" style={s.page}>
        <Text style={s.h1}>{paid ? "KUITANSI" : "TAGIHAN"}</Text>
        <Text style={s.muted}>{d.number}</Text>
        <View style={s.section}>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>{d.propertyName}</Text>
          {d.propertyAddress && <Text style={s.muted}>{d.propertyAddress}</Text>}
        </View>
        <View style={s.section}>
          <Line label="Penghuni" value={`${d.tenantName} · Kamar ${d.roomCode}`} />
          <Line label="Periode" value={formatPeriod(d.period)} />
          {d.coversFrom && d.coversTo && (
            <Line
              label="Masa sewa"
              value={`${formatDate(d.coversFrom)} – ${formatDate(addDays(d.coversTo, -1))}`}
            />
          )}
          <Line label="Jatuh tempo" value={formatDate(d.dueDate)} />
        </View>
        <View style={s.section}>
          <Text style={s.h2}>Rincian</Text>
          {d.items.map((i, idx) => (
            <Line
              key={idx}
              label={`${i.description} (${ITEM_TYPE_LABEL[i.type]})`}
              value={formatRupiah(i.amount)}
            />
          ))}
          <Line label="Total" value={formatRupiah(d.total)} bold />
          <Line label="Sudah dibayar" value={formatRupiah(d.paidAmount)} />
          <Line label="Sisa" value={formatRupiah(remaining)} bold />
        </View>
        {d.payments.length > 0 && (
          <View style={s.section}>
            <Text style={s.h2}>Pembayaran</Text>
            {d.payments.map((p, idx) => (
              <Line
                key={idx}
                label={`${formatDate(p.paidAt, d.timezone)} · ${PAYMENT_METHOD_LABEL[p.method]}`}
                value={formatRupiah(p.amount)}
              />
            ))}
          </View>
        )}
        {!paid && d.bankAccounts.length > 0 && (
          <View style={s.section}>
            <Text style={s.h2}>Transfer ke</Text>
            {d.bankAccounts.map((b) => (
              <Text key={b.number}>
                {b.bank} {b.number} a.n. {b.holder}
              </Text>
            ))}
          </View>
        )}
        <Text
          style={[
            s.badge,
            { backgroundColor: paid ? "#dcfce7" : "#dbeafe", color: paid ? "#15803d" : "#1d4ed8" },
          ]}
        >
          {paid ? "LUNAS" : "BELUM LUNAS"}
        </Text>
        <Text style={s.footer} fixed>
          Dibuat oleh Kosku · {formatDate(new Date(), d.timezone)}
        </Text>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}

export async function monthlyReportPdf(propertyName: string, r: MonthlyReport) {
  const doc = (
    <Document title={`Laporan ${formatPeriod(r.period)}`} author="Kosku">
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Laporan {formatPeriod(r.period)}</Text>
        <Text style={s.muted}>{propertyName}</Text>
        <View style={s.section}>
          <Text style={s.h2}>Pemasukan (kas)</Text>
          {r.incomeByMethod.length === 0 && <Text style={s.muted}>Belum ada pembayaran.</Text>}
          {r.incomeByMethod.map((m) => (
            <Line
              key={m.method}
              label={`${PAYMENT_METHOD_LABEL[m.method as keyof typeof PAYMENT_METHOD_LABEL] ?? m.method} (${m.count}×)`}
              value={formatRupiah(m.amount)}
            />
          ))}
          <Line label="Total pemasukan" value={formatRupiah(r.income)} bold />
        </View>
        <View style={s.section}>
          <Text style={s.h2}>Pengeluaran</Text>
          {r.expensesByCategory.length === 0 && <Text style={s.muted}>Belum ada pengeluaran.</Text>}
          {r.expensesByCategory.map((c) => (
            <Line
              key={c.category}
              label={EXPENSE_CATEGORIES[c.category as keyof typeof EXPENSE_CATEGORIES] ?? c.category}
              value={formatRupiah(c.amount)}
            />
          ))}
          <Line label="Total pengeluaran" value={formatRupiah(r.expenses)} bold />
        </View>
        <View style={s.section}>
          <Line label="LABA BERSIH" value={formatRupiah(r.net)} bold />
        </View>
        <View style={s.section}>
          <Text style={s.h2}>Penagihan periode ini</Text>
          <Line label={`Ditagihkan (${r.invoices} tagihan)`} value={formatRupiah(r.billed)} />
          <Line label="Sudah dibayar" value={formatRupiah(r.billedPaid)} />
          <Line label="Belum dibayar" value={formatRupiah(r.billed - r.billedPaid)} />
          {r.creditApplied > 0 && (
            <Text style={[s.muted, { marginTop: 4 }]}>
              Termasuk {formatRupiah(r.creditApplied)} dari saldo kelebihan bayar.
            </Text>
          )}
        </View>
        <Text style={s.footer} fixed>
          Dibuat oleh Kosku · laba-rugi berbasis kas (tanggal pembayaran)
        </Text>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
