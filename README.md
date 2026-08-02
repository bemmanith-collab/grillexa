# Grillexa — Consignment, Billing & Stock

Stock and billing for a distributed retail business (sprouts, fruit bowls, bananas) supplying 50+ kirana stores. Goods go out to a store **on consignment** — not a sale until the store settles and says what actually sold. Also handles cash sales to walk-in customers, returns, wastage, and a daily per-store ledger.

- **Backend**: Node.js + Express, Prisma ORM, JWT in an httpOnly cookie, bcrypt
- **Frontend**: React (Vite), installable as an Android app (PWA)
- **Database**: PostgreSQL
- **Hosted**: Fly.io, region `sin`

## The consignment model

This is the core of the app. Everything else supports it.

1. **Deliver to Store** — goods go to a store on consignment. A Consignment Note is raised with line items and prices. **No revenue is recognised.** The stock is now sitting in the store, still owned by you.
2. **Settle Consignment** — opens on everything still awaiting settlement, however old, across every store the account can see; a second view adds the settled ones so a recent settlement can be corrected. Later, the store reports what sold and what is coming back unsold. Settling generates a **Sale** for the sold portion (this is where revenue and GST are recognised) and a **Return** for the unsold portion. A consignment can be settled in more than one pass; `soldQty + returnedQty` can never exceed `deliveredQty`, and the database enforces that with a CHECK constraint.
3. **Direct Sale** — a cash bill straight to a walk-in customer. Billed and paid immediately, no consignment behind it. Can include RETURN lines, which credit the customer and subtract from the bill.

`Dispatches` is the pre-consignment HQ→store transfer flow. It is read-only history; new deliveries go through Deliver to Store.

## How the ledger works, and what it is not

Every (date, store, product) has one row:

```
opening → + received → − sold → − wastage → closing
```

`closing` carries into the next day's `opening`, and a write to a past date re-chains every later day forward.

**`opening` and `closing` are not displayed anywhere, deliberately.** Goods are never booked into the system before they are billed, so the running balance drifts negative as a matter of course and describes nothing real. What the business actually works from is **`consignmentQty`** — how much of a store's stock is still out on consignment, delivered but not yet settled.

The per-day movements (`received`, `sold`, `wastage`) *are* real: each one is a delivery, a bill, or a recorded wastage. Those are what the UI shows.

**Today's Stock opens on all stores at once** (`GET /api/stock/today?storeId=all`) — one row per product totalled across every store in scope, plus how many stores have reported today and the day's direct-sale takings. Someone who supplied thirty stores wants one sheet, not thirty. Picking a single store switches to that store's ledger rows. The all-stores view is read-only: unlike the single-store view it does not auto-create today's rows, because that would write products × stores rows on every page load.

`backend/scripts/recompute-ledger.js` rebuilds `opening`/`closing` from the recorded movements and `consignmentQty` from the consignment tables. Dry run by default; `--apply` writes in one transaction.

## Prices

Unit prices are resolved **server-side from the product catalogue** (`backend/src/lib/pricing.js`), never trusted from the request. `GET /api/products` hides `price` from Sales accounts, so a Sales user's form has nothing to send back — trusting the client meant bills saved at ₹0.00 with stock correctly deducted and no error. Admin and Manager may override a price for a negotiated rate; a Sales account gets the catalogue price. Negative prices and fractional quantities are rejected.

**Editing a bill keeps the prices it already charged.** A correction to a phone number must not silently reprice the goods — the bill keeps its number, so a printed copy in someone's hand has to keep matching it. The old prices are read from the saved bill, never from the request, so an edit cannot smuggle a price past the Sales rule; a product added to the bill for the first time prices from the catalogue.

## Roles & permissions

| Action | Admin | Manager | Sales |
|---|:--:|:--:|:--:|
| Today's Stock, Stock History | ✅ any store | ✅ any store | ✅ own stores |
| Deliver to Store (create / edit consignment) | ✅ any | ✅ any | ✅ own stores |
| Settle Consignment (incl. edit last settlement) | ✅ any | ✅ any | ✅ own stores |
| Direct Sale (create / **edit** a bill) | ✅ any | ✅ any | ✅ own stores |
| Record wastage, record returns | ✅ any | ✅ any | ✅ own stores |
| See product prices | ✅ | ✅ | ❌ |
| Reports (P&L, product sales) | ✅ | ✅ | ❌ |
| Dispatches (historical) | ✅ | ✅ | ❌ |
| Add / edit products | ✅ | ✅ | ❌ |
| Delete products | ✅ | ❌ | ❌ |
| Manage stores | ✅ | ❌ | ❌ |
| Manage users, reset passwords | ✅ | ❌ | ❌ |
| Change own password | ✅ | ✅ | ✅ |
| Store list | ✅ all, with staff | ✅ all, with staff | own stores, no staff names |

