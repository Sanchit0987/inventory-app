# Acme Inventory — full-stack inventory management demo

A Zoho-Inventory-inspired inventory management app with a modern SaaS UI.
Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · PostgreSQL 16 · Prisma 6.

**Verified working:** 56/56 end-to-end browser tests pass (`npm run test:e2e`),
production build clean, ESLint clean, stock-movement ledger reconciles exactly
with stock levels (0 mismatches, no negative stock). Coverage includes the
onboarding wizard, mobile navigation drawer, item detail editing, global-search
deep links, and every sub-tab workflow.

## Site structure (wireframe)

- **Onboarding wizard** after signup: company profile → first warehouse → first
  items (manual / CSV import / skip) → dashboard, with progress indicator and
  skippable optional steps.
- **Sidebar:** Dashboard · Items · Inventory · Sales · Purchases · Contacts ·
  Reports · Settings — collapsible, expandable submenus, mobile drawer.
- **Topbar:** warehouse selector (filters pages via `?wh=`), global search (`/`),
  quick-create menu, notifications, help, profile menu with sign-out.
- **Sub-tabs:** Inventory (stock / warehouses / transfers / adjustments /
  movements), Sales (orders / invoices / shipments / returns), Purchases
  (orders / goods received / bills / returns), Contacts (customers / suppliers),
  Settings (company / warehouses / users / categories / units / taxes / preferences).
- Legacy routes `/products`, `/invoices`, `/warehouses` redirect into the new structure.

## Features

| Area | What works |
| --- | --- |
| **Onboarding** | Step wizard with progress bar: company/business type/currency/timezone, warehouse, first item (manual or CSV import with opening stock), skip options |
| **Dashboard** | Date filter (7/30/90d), 4 summary cards (total items, inventory value, low-stock, open orders), sales/purchases headline w/ trend, revenue + stock-movement charts, alerts, activity, pending SO/PO lists, quick actions, first-run empty state |
| **Items** | Sortable/searchable/filterable table (image, name, SKU, category, warehouses, qty, price, status), CSV import + export, bulk archive/restore/delete with confirm dialog, inline price editing, pagination, detail page with stock by warehouse + movement history; form covers name/SKU/description/category/unit/barcode/cost/sell/tax/supplier/min-stock/opening stock |
| **Inventory** | Stock overview with on-hand / reserved (open SOs) / available / incoming (open POs) per warehouse, audited adjustments with reasons, bin locations, atomic transfers, full movement history, barcode/SKU scan lookup |
| **Purchases** | POs with line items, full/partial goods receipt (stock increases only on receipt), goods-received log, bills payable after receipt with mark-paid, supplier returns |
| **Sales** | Sales orders, fulfilment (stock deduction), shipments tab, invoicing with tax + overdue detection + mark-paid, sales returns (stock-in) |
| **Contacts** | Customers & suppliers tabs with outstanding balances, profile pages with order history, invoices/bills, and supplied items |
| **Reports** | Date + warehouse filters; valuation by category (pie + CSV), sales vs purchases, fast/slow movers (CSV), low-stock report (CSV), movement breakdown |
| **Notifications** | Low-stock / out-of-stock alerts raised + auto-cleared by the stock engine, pending-order reminders, unread badge, mark-all-read |
| **Settings** | Company profile, warehouses, users & roles, categories, units of measurement, taxes & currency, inventory preferences/notifications — all role-gated server-side |
| **Signup & admin approval** | Self-signup on the login page: staff joins instantly; "Request admin access" creates a PENDING account that cannot sign in, notifies existing admins (admin-only notification deep-linking to Settings → Users), where any admin approves (grants role, clears notification) or rejects (removes account) |

## Architecture

- `prisma/schema.prisma` — 18 models; stock quantities live in `StockLevel`
  (product × warehouse) and **every** change writes a signed `StockMovement`,
  so history always reconciles with current levels.
- `src/lib/stock.ts` — the stock engine: transactional `applyStockDelta`
  (refuses negative stock), alert raise/clear logic, document numbering.
- `src/actions/*` — server actions with Zod validation on every mutation;
  role gates via `requireRole`.
- `src/lib/auth.ts` + `src/middleware.ts` — JWT session cookie (jose, httpOnly),
  bcrypt password hashing, middleware-protected routes.
- `src/app/(app)/*` — one folder per module; server components fetch,
  client components handle tables/filters/modals.
- `e2e-test.mjs` — Playwright suite covering all core workflows.

## Production deployment

The app is production-hardened and ships with Docker artifacts:

```bash
# 1. configure secrets
cp .env.example .env
#    set POSTGRES_PASSWORD and AUTH_SECRET (openssl rand -base64 48) in .env

# 2. build and run (Postgres 16 + app, with health checks)
docker compose up -d --build

# 3. open http://localhost:3000 — the FIRST signup automatically becomes
#    an active admin on a fresh database, then runs the onboarding wizard.
```

Production hardening in place:

| Concern | Implementation |
| --- | --- |
| Secrets | `.env` gitignored; `src/lib/env.ts` fails boot on missing `DATABASE_URL`/`AUTH_SECRET`, weak (<32 char) or placeholder secrets |
| Schema | Versioned Prisma migrations (`prisma/migrations`), applied via `prisma migrate deploy` on container start — no `db push` in prod |
| Auth | httpOnly `secure` `sameSite=lax` JWT cookie; bcrypt; timing-safe login (dummy-hash compare on unknown emails); login rate limit 10/min/IP, signup 5/10min/IP |
| Bootstrap | First signup on an empty DB becomes an active admin (no seeded credentials required) |
| Demo accounts | One-click demo login buttons hidden unless `DEMO_MODE=true` |
| Document numbers | Atomic `DocCounter` upsert+increment — no duplicate SO/PO/INV numbers under concurrency |
| HTTP headers | `X-Frame-Options: DENY`, CSP frame-ancestors, nosniff, Referrer-Policy, Permissions-Policy, HSTS; `x-powered-by` removed |
| Ops | `/api/health` liveness+DB probe (public, used by compose healthcheck); standalone output; non-root container user |
| Errors | Global `error.tsx` (digest-only to clients) and branded 404 page |

Scaling note: the rate limiter is in-process. For multi-instance deployments put a
shared store (e.g. Redis) behind `src/lib/rate-limit.ts` and terminate TLS at your
load balancer so HSTS and secure cookies take effect.

## Running (local development)

Requires Node 20+ and PostgreSQL. This workspace has local copies in `../tools/`
(Node 24, embedded PostgreSQL 16 on port 54329 — start it with
`../tools/pg/bin/pg_ctl -D ../tools/pg/data -o "-p 54329" start`).

```bash
npm install
npm run db:push    # create schema
npm run db:seed    # realistic demo data (24 products, ~100 orders, 90 days history)
npm run build && npm start   # production — or: npm run dev
npm run test:e2e   # browser test suite (expects server on :4731)
```

`.env` defaults to `postgresql://postgres@localhost:54329/postgres`.

## Demo accounts (one-click buttons on the login page)

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@acme.io | admin1234 |
| Manager | manager@acme.io | manager1234 |
| Staff | staff@acme.io | staff1234 |

## Notes & limits (demo scope)

- Product "images" are emoji picks — no file upload/object storage.
- Scan lookup takes keyboard-wedge scanner input (or manual entry); no camera decoding.
- Document numbers use count-based sequences — fine for a demo, a production
  system would use DB sequences.
- Single-currency pricing; currency setting changes the display symbol/code.
