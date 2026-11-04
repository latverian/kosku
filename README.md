# Kosku

[![CI](https://github.com/latverian/kosku/actions/workflows/ci.yml/badge.svg)](https://github.com/latverian/kosku/actions/workflows/ci.yml)
![Next.js 16](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-3ecf8e)

**Kosku** is a property-management system for Indonesian boarding houses (_kos-kosan_). It automates monthly billing, sends WhatsApp payment reminders, reconciles payments, gives owners a real-time dashboard of who has and hasn't paid, and lets tenants pay, upload proof of transfer, and report maintenance issues from a personal link, with no app to install.

> The user interface is in **Bahasa Indonesia**, the language of its target users. Code, schema, and this README are in English. Product specifications live in [`specs/`](specs/) (Indonesian).

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Owner dashboard: monthly summary, room status grid, and action items" width="820">
</p>

<p align="center">
  <img src="docs/screenshots/dashboard-mobile.png" alt="Dashboard on mobile" width="260">
  &nbsp;
  <img src="docs/screenshots/tenant-portal.png" alt="Tenant portal: invoice, bank account, proof-of-payment upload" width="260">
  &nbsp;
  <img src="docs/screenshots/receipt.png" alt="Generated PDF receipt" width="260">
</p>

---

## Features

| Area                      | What it does                                                                                                                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rooms & tenants**       | Rooms grouped by floor (single or bulk create), 3-step check-in wizard with a live preview of the first invoice, check-out with deposit handling, room transfers, encrypted national ID numbers (AES-256-GCM), private ID-card photos                |
| **Billing**               | Invoices generated automatically N days before the due date. Cycle-based model with first-month proration, extra line items (electricity, laundry, discounts), automatic late fees with grace period and cap, overpayments carried forward as credit |
| **Payments**              | Record cash/transfer payments, verify or reject tenant-uploaded proofs in one tap, online payment via **Midtrans** (VA / QRIS / e-wallet) that marks invoices paid automatically                                                                     |
| **WhatsApp**              | Reminders at H-3, H, H+1, H+3, H+7 that stop once paid, payment confirmations, welcome messages, broadcasts, editable templates with live preview, quiet hours, retry with backoff, full message log                                                 |
| **Tenant portal**         | Personal signed link (revocable): outstanding invoices, copyable bank details, proof upload with in-browser image compression, payment history, PDF receipts, maintenance requests with photos, two-way chat, rating                                 |
| **Maintenance**           | Complaint tickets with priority, status workflow, technician assignment, repair cost booked as an expense, WhatsApp updates to the tenant                                                                                                            |
| **Finance**               | Cash-basis profit & loss per month, 12-month chart, accounts-receivable aging, expenses with receipt photos, **Excel and PDF export**, PDF invoices and receipts                                                                                     |
| **Team & multi-property** | Owner/manager roles with optional finance access, switch between properties from the header, row-level security on every table                                                                                                                       |

<p align="center">
  <img src="docs/screenshots/finance.png" alt="Finance: monthly profit and loss, income vs expenses chart, 12-month table" width="820">
</p>

## Tech stack

| Layer          | Choice                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------- |
| Framework      | Next.js 16 (App Router, Server Actions, React 19), TypeScript strict                      |
| Database       | PostgreSQL on Supabase, **Drizzle ORM**, hand-written triggers and **Row Level Security** |
| Auth & storage | Supabase Auth (password / magic link), Supabase Storage (private buckets, signed URLs)    |
| UI             | Tailwind CSS 4, shadcn/ui-style components, Recharts, light & dark mode, mobile-first     |
| Integrations   | Fonnte (WhatsApp), Midtrans Snap (payments), ExcelJS, React-PDF                           |
| Quality        | Vitest (unit + database integration), ESLint, Prettier, GitHub Actions CI                 |
| Hosting        | Vercel (app + cron), Supabase (database, auth, storage)                                   |

## Architecture highlights

- **Database as the last line of defence.** Invoice totals and statuses are maintained by Postgres triggers. Uniqueness constraints make invoice generation and reminders idempotent, and RLS scopes every query to properties the user belongs to. User requests run inside a transaction with `SET LOCAL ROLE authenticated`, so RLS applies even through the ORM.
- **Pure domain logic.** Billing cycles, proration, late fees, reminder scheduling, quiet hours, and template rendering are side-effect-free functions in `src/lib/` with exhaustive unit tests.
- **Thin server actions over a testable service layer.** `src/services/*` take a transaction handle and contain all data logic. Server actions only authenticate, validate with Zod, and call a service. The same services power cron jobs, webhooks, and tests.
- **Outbox for messaging.** Every WhatsApp message is written to a `messages` table first, then delivered by a worker with `FOR UPDATE SKIP LOCKED`, retries, and quiet-hour scheduling. Nothing is lost and everything can be resent.
- **Untrusted inputs are verified, not believed.** Payment webhooks are signature-checked _and_ re-confirmed against the Midtrans API, so the amount never comes from the notification body. Portal tokens are HMAC-derived and stored only as hashes, and file links are short-lived signed URLs.

## Getting started

**Requirements:** Node.js ≥ 20.9 and pnpm (`npm install -g pnpm`).

```bash
git clone https://github.com/latverian/kosku.git
cd kosku
pnpm install
cp .env.example .env.local
```

### Option A: with Supabase (recommended)

1. Create a free project at [supabase.com](https://supabase.com) (region: Singapore).
2. Copy the **Project URL** and **publishable/anon key** into `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Copy the **Transaction pooler** connection string into `DATABASE_URL` (replace `[YOUR-PASSWORD]`).
4. Under **Authentication → URL Configuration**, set the Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/confirm` as a redirect URL.
5. Apply migrations, start the app, and sign up at <http://localhost:3000/daftar>:
   ```bash
   pnpm db:migrate
   pnpm dev
   ```
6. _(Optional)_ Load the demo property "Kos Melati" with your account as owner:
   ```bash
   SEED_OWNER_EMAIL=you@example.com pnpm db:seed
   ```

### Option B: local PostgreSQL only (quick look)

Without Supabase, login is unavailable, but a **development preview mode** opens the dashboard as a given user (RLS still applies; never active in production).

```bash
# .env.local → DATABASE_URL=postgres://postgres:postgres@localhost:5432/kosku_dev
pnpm db:reset-local      # creates a Supabase-compatible auth shim + runs migrations (local DBs only)
psql "$DATABASE_URL" -c "insert into auth.users (email) values ('me@local.test') returning id"
SEED_OWNER_EMAIL=me@local.test pnpm db:seed
```

Set `KOSKU_DEV_PREVIEW_USER_ID=<returned id>` in `.env.local`, then run `pnpm dev`.

### Running locally without integrations

| Feature        | Behaviour without credentials                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| WhatsApp       | Messages are queued and printed to the server console instead of being sent                                                        |
| File uploads   | Stored in `.data/uploads` and served through HMAC-signed URLs                                                                      |
| Online payment | "Pay online" button is hidden                                                                                                      |
| Daily jobs     | Trigger manually with the **Buat tagihan sekarang** / **Kirim antrian sekarang** buttons, or `curl` the cron endpoints (see below) |

## Environment variables

See [`.env.example`](.env.example) for the full annotated list.

| Variable                                                    | Required   | Purpose                                                               |
| ----------------------------------------------------------- | ---------- | --------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅         | Supabase Auth                                                         |
| `DATABASE_URL`                                              | ✅         | Postgres connection (transaction pooler on Vercel)                    |
| `APP_URL`                                                   | ✅         | Public base URL used in emails, WhatsApp links, and payment redirects |
| `PORTAL_SECRET`                                             | ✅         | Derives tenant portal tokens (changing it invalidates all links)      |
| `SUPABASE_SERVICE_ROLE_KEY`                                 | production | Private file storage (server only)                                    |
| `CRON_SECRET`                                               | production | Authenticates cron endpoints                                          |
| `NIK_ENCRYPTION_KEY`                                        | optional   | Enables encrypted national ID storage (`openssl rand -base64 32`)     |
| `FONNTE_TOKEN`, `FONNTE_WEBHOOK_SECRET`                     | optional   | WhatsApp sending and delivery-status webhook                          |
| `MIDTRANS_SERVER_KEY`, `MIDTRANS_IS_PRODUCTION`             | optional   | Online payments                                                       |

## Scripts

| Command                                        | Description                                                                |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm dev`                                     | Start the development server                                               |
| `pnpm build` / `pnpm start`                    | Production build / serve                                                   |
| `pnpm lint` · `pnpm typecheck` · `pnpm format` | Code quality                                                               |
| `pnpm test`                                    | Unit tests (billing, scheduling, templates, crypto, gateways)              |
| `pnpm test:db`                                 | Database integration tests: triggers, RLS, services (needs `DATABASE_URL`) |
| `pnpm db:generate`                             | Create a migration after editing `src/db/schema.ts`                        |
| `pnpm db:migrate`                              | Apply migrations                                                           |
| `pnpm db:seed`                                 | Load demo data                                                             |
| `pnpm db:studio`                               | Browse the database                                                        |

## Background jobs

| Endpoint                  | Vercel schedule | Work                                                     |
| ------------------------- | --------------- | -------------------------------------------------------- |
| `/api/cron/daily`         | 07:00 WIB       | Generate invoices → apply late fees → schedule reminders |
| `/api/cron/send-messages` | 08:05 WIB       | Deliver queued WhatsApp messages (≤ 20 per call)         |

Both require `Authorization: Bearer $CRON_SECRET` (Vercel sends it automatically). Event notifications such as payment confirmations are also dispatched right after the action, outside quiet hours. Vercel's Hobby plan only allows daily crons. To deliver messages every 5 minutes, schedule the sender from Supabase with `pg_cron` + `pg_net`:

```sql
select cron.schedule('kosku-send-messages', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://YOUR-DOMAIN/api/cron/send-messages',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
  ) $$);
```

Run locally:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily
```

## Integrations

**WhatsApp (Fonnte).** Register a dedicated number at [fonnte.com](https://fonnte.com), copy the device token to `FONNTE_TOKEN`, then use **Pesan WA → Pengaturan → Kirim uji** to send a test message. Optional delivery-status webhook: `https://YOUR-DOMAIN/api/webhooks/fonnte?secret=$FONNTE_WEBHOOK_SECRET`.

**Payments (Midtrans).** Start in Sandbox: set `MIDTRANS_SERVER_KEY` and point **Settings → Payment → Notification URL** to `https://YOUR-DOMAIN/api/webhooks/payment`. Tenants then see a _Bayar online_ button in their portal.

**Storage.** Private buckets (`payment-proofs`, `complaint-photos`, `id-cards`, `receipts`) are created by migration `0005`. All access goes through the server with 10-minute signed URLs.

## Testing

```bash
pnpm test        # 70 unit tests
pnpm test:db     # 61 integration tests against PostgreSQL
```

The database suite runs against plain PostgreSQL using a small Supabase shim (`scripts/db/supabase-shim.sql`). It covers trigger-maintained invoice status, room capacity, RLS isolation between owners and managers, invoice idempotency, credit handling, the messaging outbox (quiet hours, retries, de-duplication), portal token revocation, gateway webhooks, finance reports across time-zone boundaries, and team permissions. CI runs both suites plus lint, typecheck, build, and a check that the schema has no un-generated migrations.

## Project structure

```
specs/                 Product specs: PRD, requirements, data model, architecture, UI, testing, roadmap
drizzle/               SQL migrations (generated + hand-written triggers/RLS/storage)
scripts/db/            Supabase shim for local/CI Postgres, local reset, demo-data cleanup
src/
  app/(auth)/          Login, sign-up, auth actions
  app/(dashboard)/     Owner/manager pages and server actions
  app/p/[token]/       Tenant portal
  app/api/             Cron jobs, webhooks, exports, PDFs, signed file access
  components/          UI primitives, forms, layout, charts
  db/                  Drizzle schema, connection helpers, seed
  lib/                 Pure domain logic (billing, messaging, finance, validation, crypto)
  server/              Server-only helpers: auth, context, uploads, exports
  services/            Data/service layer shared by actions, jobs, webhooks, and tests
tests/unit/            Vitest unit tests
tests/db/              Database integration tests
```

## Deployment

1. Import the repository at [vercel.com/new](https://vercel.com/new).
2. Add the environment variables above (without `KOSKU_DEV_PREVIEW_USER_ID`) and set `APP_URL` to your domain.
3. Add `https://YOUR-DOMAIN/auth/confirm` to Supabase **Authentication → URL Configuration**.
4. Run `pnpm db:migrate` against the production database.

> **Upgrading from the Phase 0 demo data:** the original demo property predates the "existing tenant" option, so the daily job would back-bill up to 20 months. Run [`scripts/db/hapus-data-contoh.sql`](scripts/db/hapus-data-contoh.sql) in the Supabase SQL editor (it only removes the `MLT` demo property), then `pnpm db:seed`.

## Documentation

| Document                                      | Contents                                                          |
| --------------------------------------------- | ----------------------------------------------------------------- |
| [01 — PRD](specs/01-PRD.md)                   | Problem, goals, personas, scope, prioritisation                   |
| [02 — Requirements](specs/02-requirements.md) | Functional & non-functional requirements with acceptance criteria |
| [03 — Tech stack](specs/03-tech-stack.md)     | Technology choices, alternatives, running costs                   |
| [04 — Database](specs/04-database.md)         | ERD, enums, tables, constraints, RLS                              |
| [05 — Architecture](specs/05-architecture.md) | Components, jobs, sequence diagrams, integrations, security       |
| [06 — UI/UX](specs/06-ui-design.md)           | Design principles, status colours, sitemap, wireframes            |
| [07 — Testing](specs/07-testing.md)           | Test strategy, required cases, definition of done                 |
| [08 — Roadmap](specs/08-roadmap.md)           | Phases and backlog                                                |

Contributor conventions (for humans and AI agents) are in [`AGENTS.md`](AGENTS.md). `.mcp.json` registers the Stitch design MCP server for Claude Code; its API key is read from the `STITCH_API_KEY` environment variable and is never committed.
