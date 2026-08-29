// Everything that touches the database or the network.
//
// Kept apart from analysis.js so the rules stay testable without either. This
// half is thin on purpose: read rows, shape them, hand them to the maths.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '../../../backend');

// Read the backend's .env rather than asking anyone to keep a second copy of
// DATABASE_URL in step. A tiny parser instead of dotenv: one dependency less,
// and the file only ever holds KEY=value lines.
function loadBackendEnv() {
  const file = path.join(BACKEND, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;
    // Anything already in the environment wins, so a Claude Code `env` block or
    // a shell export can point this at another database without editing files.
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

let prisma;
export function db() {
  if (prisma) return prisma;
  loadBackendEnv();
  if (!process.env.DATABASE_URL) {
    throw new Error(
      `No DATABASE_URL. Expected it in ${path.join(BACKEND, '.env')} or the environment.`
    );
  }
  // Resolved out of the backend's node_modules deliberately. This server has no
  // schema of its own: sharing the generated client means it can never drift
  // from the migrations the app actually runs, and there is no second
  // `prisma generate` to forget.
  const backendRequire = createRequire(path.join(BACKEND, 'package.json'));
  const { PrismaClient } = backendRequire('@prisma/client');
  prisma = new PrismaClient();
  return prisma;
}

export async function disconnect() {
  if (prisma) await prisma.$disconnect();
}

const DAY_MS = 86400000;

/**
 * Every store, with what it actually takes per trading day.
 *
 * Revenue is divided by the days that store recorded a sale, not by the length
 * of the reporting window — a shop that opened last week should not read as
 * failing because it has no January.
 */
export async function loadStores() {
  const p = db();
  const [stores, sales] = await Promise.all([
    p.store.findMany({
      select: { id: true, name: true, address: true, lat: true, lng: true, accuracyM: true },
      orderBy: { id: 'asc' },
    }),
    p.sale.findMany({ select: { storeId: true, date: true, totalAmount: true } }),
  ]);

  const byStore = new Map();
  for (const s of sales) {
    const row = byStore.get(s.storeId) || { revenue: 0, count: 0, days: new Set(), min: null, max: null };
    row.revenue += s.totalAmount || 0;
    row.count += 1;
    row.days.add(s.date.toISOString().slice(0, 10));
    if (!row.min || s.date < row.min) row.min = s.date;
    if (!row.max || s.date > row.max) row.max = s.date;
    byStore.set(s.storeId, row);
  }

  return stores.map((s) => {
    const agg = byStore.get(s.id);
    const tradingDays = agg ? agg.days.size : 0;
    return {
      ...s,
      revenue: agg ? Math.round(agg.revenue * 100) / 100 : 0,
      salesCount: agg ? agg.count : 0,
      tradingDays,
      // Guarded against the one-sale-one-day store reading as a star.
      dailyRevenue: tradingDays > 0 ? Math.round((agg.revenue / tradingDays) * 100) / 100 : 0,
      firstSale: agg?.min ? agg.min.toISOString().slice(0, 10) : null,
      lastSale: agg?.max ? agg.max.toISOString().slice(0, 10) : null,
    };
  });
}

/** Network-wide figures a pitch can quote, and the window they came from. */
export async function loadNetwork() {
  const p = db();
  const [agg, lines] = await Promise.all([
    p.sale.aggregate({ _count: true, _sum: { totalAmount: true }, _min: { date: true }, _max: { date: true } }),
    p.saleLine.groupBy({ by: ['productId'], _sum: { quantity: true, amount: true } }),
  ]);
  const products = await p.product.findMany({ select: { id: true, name: true } });
  const nameOf = new Map(products.map((x) => [x.id, x.name]));

  return {
    salesCount: agg._count,
    revenue: Math.round((agg._sum.totalAmount || 0) * 100) / 100,
    salesWindow: agg._min.date
      ? { from: agg._min.date.toISOString().slice(0, 10), to: agg._max.date.toISOString().slice(0, 10) }
      : null,
    windowDays: agg._min.date ? Math.max(1, Math.round((agg._max.date - agg._min.date) / DAY_MS) + 1) : 0,
    topProducts: lines
      .sort((a, b) => (b._sum.amount || 0) - (a._sum.amount || 0))
      .slice(0, 5)
      .map((l) => ({ name: nameOf.get(l.productId) || `#${l.productId}`, units: l._sum.quantity || 0 })),
  };
}

/**
 * What this answer is standing on.
 *
 * Every tool returns this. A growth number is only as good as the rows under
 * it, and the rows under this network are currently thin in ways a reader
 * cannot see from the number alone — so the number never travels without them.
 */
export function assessData(stores, network) {
  const geocoded = stores.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  const selling = stores.filter((s) => s.salesCount > 0);
  const sellingWithoutPin = selling.filter((s) => !Number.isFinite(s.lat));
  const warnings = [];

  if (geocoded.length === 0) {
    warnings.push('No store has coordinates, so nothing on this network can be placed on a map. Run backfill_store_coordinates first.');
  } else if (geocoded.length < 3) {
    warnings.push(`Only ${geocoded.length} of ${stores.length} stores have coordinates, so every distance and gap below is drawn from ${geocoded.length} point(s). Run backfill_store_coordinates to widen it.`);
  }

  if (sellingWithoutPin.length > 0) {
    warnings.push(`${sellingWithoutPin.length} store(s) have sales but no coordinates (${sellingWithoutPin.map((s) => s.name).join(', ')}), so their trade is invisible to any location question.`);
  }

  if (network.salesCount === 0) {
    warnings.push('No sales are recorded at all, so there is no revenue evidence to quote.');
  } else if (network.windowDays < 30) {
    warnings.push(`All ${network.salesCount} sales fall in a ${network.windowDays}-day window (${network.salesWindow.from} to ${network.salesWindow.to}) — too short to read as a monthly run rate.`);
  }

  return {
    storesTotal: stores.length,
    storesGeocoded: geocoded.length,
    storesSelling: selling.length,
    salesCount: network.salesCount,
    salesWindow: network.salesWindow,
    windowDays: network.windowDays,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Nominatim — the same free geocoder the app already uses
// ---------------------------------------------------------------------------

// Matches backend/src/lib/geocode.js. Nominatim's usage policy asks for an
// agent that identifies the application; sending a different one from a second
// process is how a project gets itself rate-limited under one name and blocked
// under another.
const USER_AGENT = 'grillexa/1.0 (https://grillexa.fly.dev; stock and billing for retail stores)';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const TIMEOUT_MS = 8000;

// One request per second, as the policy requires. The backfill walks every
// store, so without this the very first useful run is the one that gets the
// project blocked.
let lastCall = 0;
async function polite() {
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

async function nominatim(params) {
  await polite();
  const res = await fetch(`${NOMINATIM}?${params}&format=json&addressdetails=1&countrycodes=in`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

/** A city's bounding box, so a search area is the real city rather than a guess. */
export async function cityBounds(city) {
  const rows = await nominatim(`q=${encodeURIComponent(city)}&limit=1`);
  const row = rows[0];
  if (!row?.boundingbox) return null;
  const [minLat, maxLat, minLng, maxLng] = row.boundingbox.map(Number);
  if (![minLat, maxLat, minLng, maxLng].every(Number.isFinite)) return null;
  return { minLat, maxLat, minLng, maxLng, label: String(row.display_name || city) };
}

/**
 * Best-guess coordinates for a store from its address.
 *
 * `near` biases the search: "Adyar" alone matches places in several states, and
 * the right one is the one near the rest of the network. Returns null rather
 * than a low-confidence guess — a wrong pin is worse than no pin, because it
 * silently poisons every distance the tools compute afterwards.
 */
export async function geocodeAddress(address, near = null) {
  const q = String(address || '').trim();
  if (q.length < 3) return null;
  let params = `q=${encodeURIComponent(q)}&limit=5`;
  if (near && Number.isFinite(near.lat)) {
    const [w, s, e, n] = [near.lng - 0.5, near.lat - 0.5, near.lng + 0.5, near.lat + 0.5];
    params += `&viewbox=${w},${s},${e},${n}&bounded=0`;
  }
  const rows = await nominatim(params);
  const best = rows
    .map((r) => ({ lat: Number(r.lat), lng: Number(r.lon), label: String(r.display_name || '') }))
    .find((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  return best || null;
}
