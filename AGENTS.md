<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Kosku — konvensi project

Spesifikasi lengkap ada di `specs/`. Baca dokumen yang relevan sebelum menambah fitur.

- **Bahasa**: UI & pesan error berbahasa Indonesia. Nama kode, tabel, kolom berbahasa Inggris.
- **Uang**: bilangan bulat Rupiah (`bigint` mode number). Jangan pernah float/desimal. Format dengan `formatRupiah`.
- **Tanggal**: tanggal kalender sebagai string `YYYY-MM-DD` (`IsoDate`); "hari ini" selalu `todayIn(property.timezone)`.
- **Logika bisnis murni** (tagihan, denda, status, template) di `src/lib/**` tanpa I/O, wajib ada tes unit di `tests/unit`.
- **Lapisan service** (`src/services/*`): semua logika yang menyentuh database. Menerima `tx`, tanpa `server-only`/`next/*` agar bisa diuji Vitest (`tests/db`). Server action (`src/app/**/actions.ts`) hanya: `requireContext()` → `parseForm(zod)` → `attempt(() => asUser(user.id, tx => service(...)))` → `revalidatePath`. Lempar `ServiceError` untuk pesan yang boleh dilihat pengguna.
- **Akses database**:
  - Request pemilik/pengelola → `asUser(user.id, tx => ...)` dari `@/db` (RLS berlaku).
  - `adminDb()` (melewati RLS) hanya untuk cron, webhook, dan portal penghuni setelah token divalidasi.
  - Selalu ambil user lewat `getCurrentUser()` (`src/server/auth.ts`) di halaman & server action. Jangan percaya proxy saja.
- **Migrasi**: ubah `src/db/schema.ts` → `pnpm db:generate`. Trigger, fungsi, dan RLS ditulis tangan di migrasi kustom (`pnpm drizzle-kit generate --custom --name ...`). Jangan mengedit migrasi yang sudah ter-deploy.
- **Rendering**: `cacheComponents` sengaja tidak dipakai; semua halaman dashboard dinamis per pengguna.
- **Form**: `TextField`/`MoneyField`/`Field` dari `src/components/forms.tsx`. ID input harus unik di satu halaman (TextField otomatis via `useId`; `Field` + input sendiri → beri `htmlFor`/`id` unik).
- **Komponen UI**: gaya shadcn/ui di `src/components/ui`. Warna status memakai token `status-*` dan selalu disertai ikon/teks.
- **Sebelum commit**: `pnpm lint && pnpm typecheck && pnpm test` (dan `pnpm test:db` bila menyentuh database).
