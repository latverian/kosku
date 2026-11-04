import "server-only";
import ExcelJS from "exceljs";
import { AGING_LABEL, EXPENSE_CATEGORIES } from "@/lib/finance";
import { formatDate, formatPeriod } from "@/lib/format";
import { PAYMENT_METHOD_LABEL } from "@/lib/labels";
import type { AgingRow, MonthlyReport, MonthRow } from "@/services/finance";

const RUPIAH = '"Rp"#,##0;[Red]-"Rp"#,##0';

function workbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kosku";
  wb.created = new Date();
  return wb;
}

function header(ws: ExcelJS.Worksheet, title: string, subtitle: string) {
  ws.addRow([title]).font = { bold: true, size: 14 };
  ws.addRow([subtitle]).font = { color: { argb: "FF6B7280" } };
  ws.addRow([]);
}

function tableHeader(ws: ExcelJS.Worksheet, cols: string[]) {
  const row = ws.addRow(cols);
  row.font = { bold: true };
  row.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    c.border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } };
  });
}

export async function monthlyReportXlsx(propertyName: string, r: MonthlyReport) {
  const wb = workbook();
  const ws = wb.addWorksheet("Laba-rugi");
  ws.columns = [{ width: 36 }, { width: 18 }, { width: 10 }];
  header(ws, `Laporan ${formatPeriod(r.period)}`, propertyName);

  tableHeader(ws, ["Pemasukan (kas)", "Nominal", "Transaksi"]);
  for (const m of r.incomeByMethod)
    ws.addRow([
      PAYMENT_METHOD_LABEL[m.method as keyof typeof PAYMENT_METHOD_LABEL] ?? m.method,
      m.amount,
      m.count,
    ]);
  ws.addRow(["Total pemasukan", r.income]).font = { bold: true };
  ws.addRow([]);
  tableHeader(ws, ["Pengeluaran", "Nominal"]);
  for (const c of r.expensesByCategory)
    ws.addRow([EXPENSE_CATEGORIES[c.category as keyof typeof EXPENSE_CATEGORIES] ?? c.category, c.amount]);
  ws.addRow(["Total pengeluaran", r.expenses]).font = { bold: true };
  ws.addRow([]);
  ws.addRow(["LABA BERSIH", r.net]).font = { bold: true, size: 12 };
  ws.addRow([]);
  tableHeader(ws, ["Penagihan periode ini", "Nominal"]);
  ws.addRow([`Ditagihkan (${r.invoices} tagihan)`, r.billed]);
  ws.addRow(["Sudah dibayar", r.billedPaid]);
  ws.addRow(["Belum dibayar", r.billed - r.billedPaid]);
  if (r.creditApplied) ws.addRow(["Catatan: dipotong dari saldo kelebihan bayar", r.creditApplied]);
  ws.getColumn(2).numFmt = RUPIAH;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function yearlyReportXlsx(propertyName: string, rows: MonthRow[]) {
  const wb = workbook();
  const ws = wb.addWorksheet("12 bulan");
  ws.columns = [{ width: 18 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];
  header(ws, `Laporan ${formatPeriod(rows[0].period)} – ${formatPeriod(rows.at(-1)!.period)}`, propertyName);
  tableHeader(ws, ["Bulan", "Pemasukan", "Pengeluaran", "Laba", "Ditagihkan", "Terbayar"]);
  for (const m of rows)
    ws.addRow([formatPeriod(m.period), m.income, m.expenses, m.net, m.billed, m.billedPaid]);
  const sum = (k: keyof MonthRow) => rows.reduce((s, m) => s + (m[k] as number), 0);
  ws.addRow(["Total", sum("income"), sum("expenses"), sum("net"), sum("billed"), sum("billedPaid")]).font = {
    bold: true,
  };
  for (const c of [2, 3, 4, 5, 6]) ws.getColumn(c).numFmt = RUPIAH;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function agingXlsx(propertyName: string, today: string, rows: AgingRow[]) {
  const wb = workbook();
  const ws = wb.addWorksheet("Tunggakan");
  ws.columns = [
    { width: 8 },
    { width: 26 },
    { width: 16 },
    { width: 24 },
    { width: 14 },
    { width: 18 },
    { width: 22 },
  ];
  header(ws, "Laporan tunggakan", `${propertyName} · per ${formatDate(today)}`);
  tableHeader(ws, ["Kamar", "Penghuni", "No. WA", "No. tagihan", "Jatuh tempo", "Sisa", "Umur"]);
  for (const r of rows)
    ws.addRow([
      r.roomCode,
      r.tenantName,
      r.phone,
      r.number,
      formatDate(r.dueDate),
      r.remaining,
      AGING_LABEL[r.bucket],
    ]);
  ws.addRow(["", "Total", "", "", "", rows.reduce((s, r) => s + r.remaining, 0)]).font = { bold: true };
  ws.getColumn(6).numFmt = RUPIAH;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
