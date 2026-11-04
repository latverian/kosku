# Kosku 🏠

**Sistem manajemen kos**: tagihan bulanan otomatis, pengingat WhatsApp, dashboard status pembayaran, portal penghuni, dan pengelolaan komplain.

> Status: **Fase 1 selesai**: kamar, penghuni (check-in/out, pindah kamar), tagihan otomatis, pembayaran & verifikasi, pengaturan. Berikutnya Fase 2 (pengingat WhatsApp, portal penghuni, komplain). Lihat [roadmap](specs/08-roadmap.md).

## Fitur utama

- 🚪 Data kamar, penghuni, dan kontrak sewa (check-in / check-out)
- 🧾 Tagihan bulanan dibuat otomatis, plus item tambahan & denda
- 💬 Pengingat WhatsApp otomatis (H-3, H, H+1, H+3, H+7) dan konfirmasi lunas
- ✅ Rekap pembayaran: upload bukti → verifikasi 1 klik → status lunas otomatis (payment gateway menyusul)
- 📊 Dashboard: siapa sudah/belum bayar, pemasukan, hunian, hal yang perlu ditindaklanjuti
- 🛠 Komplain penghuni dengan foto, prioritas, status, dan riwayat
- 📱 Portal penghuni tanpa login (link pribadi via WA)
- 📈 Laporan pemasukan, pengeluaran, dan tunggakan (ekspor Excel/PDF)

## Tech stack

TypeScript · Next.js 16 (App Router) · PostgreSQL (Supabase) · Drizzle ORM · Supabase Auth · Tailwind CSS 4 · Vitest · Vercel

---

## Setup

Butuh **Node.js ≥ 20.9** dan **pnpm** (`npm install -g pnpm`).

```bash
git clone https://github.com/latverian/kosku.git
cd kosku
pnpm install
cp .env.example .env.local
```

### Opsi A — Pakai Supabase (disarankan)

