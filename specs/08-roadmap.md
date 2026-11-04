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

## Fase 1 — MVP: tagihan & pembayaran (minggu 2–4)
- [ ] Properti, pengaturan, rekening bank
- [ ] CRUD kamar (+ tambah massal)
- [ ] Penghuni + check-in / check-out / pindah kamar
- [ ] `lib/billing` + unit test (jatuh tempo, prorata, status)
- [ ] Job `generate_invoices` + `job_runs`
- [ ] Daftar & detail tagihan, tambah item, koreksi, batalkan
- [ ] Catat pembayaran manual, verifikasi, kredit kelebihan bayar
- [ ] **Dashboard**: kartu ringkasan, kisi status kamar, perlu tindakan
- [ ] Audit log

✅ **Rilis v0.1**: pemilik bisa memakai Kosku menggantikan buku/Excel. Pengingat masih manual (tombol "Kirim WA" membuka `wa.me` dengan pesan terisi).

## Fase 2 — WhatsApp, portal & komplain (minggu 5–7)
- [ ] Interface `WhatsAppProvider` + Fonnte + ConsoleProvider
- [ ] Template pesan + editor + pratinjau
- [ ] Jobs `schedule_reminders`, `send_messages`, jam tenang, retry
- [ ] Log pesan, kirim ulang, mute per penghuni
- [ ] Portal penghuni (token, tagihan, upload bukti, riwayat)
- [ ] Notifikasi WA: bukti baru (ke pemilik), lunas, ditolak, sambutan
- [ ] Komplain: buat (portal & staf), foto, status, komentar, penugasan, rating
- [ ] Broadcast pengumuman
- [ ] Denda keterlambatan (`apply_late_fees`)

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