Enforced **server-side**, not merely hidden in the UI. Role and store assignments are re-read from the database on *every* request rather than trusted from the JWT, so a change takes effect immediately instead of at next login.

A Sales account can be assigned **several** stores. **There is no public signup** — an Admin creates every account from the Users page.

A Direct Sale bill can be corrected after the fact (`PATCH /api/sales/:id`): the original's stock effect is reversed and the corrected version applied, keeping the same bill number so a printed copy still matches. Bills generated by settling a consignment are refused — edit those from Settle Consignment, so the settlement and the consignment counters stay in agreement.

## Sessions & browser hardening

The session is a JWT in an **httpOnly cookie** (`grillexa_session`), not a Bearer token in `localStorage` — no script on the page can read it, the app's own or one injected through an XSS. `sameSite: strict` is the CSRF defence; `secure` is set in production only, because local dev has no TLS. `POST /api/auth/logout` clears it server-side: a browser cannot delete a cookie it cannot read, so logout used to be a claim the client made about itself.

`/api/auth` is rate-limited to 30 requests per 15 minutes, **counting failures only** — a whole shop shares one connection, and staff signing in successfully must never eat the budget that stops someone guessing passwords. `trust proxy` is set so the limiter sees the real client via Nginx's `X-Forwarded-For` instead of counting everyone as `127.0.0.1`.

Security headers and the CSP are set **once, by Nginx**, for everything including proxied API responses (`nginx.conf`). helmet was tried and removed: it duplicated every header and disagreed with one of them, sending both `X-Frame-Options: SAMEORIGIN` and `DENY`. Node is only reachable through Nginx, so one source is correct and two is a bug waiting to happen.

`script-src` is `'self'` with no `'unsafe-inline'`. That is only possible because `index.html` carries no inline script at all — hence `frontend/public/boot.js` (install-prompt capture and boot diagnostics) and `legacy.js` (the "this browser is too old" message for engines that ignore ES modules). Anything added inline to `index.html` will be blocked in production and work fine in dev, which is the worst way to find out.

## Project structure

```
grillexa/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma   User, Store, Product, DailyStockEntry,
│   │   │                   Consignment(+Item), Settlement(+Line),
│   │   │                   Sale(+Line), Return,
│   │   │                   DispatchInvoice(+Line)
│   │   ├── migrations/     10 migrations
│   │   └── seed.js         local only — refuses to run with NODE_ENV=production
│   ├── scripts/
│   │   └── recompute-ledger.js   ledger repair, dry run unless --apply
│   ├── src/
│   │   ├── lib/         stock.js (ledger + cascade), pricing.js (catalogue
│   │   │                prices), scope.js (store access)
│   │   ├── middleware/  auth.js (cookie session), role.js
│   │   ├── routes/      auth, users, products, stores, stock, consignments,
│   │   │                sales, returns, dispatches, reports, quotes
│   │   ├── data/        grillingQuotes.js
│   │   ├── app.js       CORS, cookie parser, login rate limit, route mounting
│   │   ├── db.js
│   │   └── index.js
│   ├── test/            crash-guards.js, stock-cascade.js, stock-rollup.js,
│   │                    pricing.js, consignment-list.js   (npm test)
│   └── .env.example
├── frontend/
│   ├── public/          manifest.json, sw.js, icons (PWA), boot.js and
│   │                    legacy.js (external so the CSP can ban inline script)
│   ├── src/
│   │   ├── api/client.js         axios, withCredentials, 401 → /login
│   │   ├── context/AuthContext.jsx
│   │   ├── components/  Sidebar (browser tab gets the website nav, installed
│   │   │                app gets the tab bar), DatePager, LineItemsForm,
│   │   │                BillDetailModal, WastageModal, StockDetailModal,
│   │   │                StoreAssignModal, ChangePasswordModal,
│   │   │                ResetPasswordModal, InstallAppButton, DailyWisdom,
│   │   │                ProtectedRoute, RouteErrorBoundary, Toast, Spinner,
│   │   │                EmptyState, icons.jsx
│   │   ├── lib/         businessInfo.js, invoice.js (jsPDF), format.js,
│   │   │                greeting.js, reorder.js, returnReasons.js
│   │   ├── utils/date.js         business-timezone "today"
│   │   └── pages/       Login, Inventory (Today's Stock), DeliverToStore,
│   │                    SettleConsignment, DirectSale, Sales, Dispatches,
│   │                    Products, StockHistory, Reports, Stores, Users
│   ├── test/            invoice.js, greeting.js   (npm test)
│   └── vite.config.js   dev proxy, build target down to iOS 14
├── Dockerfile        production image for Fly (backend + frontend + Nginx)
├── entrypoint.sh     runs `prisma migrate deploy`, then Node + Nginx
├── nginx.conf        production Nginx — serves the SPA, proxies /api and
│                     /health, and sets every security header and the CSP
├── fly.toml          Fly config — region sin, internal_port 4000
├── docker-compose.yml  local Postgres only
└── README.md
```