1. Buat project gratis di [supabase.com](https://supabase.com) (region: Singapore).
2. **Project Settings → API**: salin _Project URL_ dan _anon/publishable key_ ke `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` di `.env.local`.
3. **Project Settings → Database → Connection string → Transaction pooler**: salin ke `DATABASE_URL` (ganti `[YOUR-PASSWORD]`).
4. **Authentication → URL Configuration**: isi _Site URL_ `http://localhost:3000` dan tambahkan `http://localhost:3000/auth/confirm` ke _Redirect URLs_.
5. Jalankan migrasi database:
   ```bash
   pnpm db:migrate
   ```
6. Jalankan aplikasi, buka http://localhost:3000/daftar dan buat akun:
   ```bash
   pnpm dev
   ```
7. _(Opsional)_ Isi data contoh "Kos Melati" dengan akun kamu sebagai pemilik:
   ```bash
   SEED_OWNER_EMAIL=email-kamu@contoh.com pnpm db:seed
   ```

### Opsi B — PostgreSQL lokal tanpa Supabase (untuk mencoba cepat)

Login belum bisa dipakai, tetapi dashboard bisa dibuka lewat **mode pratinjau development**.

```bash
# DATABASE_URL di .env.local → postgres://postgres:postgres@localhost:5432/kosku_dev
pnpm db:reset-local                     # buat skema auth tiruan + migrasi (HANYA DB lokal)
psql "$DATABASE_URL" -c "insert into auth.users (email) values ('saya@lokal.test') returning id"
SEED_OWNER_EMAIL=saya@lokal.test pnpm db:seed
```

Lalu isi `KOSKU_DEV_PREVIEW_USER_ID=<id dari perintah di atas>` di `.env.local` dan jalankan `pnpm dev`. Mode ini **tidak pernah aktif di production**.

## Perintah

| Perintah                                       | Fungsi                                                       |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `pnpm dev`                                     | Server development                                           |
| `pnpm build` / `pnpm start`                    | Build & jalankan versi production                            |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Kualitas kode                                                |
| `pnpm test`                                    | Tes unit (logika tagihan, denda, format, template WA)        |
| `pnpm test:db`                                 | Tes integrasi database: trigger & RLS (butuh `DATABASE_URL`) |
| `pnpm db:generate`                             | Buat file migrasi setelah mengubah `src/db/schema.ts`        |
| `pnpm db:migrate`                              | Terapkan migrasi ke database                                 |
| `pnpm db:seed`                                 | Isi data contoh                                              |
| `pnpm db:studio`                               | Lihat isi database di browser                                |

## Struktur

```
specs/              dokumen spesifikasi (PRD, requirements, desain, dll.)
drizzle/            migrasi SQL (0000 = tabel, 0001 = trigger & RLS, ditulis tangan)
scripts/db/         shim Supabase untuk PostgreSQL lokal/CI, reset DB lokal
src/
  app/(auth)/       login, daftar, server action auth
  app/(dashboard)/  dashboard & halaman pemilik/pengelola
  components/       komponen UI & layout (sidebar, navigasi bawah)
  db/               skema Drizzle, koneksi, seed
  lib/billing/      logika tagihan murni: jatuh tempo, prorata, denda, status
  lib/messaging/    template pesan WhatsApp
  server/           query & auth sisi server (Data Access Layer)
tests/unit/         tes unit (Vitest)
tests/db/           tes integrasi database
```

## Job otomatis (cron)

| Endpoint                  | Jadwal Vercel (`vercel.json`) | Tugas                                                       |
| ------------------------- | ----------------------------- | ----------------------------------------------------------- |
| `/api/cron/daily`         | 07.00 WIB                     | Buat tagihan → denda keterlambatan → jadwalkan pengingat WA |
| `/api/cron/send-messages` | 08.05 WIB                     | Kirim antrian WhatsApp (maks. 20 pesan/panggilan)           |

Isi `CRON_SECRET` di environment Vercel; Vercel mengirimnya otomatis sebagai header `Authorization: Bearer …`. Notifikasi kejadian (konfirmasi bayar, komplain baru, dll.) juga langsung dikirim setelah aksi, kecuali di jam tenang.

Paket Vercel Hobby hanya menjalankan cron **sekali sehari**. Supaya antrian WA terkirim tiap 5 menit, jadwalkan endpoint pengirim dari Supabase (**SQL Editor**, aktifkan ekstensi `pg_cron` dan `pg_net` dulu di **Database → Extensions**):

```sql
select cron.schedule(
  'kosku-send-messages',
  '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://DOMAIN-KAMU.vercel.app/api/cron/send-messages',
       headers := jsonb_build_object('Authorization', 'Bearer ISI_CRON_SECRET')
     ) $$
);
```

Uji manual di lokal:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily
```

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/send-messages
```

## WhatsApp (Fonnte)

1. Daftar di [fonnte.com](https://fonnte.com), tambahkan **device** dengan nomor WA khusus kos, lalu scan QR.
2. Salin **token** device ke `FONNTE_TOKEN`.
3. Buka **Pesan WA → Pengaturan → Kirim uji**.

Tanpa `FONNTE_TOKEN`, di development pesan hanya dicetak di log server; di production pesan ditandai gagal dengan alasan yang jelas.

## Portal penghuni & file

- Isi `PORTAL_SECRET` (min. 16 karakter). Link portal tiap penghuni ada di halaman detail penghuni dan otomatis masuk ke pesan WA. **Buat link baru** mencabut link lama.
- Foto bukti bayar & komplain disimpan di Supabase Storage (bucket privat, dibuat oleh migrasi). Isi `SUPABASE_SERVICE_ROLE_KEY`. Tanpa itu, di development file disimpan di `.data/uploads`.

## Deploy ke Vercel

1. Import repo ini di [vercel.com/new](https://vercel.com/new).
2. Isi environment variables yang sama dengan `.env.local` (kecuali `KOSKU_DEV_PREVIEW_USER_ID`), termasuk `CRON_SECRET` dan `NIK_ENCRYPTION_KEY`, dan ubah `APP_URL` ke domain Vercel.
3. Di Supabase **Authentication → URL Configuration**, tambahkan `https://<domain>/auth/confirm`.

## Stitch MCP (desain UI)

`.mcp.json` mendaftarkan server MCP Stitch untuk Claude Code. API key **tidak** disimpan di repo: isi `STITCH_API_KEY` di environment kamu (lokal: `export STITCH_API_KEY=...`; Claude Code di cloud: pengaturan environment).

## Dokumentasi

| Dokumen                                       | Isi                                                                |
| --------------------------------------------- | ------------------------------------------------------------------ |
| [01 — PRD](specs/01-PRD.md)                   | Latar belakang, tujuan, persona, ruang lingkup, prioritas fitur    |
| [02 — Requirements](specs/02-requirements.md) | Kebutuhan fungsional & non-fungsional + acceptance criteria        |
| [03 — Tech stack](specs/03-tech-stack.md)     | Rekomendasi bahasa, framework, database, biaya                     |
| [04 — Database](specs/04-database.md)         | ERD, enum, definisi tabel, constraint, RLS                         |
| [05 — Arsitektur](specs/05-architecture.md)   | Komponen, job terjadwal, alur, integrasi WA & pembayaran, keamanan |
| [06 — Desain UI/UX](specs/06-ui-design.md)    | Prinsip, warna status, sitemap, wireframe                          |
| [07 — Testing](specs/07-testing.md)           | Strategi uji, kasus uji wajib, Definition of Done                  |
| [08 — Roadmap](specs/08-roadmap.md)           | Fase pengerjaan & pertanyaan terbuka                               |
