# Roadmap & Rencana Kerja

Estimasi untuk 1 developer paruh waktu (±15–20 jam/minggu). Setiap fase berakhir dengan versi yang **bisa dipakai** di kos sungguhan.

## Fase 0 — Fondasi (minggu 1) ✅ selesai
- [x] Inisialisasi Next.js 16 + TypeScript strict + Tailwind 4 + komponen gaya shadcn/ui + ESLint/Prettier
- [ ] Supabase project (staging & prod) — **perlu dibuat pemilik** (lihat README § Setup)
- [x] Skema Drizzle (20 tabel) + migrasi trigger & RLS + seed data contoh
- [x] Auth (login email/password, magic link, daftar), layout dashboard, navigasi HP & desktop
- [x] Dashboard awal dari data nyata: kartu ringkasan, kisi status kamar, daftar perlu tindakan
- [x] Logika inti `lib/billing` (jatuh tempo, prorata, denda, status) + template WA, dengan tes unit
- [x] Tes integrasi database (trigger & RLS)
- [x] GitHub Actions: lint, typecheck, test, build, migrasi + tes DB
- [ ] Vercel preview per PR — aktif setelah repo dihubungkan ke Vercel
- [x] `.env.example`, README cara setup

## Fase 1 — MVP: tagihan & pembayaran (minggu 2–4) ✅ selesai
- [x] Buat properti (onboarding akun baru), pengaturan, rekening bank (maks. 3)
- [x] CRUD kamar (+ tambah massal), arsipkan kamar
- [x] Penghuni + check-in (wizard 3 langkah, pratinjau tagihan pertama) / check-out / pindah kamar
- [x] NIK disimpan terenkripsi (AES-256-GCM, `NIK_ENCRYPTION_KEY`)
- [x] `lib/billing` + unit test (siklus, prorata, rencana tagihan, status)
- [x] Job `generate_invoices` (Vercel Cron harian 07.00 WIB) + `job_runs`, tombol "Buat tagihan sekarang"
- [x] Daftar & detail tagihan, tambah/hapus item, batalkan
- [x] Catat pembayaran manual, verifikasi/tolak, saldo kelebihan bayar dipakai otomatis
- [x] **Dashboard**: kartu ringkasan, kisi status kamar, perlu tindakan
- [x] Audit log untuk semua perubahan penting
- [ ] Upload foto KTP & bukti bayar → dipindah ke Fase 2 (butuh Supabase Storage, bersama portal penghuni)

✅ **Rilis v0.1**: pemilik bisa memakai Kosku menggantikan buku/Excel. Pengingat masih manual (tombol "Kirim WA" membuka `wa.me` dengan pesan terisi).

## Fase 2 — WhatsApp, portal & komplain (minggu 5–7) ✅ selesai
- [x] Interface `WhatsAppProvider` + Fonnte + ConsoleProvider
- [x] Template pesan + editor + pratinjau langsung (peringatan variabel tidak dikenal)
- [x] Jobs `schedule_reminders`, `send_messages`, jam tenang, retry (1/5/15 menit), toleransi 1 hari bila job terlewat
- [x] Log pesan, kirim ulang, mute per penghuni, pesan uji, "Kirim antrian sekarang"
- [x] Portal penghuni (token HMAC + versi untuk dicabut, tagihan, rekening + salin, upload bukti, riwayat, berlaku 30 hari setelah check-out)
- [x] Notifikasi WA: bukti baru (ke pengelola), konfirmasi bayar (termasuk cicilan), ditolak, sambutan, komplain baru/update
- [x] Komplain: buat (portal & staf), foto (dikompres di browser), status, komentar dua arah, penugasan, biaya → pengeluaran, rating
- [x] Broadcast pengumuman (semua / per lantai)
- [x] Denda keterlambatan otomatis (`apply_late_fees`, idempoten)
- [x] Penyimpanan file privat (Supabase Storage + signed URL 10 menit; disk lokal + URL HMAC untuk development)
- [ ] Upload foto KTP → Fase 3 (bersama pengelolaan dokumen penghuni)
- [ ] Webhook status pesan Fonnte (terkirim → dibaca) → Fase 3

✅ **Rilis v0.2**: penagihan berjalan otomatis, penghuni punya portal.

## Fase 3 — Keuangan & otomasi penuh (minggu 8–10)
- [ ] Pengeluaran + foto nota, biaya komplain → pengeluaran
- [ ] Laporan bulanan/tahunan, aging tunggakan, grafik 12 bulan
- [ ] Ekspor Excel & PDF, PDF tagihan & kuitansi
- [ ] Payment gateway (Midtrans/Xendit): link bayar di WA, webhook → lunas otomatis
- [ ] Peran manager + izin keuangan, undang anggota tim
- [ ] UI multi-properti (pilih properti di header)
- [ ] Sentry + peringatan job gagal

✅ **Rilis v1.0**

## Fase 4 — Nice to have (backlog)
- Daftar tunggu & reservasi kamar, halaman publik kamar kosong
- Input meteran listrik per kamar → tagihan listrik otomatis
- PWA (install ke home screen) + push notification pemilik
- Login penghuni dengan OTP WA
- Kontrak sewa digital + tanda tangan
- WhatsApp Cloud API resmi
- Integrasi mutasi bank (Moota / Brick) untuk pencocokan otomatis tanpa gateway

---

## Pertanyaan terbuka

Mohon dijawab sebelum Fase 1 dimulai. Jawaban akan mengubah default di desain:

| # | Pertanyaan | Default sementara |
|---|---|---|
| 1 | Berapa jumlah kamar dan lokasi kos saat ini? | 1 lokasi, ≤ 50 kamar |
| 2 | Tanggal tagih sama untuk semua (mis. tiap tgl 1) atau mengikuti tanggal masuk masing-masing? | Mengikuti tanggal masuk (bisa diubah per penghuni) |
| 3 | Apakah ada denda keterlambatan? Berapa dan setelah berapa hari? | Nonaktif |
| 4 | Apakah ada biaya tambahan bulanan (listrik terpisah, laundry, parkir)? | Ada, input manual per tagihan |
| 5 | Apakah ada kamar yang diisi lebih dari 1 orang dengan tagihan terpisah? | Tidak |
| 6 | Siapa saja yang akan memakai dashboard (hanya pemilik, atau ada penjaga kos)? | Pemilik + 1 pengelola |
| 7 | Rekening bank tujuan transfer (berapa rekening)? | 1–2 rekening |
| 8 | Sudah punya nomor WA khusus kos? | Perlu disiapkan |
| 9 | Mau payment gateway sejak awal, atau cukup upload bukti dulu? | Upload bukti dulu (fase 3: gateway) |
| 10 | Domain yang diinginkan (mis. `kosmelati.my.id`)? | Pakai subdomain Vercel dulu |
| 11 | Repo `latverian/kosku` saat ini **public**. Mau diubah ke private? | Disarankan private |
