# Rekomendasi Teknologi (Tech Stack)

## Ringkasan keputusan

| Lapisan | Pilihan | Alasan singkat |
|---|---|---|
| **Bahasa** | **TypeScript** | Satu bahasa untuk frontend + backend, tipe data mencegah bug hitung uang |
| Framework web | **Next.js 15 (App Router)** | Frontend + API + server actions dalam satu project, deploy 1 klik ke Vercel |
| **Database** | **PostgreSQL** (via **Supabase**) | Relasional, transaksi ACID, constraint kuat, gratis untuk skala kecil |
| ORM / query | **Drizzle ORM** | Ringan, SQL-like, tipe otomatis dari skema, migrasi berbasis file |
| Auth | **Supabase Auth** | Email/password, magic link, terintegrasi dengan RLS |
| Penyimpanan file | **Supabase Storage** | Foto KTP, bukti bayar, foto komplain (bucket privat + signed URL) |
| UI | **Tailwind CSS + shadcn/ui** | Komponen siap pakai, rapi, mudah dikustom, mendukung mode gelap |
| Form & validasi | **React Hook Form + Zod** | Satu skema validasi untuk client dan server |
| Grafik | **Recharts** | Grafik pemasukan di dashboard |
| Tanggal | **date-fns + date-fns-tz** | Perhitungan jatuh tempo dan zona waktu WIB/WITA/WIT |
| WhatsApp | **Fonnte** (default), siap diganti **WhatsApp Cloud API** | Murah, mudah, nomor biasa |
| Payment gateway (fase 3) | **Midtrans** atau **Xendit** | VA, QRIS, e-wallet, webhook |
| Penjadwal (cron) | **Supabase pg_cron** → memanggil endpoint Next.js | Andal, tidak bergantung batas cron Vercel gratis |
| Ekspor | **ExcelJS** (xlsx), **@react-pdf/renderer** (PDF) | Laporan & kuitansi |
| Testing | **Vitest** (unit), **Playwright** (E2E) | Cepat, standar ekosistem TS |
| Monitoring | **Sentry** (tier gratis) | Lacak error produksi |
| Hosting | **Vercel** (app) + **Supabase** (DB) | Tier gratis cukup untuk 1–3 kos |
| CI/CD | **GitHub Actions** + integrasi Vercel | Lint, test, preview deploy tiap PR |
| Package manager | **pnpm** | Cepat, hemat disk |

---

## Kenapa TypeScript?

1. **Satu bahasa di semua sisi**: halaman dashboard, API, job pengingat, dan webhook ditulis dengan bahasa yang sama. Cukup belajar satu.
2. **Aman untuk data uang**: TypeScript menangkap kesalahan seperti menjumlahkan `string` dengan `number`, atau lupa menangani status `sebagian`, sebelum aplikasi dijalankan.
3. **Ekosistem paling besar** untuk web modern: library WA, payment gateway (Midtrans/Xendit punya SDK Node.js), PDF, Excel, semua tersedia.
4. **Mudah dibantu AI dan komunitas**: contoh kode Next.js + Supabase sangat banyak.

### Alternatif yang juga layak

| Opsi | Cocok jika | Catatan |
|---|---|---|
| **PHP + Laravel + MySQL** | Kamu sudah terbiasa PHP, atau mau hosting shared murah (Niagahoster, dll.) | Sangat matang, fitur lengkap (queue, scheduler, auth). Frontend perlu Blade/Livewire atau Inertia. |
| **Python + Django + PostgreSQL** | Kamu terbiasa Python, atau butuh admin panel instan | Django Admin sangat membantu untuk back-office. Frontend relatif kurang modern. |
| **Go / Java** | Skala besar, tim besar | Berlebihan untuk kebutuhan kos. |
| **No-code (AppSheet + Google Sheets)** | Butuh jadi dalam 1–2 hari, tanpa ngoding | Terbatas: logika tagihan kompleks, keamanan data KTP, dan skala sulit. |

