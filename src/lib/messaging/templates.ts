/**
 * Template pesan WhatsApp default (specs/05-architecture.md § Template pesan).
 * Variabel ditulis {nama}; variabel yang tidak dikenal dibiarkan apa adanya
 * agar kesalahan template mudah terlihat saat pratinjau.
 */
export type TemplateType =
  | "reminder_before"
  | "reminder_due"
  | "reminder_overdue_1"
  | "reminder_overdue_3"
  | "reminder_overdue_7"
  | "payment_confirmed"
  | "payment_rejected"
  | "welcome";

const overdue = `Halo {nama}, sewa kamar {kamar} periode {periode} sudah lewat jatuh tempo {hari_telat} hari.
Sisa tagihan: *{sisa}*{denda_info}
Mohon segera diselesaikan: {link_portal}
Jika ada kendala, silakan balas pesan ini 🙏`;

export const DEFAULT_TEMPLATES: Record<TemplateType, string> = {
  reminder_before: `Halo {nama} 👋
Pengingat dari {nama_kos}: sewa kamar {kamar} periode {periode} sebesar *{nominal}* jatuh tempo *{jatuh_tempo}*.

Transfer ke:
{rekening}

Setelah transfer, upload bukti di sini ya:
{link_portal}

Terima kasih 🙏`,
  reminder_due: `Halo {nama}, hari ini ({jatuh_tempo}) jatuh tempo sewa kamar {kamar} sebesar *{sisa}*.
Bayar & upload bukti: {link_portal}
Abaikan pesan ini jika sudah membayar. Terima kasih 🙏`,
  reminder_overdue_1: overdue,
  reminder_overdue_3: overdue,
  reminder_overdue_7: overdue,
  payment_confirmed: `Terima kasih {nama} ✅
Pembayaran {periode} kamar {kamar} sebesar {nominal} sudah kami terima.
Kuitansi: {link_kuitansi}`,
  payment_rejected: `Halo {nama}, bukti pembayaran yang kamu kirim belum dapat kami verifikasi.
Alasan: {alasan}
Silakan upload ulang: {link_portal}`,
  welcome: `Selamat datang di {nama_kos}, {nama}! 🏠
Kamar: {kamar} | Sewa: {nominal}/bulan | Tagih setiap tgl {tgl_tagih}

Simpan nomor ini ya, semua info tagihan & pengumuman akan dikirim dari sini.
Portal penghuni (tagihan, bayar, lapor kerusakan): {link_portal}`,
};

export type TemplateVars = Record<string, string | number>;

export function renderTemplate(body: string, vars: TemplateVars): string {
  return body.replace(/\{([a-z_]+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

/** Variabel yang dipakai template tetapi tidak tersedia — untuk validasi editor. */
export function missingVariables(body: string, vars: TemplateVars): string[] {
  const used = new Set([...body.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]));
  return [...used].filter((key) => !(key in vars));
}
