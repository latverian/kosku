/** Variabel template WA untuk tagihan (FR-5.6) — murni. */
import type { BankAccount } from "../../db/schema";
import { daysBetween, type IsoDate } from "../billing/dates";
import { formatDate, formatPeriod, formatRupiah } from "../format";
import type { TemplateVars } from "./templates";

export function bankAccountsText(accounts: readonly BankAccount[]): string {
  if (accounts.length === 0) return "(hubungi pengelola untuk info rekening)";
  return accounts.map((a) => `${a.bank} ${a.number} a.n. ${a.holder}`).join("\n");
}

export function invoiceVars(input: {
  tenantName: string;
  roomCode: string;
  propertyName: string;
  period: IsoDate;
  dueDate: IsoDate;
  total: number;
  paidAmount: number;
  lateFee: number;
  billingDay: number;
  bankAccounts: readonly BankAccount[];
  portalUrl: string;
  today: IsoDate;
}): TemplateVars {
  const remaining = Math.max(0, input.total - input.paidAmount);
  return {
    nama: input.tenantName,
    kamar: input.roomCode,
    nama_kos: input.propertyName,
    periode: formatPeriod(input.period),
    jatuh_tempo: formatDate(input.dueDate),
    nominal: formatRupiah(input.total),
    sisa: formatRupiah(remaining),
    denda: formatRupiah(input.lateFee),
    denda_info: input.lateFee > 0 ? ` (termasuk denda ${formatRupiah(input.lateFee)})` : "",
    hari_telat: Math.max(0, daysBetween(input.dueDate, input.today)),
    tgl_tagih: input.billingDay,
    rekening: bankAccountsText(input.bankAccounts),
    link_portal: input.portalUrl,
    link_kuitansi: input.portalUrl,
  };
}

/** Contoh nilai untuk pratinjau template di editor. */
export const SAMPLE_VARS: TemplateVars = {
  nama: "Dewi",
  kamar: "07",
  nama_kos: "Kos Melati",
  periode: "November 2026",
  jatuh_tempo: "10 Nov 2026",
  nominal: "Rp1.800.000",
  sisa: "Rp1.800.000",
  denda: "Rp0",
  denda_info: "",
  hari_telat: 3,
  tgl_tagih: 10,
  rekening: "BCA 1234567890 a.n. Budi Santoso",
  link_portal: "https://kosku.example/p/contoh",
  link_kuitansi: "https://kosku.example/p/contoh",
  alasan: "Nominal tidak sesuai",
  nomor: "24",
  judul: "AC tidak dingin",
  status: "Diproses",
  prioritas: "Tinggi",
  catatan_info: "\nCatatan: Teknisi datang besok pagi",
  lokasi: "Kamar 07",
  link_admin: "https://kosku.example/komplain/contoh",
};