Fly builds **only** the root `Dockerfile`, `nginx.conf` and `entrypoint.sh`. There are no other Dockerfiles or nginx configs; earlier duplicates under `backend/` and `frontend/` were removed because editing the wrong one silently did nothing.

## Local development

Node 20+ and a reachable Postgres. `docker compose up -d` starts one on `localhost:5432`.

```bash
cd backend
cp .env.example .env        # set DATABASE_URL and JWT_SECRET
npm install
npx prisma migrate deploy
npm run seed                # optional demo data
npm run dev                 # http://localhost:4000
npm test                    # no database needed
```

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

To check UI changes on a phone over the LAN without running Postgres locally, point the dev server at the deployed API:

```bash
VITE_API_PROXY=https://grillexa.fly.dev npm run dev
```

That talks to the **real database** — browse freely, but don't test billing through it.

### Seed data

`npm run seed` creates a demo catalogue, six sample stores, and logins with the password `ChangeMe123!` (`admin@grillexa.local`, `manager@grillexa.local`, one per store). It also backfills 14 days of randomised history.

It **refuses to run when `NODE_ENV=production`**, because `npm run seed` picks up whatever `DATABASE_URL` is in the environment. Delete or change these accounts before any real use.

## Deploying to Fly.io

```bash
flyctl deploy -a grillexa      # from the repo root — fly.toml points at ./Dockerfile
```

`entrypoint.sh` runs `prisma migrate deploy` on every container start, before Nginx binds. A migration that fails therefore stops the app from starting: it will not roll back on its own, and needs `flyctl ssh console` and `npx prisma migrate resolve`. Before deploying anything with a migration, know your restore path:

```bash
flyctl mpg list --org personal                 # cluster id
flyctl mpg backup list <cluster-id>            # continuous automated backups
flyctl mpg restore --help
```

Database is Fly Managed Postgres (`grillexa-db`, region `sin`, Basic plan), with continuous automated backups. The app image is stateless and holds no volume, so replacing the machine cannot lose data.

`min_machines_running = 1` is deliberate: a cold boot is ~26 seconds because `prisma migrate deploy` runs before Nginx binds, and once the app is installed to a phone home screen that delay is a blank splash screen.

## Installing on a phone

The app is a PWA. On **Android**, Chrome offers **Install app** — there is also a button inside the app under **More**. It installs as a real WebAPK: home-screen icon, no address bar, and it updates itself on deploy. No store account, no APK to distribute.

On **iPhone** there is no install prompt in any browser (they are all WebKit); use **Safari → Share → Add to Home Screen**.

The login greeting is worth knowing about here: the installed app starts at `/` and restores its session from the cookie rather than logging in, so greeting on login alone meant the people who use the app most never saw one. It now also greets on the first open of the day per device (`grillexa_greeted_on` in `localStorage`), and an explicit login always greets.

The service worker caches nothing, deliberately — this app writes bills, and a cached page showing yesterday's consignments as current is worse than a plain connection error.

## Environment variables (backend)

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string. A Fly secret in production, never committed |
| `JWT_SECRET` | Signing secret. The app refuses to start without it |
| `JWT_EXPIRES_IN` | Token lifetime, default `8h` |
| `PORT` | Node's port — `4000` locally, `4001` inside the Fly image where Nginx owns `4000` |
| `CORS_ORIGIN` | Comma-separated allowed origins. Unset means "reflect the caller's origin" — a literal `*` is illegal alongside the credentialed cookie, so the config sends back the caller instead. Not needed on Fly, where Nginx serves the app and API from one origin |
| `NODE_ENV` | `production` in the Fly image. Sets `secure` on the session cookie, and makes `npm run seed` refuse to run |
| `BUSINESS_UTC_OFFSET_MINUTES` | Business day offset, default `330` (IST). Both the server and the browser resolve "today" with this, so a device in another timezone can't disagree with the ledger |

