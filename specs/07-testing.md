# Rencana Pengujian & Definition of Done

## 1. Strategi
| Lapisan | Alat | Cakupan |
|---|---|---|
| Unit | Vitest | `lib/billing` (jatuh tempo, prorata, denda, status, kredit), `lib/messaging` (jadwal pengingat, jam tenang, render template), format Rupiah/tanggal. Target coverage ≥ 90%. |
| Integrasi DB | Vitest + Supabase lokal | Trigger status tagihan, constraint unik, RLS (user A tidak bisa baca properti B), idempotensi job |
| E2E | Playwright | Alur check-in → tagihan → upload bukti (portal) → verifikasi → lunas; alur komplain; HP (Pixel 7) & desktop |
| Manual | Checklist | Kirim WA sungguhan ke nomor penguji sebelum rilis |

## 2. Kasus uji penting (wajib ada)

### Tagihan
- [ ] Sewa mulai 5 Nov, tanggal tagih 5, lead 7 hari → tagihan Desember dibuat tanggal 28 Nov, tidak sebelumnya.
- [ ] Job dijalankan 2× → tetap 1 tagihan.
- [ ] Prorata: masuk 20 Nov, harga Rp1.500.000, Nov 30 hari → 11 hari → Rp550.000.
- [ ] Penghuni check-out 15 Des, tanggal tagih 5 → tagihan Januari **tidak** dibuat.
- [ ] Tanggal tagih 28 di bulan Februari tahun kabisat & non-kabisat.
- [ ] Zona waktu: job jam 07.00 WIB = 00.00 UTC → periode yang benar.

### Pembayaran
- [ ] Bayar sebagian lalu lunas → status `partial` → `paid`.
- [ ] Bayar lebih Rp100.000 → kredit Rp100.000 → otomatis mengurangi tagihan berikutnya.
- [ ] Tolak pembayaran → status tagihan kembali sesuai pembayaran terverifikasi lain.
- [ ] Webhook gateway dikirim 2× → hanya 1 pembayaran.

### Denda
- [ ] `daily` Rp5.000, tenggang 3 hari, telat 5 hari → denda Rp10.000 (2 hari setelah tenggang).
- [ ] Denda tidak melebihi `late_fee_max`.
- [ ] Denda berhenti bertambah setelah lunas.

### Pengingat WA
- [ ] Tagihan lunas di H-1 → pengingat H0 dan seterusnya tidak dikirim.
- [ ] Job jadwal dijalankan 2× → pengingat tidak dobel.
- [ ] Dijadwalkan jam 21.00 → dikirim besok 08.00.
- [ ] Penghuni `reminders_muted` → tidak ada pengingat, tetapi konfirmasi lunas tetap dikirim.
- [ ] Fonnte error 5xx → retry 3× lalu `failed`, muncul di dashboard.

### Keamanan
- [ ] Manager tanpa `can_view_finance` → `/keuangan` ditolak (403).
- [ ] Token portal dicabut → link lama menampilkan "Link tidak berlaku".
- [ ] Portal penghuni A tidak dapat mengakses foto bukti penghuni B (ganti ID di URL).
- [ ] Endpoint cron tanpa `CRON_SECRET` → 401.

## 3. Definition of Done (per fitur)
- [ ] Memenuhi acceptance criteria di [02-requirements.md](02-requirements.md)
- [ ] Unit/integration test ditulis dan lulus di CI
- [ ] Tampilan dicek di lebar 360 px dan ≥ 1280 px, mode terang & gelap
- [ ] Teks UI berbahasa Indonesia, uang & tanggal terformat benar
- [ ] Perubahan data penting tercatat di audit log
- [ ] Tidak ada rahasia di kode, `.env.example` diperbarui jika ada variabel baru
- [ ] Migrasi database disertakan & dapat dijalankan dari nol
