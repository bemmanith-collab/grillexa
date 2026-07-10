# Grillexa — Multi-Store Stock & Sales Management

A full-stack stock management app for a distributed retail business (sprouts, fruit bowls, etc.) selling through 20+ retail stores. Tracks a daily per-store stock ledger, generates dispatch invoices (HQ → store) and retail sales bills (store → customer), and surfaces per-store product recommendations.

- **Backend**: Node.js + Express, Prisma ORM, JWT auth, bcrypt password hashing
- **Frontend**: React (Vite)
- **Database**: SQLite by default (zero setup) — swappable to PostgreSQL, see below

## How stock is tracked

Every (date, store, product) combination has one ledger row:

```
opening → + received (from dispatch invoices) → − sold (from sales bills) → − wastage → closing
```

`closing` becomes next day's `opening` automatically. Three things move the ledger:

1. **Dispatch Invoice** — Admin/Manager sends stock from HQ to a store (a "bill" with line items, quantities and unit price). Increases `received`.
2. **Sale Bill** — a store bills a customer (line items, quantities, retail price). Increases `sold`. Rejected outright if any line would oversell the day's available stock.
3. **Wastage entry** — a store records spoiled/discarded/returned stock for the day. Increases `wastage`.

## Roles & permissions

| Action                                  | Admin | Manager | Sales (store staff) |
|-------------------------------------------|:-----:|:-------:|:--------------------:|
| View today's stock / stock history         | ✅ (any store) | ✅ (any store) | ✅ (own store only) |
| View product catalog price                 | ✅    | ✅      | ❌ |
| View reports & recommendations             | ✅    | ✅      | ❌ |
| Create Dispatch Invoice (send stock to store) | ✅ | ✅      | ❌ |
| Create Sale Bill                            | ✅ (any store) | ✅ (any store) | ✅ (own store only) |
| Record wastage                              | ✅ (any store) | ✅ (any store) | ✅ (own store only) |
| Add/edit products                           | ✅    | ✅      | ❌ |
| Delete products                             | ✅    | ❌      | ❌ |
| Manage stores                               | ✅    | ❌      | ❌ |
| Manage users (add/edit role & store/delete) | ✅    | ❌      | ❌ |

Every one of these rules is enforced **server-side**, not just hidden in the UI. Role and store assignment are re-read from the database on *every* request (not cached in the JWT), so if an admin changes someone's role or store, it takes effect immediately — not just after their next login.

Sales accounts are locked to exactly one store (`storeId` on the user). New public signups start as unassigned Sales accounts; an Admin assigns them to a store (and can promote to Manager/Admin) from the Users page.

## Project structure