Read from the environment or `.env`. One exception worth knowing: the business's own name, address and FSSAI licence number are hardcoded in `frontend/src/lib/businessInfo.js` because they are printed on every invoice. Not secret, but they are per-business and would need changing for anyone else.

## API overview

| Method | Path | Access |
|---|---|---|
| POST | `/api/auth/login` | Public — sets the session cookie, rate-limited |
| POST | `/api/auth/logout` | Public — clears the session cookie |
| GET | `/api/auth/me` | Authenticated |
| POST | `/api/auth/change-password` | Authenticated |
| GET/POST/PATCH/DELETE | `/api/users`, `/api/users/:id` | Admin |
| GET | `/api/products` | Authenticated (price hidden from Sales) |
| POST/PATCH | `/api/products`, `/api/products/:id` | Admin, Manager |
| DELETE | `/api/products/:id` | Admin |
| GET | `/api/stores` | Authenticated — Sales sees only its own stores, without staff names |
| POST/PATCH/DELETE | `/api/stores`, `/api/stores/:id` | Admin |
| GET | `/api/stock/today?storeId=&date=` | Authenticated, store-scoped. `storeId=all` totals every store in scope |
| GET | `/api/stock/history?storeId=&productId=&from=&to=` | Authenticated, store-scoped |
| POST | `/api/stock/:storeId/:productId/wastage` | Authenticated, store-scoped |
| GET | `/api/consignments`, `/api/consignments/:id` | Authenticated, store-scoped. Unfiltered returns the newest 200; `?status=` returns every match |
| GET | `/api/consignments/latest/:storeId` | Authenticated, store-scoped |
| POST/PATCH | `/api/consignments`, `/api/consignments/:id` | Admin, Manager, Sales |
| POST | `/api/consignments/:id/settle` | Admin, Manager, Sales |
| PATCH | `/api/consignments/:id/settlements/:settlementId` | Admin, Manager, Sales |
| GET | `/api/sales`, `/api/sales/:id`, `/api/sales/latest/:storeId` | Authenticated, store-scoped |
| POST/PATCH | `/api/sales`, `/api/sales/:id` | Admin, Manager, Sales |
| GET/POST | `/api/returns` | Authenticated, store-scoped |
| GET | `/api/dispatches`, `/api/dispatches/:id` | Admin, Manager |
| POST | `/api/dispatches` | Admin, Manager |
| GET | `/api/reports/summary`, `/pnl?days=`, `/product-sales?days=` | Admin, Manager |
| GET | `/api/quotes/random` | Authenticated |

## Tests

```bash
cd backend && npm test
cd frontend && npm test
```

No framework, no database, no browser — plain Node scripts that print `ok` lines.

Backend, five files:

- `test/crash-guards.js` — malformed request bodies return 400 rather than killing the process (an unhandled rejection in an async handler exits Node on Express 4), `todayStr` is ISO and round-trips, and public signup stays gone.
- `test/stock-cascade.js` — the ledger cascade against an in-memory Prisma stub: back-dated writes re-chain later days, moving a document between dates leaves nothing behind, and reversing a bill restores stock exactly.
- `test/stock-rollup.js` — the all-stores sheet's arithmetic: every product gets a row even with no movement, day totals add up across stores, and consignment units come from the open consignments rather than a carried-forward balance — so the units column and the value card can't drift apart.
- `test/pricing.js` — prices come from the catalogue, a Sales account cannot override one, an edit keeps what the bill already charged, and a product new to the bill prices from the catalogue.

- `test/consignment-list.js` — who sees which consignments, and how many: a manager or admin is never store-scoped (with or without a status filter), a Sales account always is, and the outstanding list is never truncated while the history list still is.

Frontend, two files:

- `test/greeting.js` — the login greeting's name and time-of-day boundaries. Everyone who logs in sees it, and a greeting can't fail, only be wrong.
- `test/invoice.js` — a Consignment Note never calls itself an invoice. Both renderers (the WhatsApp text and the PDF) are checked against the same `documentOptions`, the PDF by building it in Node with jsPDF and reading the labels back out of the finished document.