**Rekomendasi tetap: TypeScript + Next.js + PostgreSQL (Supabase).** Kalau kamu lebih nyaman dengan PHP, bilang saja, dan dokumen ini akan disesuaikan ke Laravel. Desain database dan fiturnya tetap sama.

---

## Kenapa PostgreSQL (bukan MongoDB / Firebase / Google Sheets)?

Data kos sangat **relasional**: properti → kamar → sewa → tagihan → pembayaran. Kebutuhannya:

| Kebutuhan | PostgreSQL | MongoDB / Firestore | Google Sheets |
|---|---|---|---|
| Relasi & JOIN (tagihan + penghuni + kamar) | ✅ native | ⚠️ manual | ⚠️ VLOOKUP |
| Transaksi (bayar + update status tagihan sekaligus) | ✅ ACID | ⚠️ terbatas | ❌ |
| Constraint anti-duplikat (`UNIQUE(lease_id, period)`) | ✅ | ⚠️ | ❌ |
| Keamanan per baris (RLS) | ✅ | ✅ (rules) | ❌ |
| Laporan agregat (SUM per bulan, aging tunggakan) | ✅ SQL | ⚠️ | ⚠️ |
| Gratis untuk skala kecil | ✅ Supabase | ✅ | ✅ |

**Supabase** = PostgreSQL terkelola, ditambah Auth, Storage, cron (`pg_cron`), backup harian, dan dashboard tabel seperti spreadsheet untuk melihat data. Kalau nanti mau pindah dari Supabase, datanya tetap PostgreSQL standar.

---

## Perkiraan biaya bulanan (1 kos, ±30 kamar)

| Komponen | Biaya |
|---|---|
| Vercel (Hobby) | Rp0 |
| Supabase (Free: 500 MB DB, 1 GB storage) | Rp0 |
| Fonnte (paket dasar) | ±Rp25.000–Rp66.000 |
| Domain `.my.id` / `.com` | ±Rp1.000–Rp15.000/bulan (dibayar tahunan) |
| Midtrans/Xendit (fase 3) | Per transaksi, mis. VA ±Rp4.000, QRIS 0,7% |
| **Total** | **±Rp30.000–Rp80.000/bulan** |

> ⚠️ Tier gratis Supabase akan *pause* project jika tidak ada aktivitas 7 hari. Karena ada cron harian, ini tidak terjadi. Untuk produksi serius, pertimbangkan Supabase Pro (US$25/bulan) agar ada backup point-in-time.

---

## Struktur folder project (rencana)

```
kosku/
├─ docs/                      # dokumen spesifikasi (folder ini)
├─ src/
│  ├─ app/
│  │  ├─ (auth)/login/        # halaman login
│  │  ├─ (dashboard)/         # area pemilik/pengelola
│  │  │  ├─ page.tsx          # dashboard
│  │  │  ├─ kamar/
│  │  │  ├─ penghuni/
│  │  │  ├─ tagihan/
│  │  │  ├─ pembayaran/
│  │  │  ├─ komplain/
│  │  │  ├─ pesan/            # log WA, template, broadcast
│  │  │  ├─ laporan/
│  │  │  └─ pengaturan/
│  │  ├─ p/[token]/           # portal penghuni
│  │  └─ api/
│  │     ├─ cron/             # endpoint job terjadwal
│  │     └─ webhooks/         # fonnte, midtrans/xendit
│  ├─ components/             # komponen UI (shadcn/ui)
│  ├─ db/
│  │  ├─ schema.ts            # skema Drizzle
│  │  └─ migrations/
│  ├─ lib/
│  │  ├─ billing/             # logika tagihan, denda, status (murni, mudah di-test)
│  │  ├─ whatsapp/            # interface provider + implementasi Fonnte
│  │  ├─ payments/            # interface gateway
│  │  └─ format.ts            # format Rupiah, tanggal
│  └─ server/                 # server actions & query per modul
├─ tests/
│  ├─ unit/
│  └─ e2e/
├─ .env.example
└─ README.md
```
