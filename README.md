# Kosku 🏠

**Sistem manajemen kos**: tagihan bulanan otomatis, pengingat WhatsApp, dashboard status pembayaran, portal penghuni, dan pengelolaan komplain.

> Status: **tahap perancangan**. Belum ada kode aplikasi. Lihat dokumen spesifikasi di bawah.

## Fitur utama
- 🚪 Data kamar, penghuni, dan kontrak sewa (check-in / check-out)
- 🧾 Tagihan bulanan dibuat otomatis, plus item tambahan & denda
- 💬 Pengingat WhatsApp otomatis (H-3, H, H+1, H+3, H+7) dan konfirmasi lunas
- ✅ Rekap pembayaran: upload bukti → verifikasi 1 klik → status lunas otomatis (payment gateway menyusul)
- 📊 Dashboard: siapa sudah/belum bayar, pemasukan, hunian, hal yang perlu ditindaklanjuti
- 🛠 Komplain penghuni dengan foto, prioritas, status, dan riwayat
- 📱 Portal penghuni tanpa login (link pribadi via WA)
- 📈 Laporan pemasukan, pengeluaran, dan tunggakan (ekspor Excel/PDF)

## Dokumentasi
| Dokumen | Isi |
|---|---|
| [01 — PRD](docs/01-PRD.md) | Latar belakang, tujuan, persona, ruang lingkup, prioritas fitur |
| [02 — Requirements](docs/02-requirements.md) | Kebutuhan fungsional & non-fungsional + acceptance criteria |
| [03 — Tech stack](docs/03-tech-stack.md) | Rekomendasi bahasa, framework, database, biaya |
| [04 — Database](docs/04-database.md) | ERD, enum, definisi tabel, constraint, RLS |
| [05 — Arsitektur](docs/05-architecture.md) | Komponen, job terjadwal, alur, integrasi WA & pembayaran, keamanan |
| [06 — Desain UI/UX](docs/06-ui-design.md) | Prinsip, warna status, sitemap, wireframe |
| [07 — Testing](docs/07-testing.md) | Strategi uji, kasus uji wajib, Definition of Done |
| [08 — Roadmap](docs/08-roadmap.md) | Fase pengerjaan & pertanyaan terbuka |

## Tech stack (rencana)
TypeScript · Next.js 15 · PostgreSQL (Supabase) · Drizzle ORM · Tailwind + shadcn/ui · Fonnte (WhatsApp) · Vercel