```
grillexa/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma     User, Store, Product, DailyStockEntry,
│   │   │                     DispatchInvoice(+Line), Sale(+Line)
│   │   └── seed.js
│   ├── src/
│   │   ├── lib/          stock.js (ledger math), scope.js (store access)
│   │   ├── middleware/   auth.js, role.js
│   │   ├── routes/       auth, users, products, stores, stock,
│   │   │                 dispatches, sales, reports
│   │   ├── app.js
│   │   └── index.js
│   ├── .env.example
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/client.js
│   │   ├── context/AuthContext.jsx
│   │   ├── components/   Sidebar, ProtectedRoute, LineItemsForm,
│   │   │                 BillDetailModal, WastageModal
│   │   └── pages/        Login, Signup, Inventory (Today's Stock),
│   │                     Dispatches, Sales, StockHistory, Reports,
│   │                     Users, Stores
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

## Local development (no Docker)

Requires Node.js 20+.

**1. Backend**

```bash
cd backend
cp .env.example .env       # edit JWT_SECRET before deploying anywhere real
npm install
npx prisma migrate dev --name init
npm run seed
npm run dev                 # http://localhost:4000
```

**2. Frontend** (in a second terminal)

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

Open http://localhost:5173. The seed script creates the product catalog (Green Sprouts, Mixed Sprouts, Single Fruit Bowl, Mixed Fruit Bowl), six sample stores, and one login per store plus HQ roles (password `ChangeMe123!` for all):

| Email                          | Role    | Store |
|---------------------------------|---------|-------|
| admin@grillexa.local            | Admin   | — |
| manager@grillexa.local          | Manager | — |
| mgroadstore@grillexa.local      | Sales   | MG Road Store |
| koramangalastore@grillexa.local | Sales   | Koramangala Store |
| indiranagarstore@grillexa.local | Sales   | Indiranagar Store |
| whitefieldstore@grillexa.local  | Sales   | Whitefield Store |
| hsrlayoutstore@grillexa.local   | Sales   | HSR Layout Store |
| jayanagarstore@grillexa.local   | Sales   | Jayanagar Store |

The seed also backfills 14 days of demo dispatch/sales/wastage history so Reports and Stock History aren't empty on first login. Add your remaining stores from the **Stores** page (Admin) and create the rest of your store staff logins from the **Users** page.

Change these passwords (or delete the seeded accounts) before using this anywhere beyond local testing.

## Running with Docker

```bash
docker compose up --build
```

- Frontend: http://localhost:8080
- Backend API: http://localhost:4000

The SQLite database file is persisted in a named Docker volume (`backend_data`), so data survives container restarts. On first boot the backend runs `prisma migrate deploy` automatically; run the seed manually once if you want the sample data:

```bash
docker compose exec backend npm run seed
```

Set a real `JWT_SECRET` before deploying anywhere reachable by others:

```bash
JWT_SECRET="$(openssl rand -hex 32)" docker compose up --build -d
```

## Switching to PostgreSQL

The app ships with SQLite for zero-setup local dev, but Prisma makes swapping databases a two-line change:

1. In `backend/prisma/schema.prisma`, change the datasource provider:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Point `DATABASE_URL` at your Postgres instance, e.g.:
   ```
   DATABASE_URL="postgresql://user:password@localhost:5432/grillexa"
   ```
3. Re-run `npx prisma migrate dev --name init` to generate fresh migrations for Postgres.

No application code changes are needed — the schema avoids Postgres/SQLite-specific features (enums are modeled as plain strings, validated in the route handlers) so it works identically on either database.

## Environment variables (backend)

| Variable         | Description                                      |
|-------------------|--------------------------------------------------|
| `DATABASE_URL`    | Prisma connection string (SQLite file or Postgres URL) |
| `JWT_SECRET`      | Secret used to sign JWTs — must be a long random string in production |
| `JWT_EXPIRES_IN`  | Token lifetime, e.g. `8h`                         |
| `PORT`            | Port the API listens on (default `4000`)          |
| `CORS_ORIGIN`     | Allowed origin for browser requests               |

All of these are read from the environment / `.env` file — nothing sensitive is hardcoded.

## API overview

| Method | Path                                    | Access                          |
|--------|-------------------------------------------|----------------------------------|
| POST   | `/api/auth/signup`                        | Public (creates unassigned Sales user) |
| POST   | `/api/auth/login`                         | Public                           |
| GET    | `/api/auth/me`                            | Authenticated                    |
| GET/POST/PATCH/DELETE | `/api/users`, `/api/users/:id`   | Admin                            |
| GET    | `/api/products`                           | Authenticated (price hidden for Sales) |
| POST/PATCH `/api/products`, `/api/products/:id` | Admin, Manager     |
| DELETE | `/api/products/:id`                       | Admin                            |
| GET/POST/PATCH `/api/stores`, `/api/stores/:id` | GET: Authenticated · POST/PATCH: Admin |
| GET    | `/api/stock/today?storeId=`               | Authenticated, store-scoped for Sales |
| GET    | `/api/stock/history?storeId=&productId=&from=&to=` | Authenticated, store-scoped for Sales |
| POST   | `/api/stock/:storeId/:productId/wastage`  | Authenticated, store-scoped for Sales |
| GET/POST `/api/dispatches`                | GET: store-scoped read for Sales · POST: Admin, Manager |
| GET    | `/api/dispatches/:id`                     | Authenticated, store-scoped for Sales |
| GET/POST `/api/sales`                     | Authenticated, store-scoped for Sales |
| GET    | `/api/sales/:id`                          | Authenticated, store-scoped for Sales |
| GET    | `/api/reports/summary`                    | Admin, Manager                   |
| GET    | `/api/reports/recommendations?days=`      | Admin, Manager                   |
