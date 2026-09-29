# Till

A point-of-sale web app for a small shop, running entirely on Cloudflare:
one Worker serves both the React build (Workers static assets) and the
`/api` routes (Express via `cloudflare:node`), backed by Cloudflare D1.

Currency is KES. **All money is stored as integer cents — never floats.**

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19 + Vite + TypeScript (strict) + Tailwind v4 + React Router |
| Backend | Express 5 on Workers via `httpServerHandler` from `cloudflare:node` |
| Database | Cloudflare D1 + Drizzle ORM, versioned migrations |
| Validation | Zod schemas in `src/shared`, shared by both sides |
| Config | `wrangler.jsonc` |

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars   # then edit SESSION_SECRET
```

Generate a secret:

```bash
node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
```

### Create the D1 database

```bash
npx wrangler d1 create till-db
```

Copy the printed `database_id` into `wrangler.jsonc`, replacing
`PLACEHOLDER_RUN_WRANGLER_D1_CREATE`. This is only needed for the remote
database; local development works without a real id.

### Migrations

The Drizzle schema in `src/worker/db/schema.ts` is the source of truth.
After changing it, generate SQL into `migrations/` and apply it:

```bash
npm run db:generate          # drizzle-kit generate
npm run db:migrate:local     # wrangler d1 migrations apply till-db --local
npm run db:migrate:remote    # same, against the live database
```

### Seed

```bash
npm run seed:gen             # writes seed.sql (PINs hashed with PBKDF2)
npm run db:seed:local
```

Seeded logins: `admin` / PIN `1234` and `cashier` / PIN `4321`.
The seed also creates 6 categories and 32 products with barcodes, one of
which starts below its low-stock threshold so the dashboard has something
to show.
Change these before deploying anywhere real.

### Run

```bash
npm run dev                  # vite build, then wrangler dev
```

`npm run dev` rebuilds the client once and then starts the Worker. The Worker
serves `dist/client` as static assets, so re-run it after frontend changes.

## Deploying

```bash
npx wrangler secret put SESSION_SECRET
npm run deploy
```

Do not set `ENVIRONMENT` in production — its absence is what makes the session
cookie `Secure`.

## Notes on Cloudflare constraints

These shaped the design and are worth knowing before changing things:

- **D1 has no interactive transactions.** A checkout cannot read stock, decide,
  then write inside one transaction. Instead `products.stock_qty` carries a
  `CHECK (stock_qty >= 0)` constraint, and the sale runs as a single `db.batch()`.
  An oversell violates the constraint, which aborts and rolls back the whole
  batch — so a sale and its stock deductions succeed or fail together.
- **Max 100 bound parameters per query**, so sale lines are inserted one
  statement per line inside the batch rather than as one wide `INSERT`.
- **Queries per Worker invocation: 50 on the free plan**, 1,000 on paid. This
  caps how many distinct lines a single checkout can carry.
- **`not_found_handling: "single-page-application"` bypasses the Worker**, which
  would swallow `/api/*` 404s. `run_worker_first: ["/api/*"]` forces API traffic
  through Express while everything else gets the SPA fallback.
- `nodejs_compat` at `compatibility_date >= 2025-09-01` implies
  `enable_nodejs_http_server_modules`, which `cloudflare:node` requires.

## Progress

- [x] Auth — username + PIN, PBKDF2, session cookie, role-based access
- [x] Products — CRUD, categories, barcode lookup, low-stock filter
- [ ] Sell screen and checkout
- [ ] Receipts
- [ ] Inventory
- [ ] Refunds and voids
- [ ] Reports
