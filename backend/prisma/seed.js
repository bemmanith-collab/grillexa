require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { adjustStock } = require('../src/lib/stock');

const prisma = new PrismaClient();

const PASSWORD = 'ChangeMe123!';

const PRODUCTS = [
  { name: 'Green Sprouts', sku: 'GS-001', price: 25, threshold: 15, popularity: 0.9 },
  { name: 'Mixed Sprouts', sku: 'MS-002', price: 30, threshold: 15, popularity: 0.6 },
  { name: 'Single Fruit Bowl', sku: 'SFB-003', price: 45, threshold: 10, popularity: 0.4 },
  { name: 'Mixed Fruit Bowl', sku: 'MFB-004', price: 60, threshold: 10, popularity: 0.22 },
];

// A representative sample — add the rest of your 20+ stores from the Stores admin page.
const STORES = [
  { name: 'MG Road Store', address: 'MG Road', mult: 1.3 },
  { name: 'Koramangala Store', address: 'Koramangala', mult: 1.1 },
  { name: 'Indiranagar Store', address: 'Indiranagar', mult: 1.0 },
  { name: 'Whitefield Store', address: 'Whitefield', mult: 0.9 },
  { name: 'HSR Layout Store', address: 'HSR Layout', mult: 0.8 },
  { name: 'Jayanagar Store', address: 'Jayanagar', mult: 0.6 },
];

const DAYS_OF_HISTORY = 14;

function slugEmail(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '') + '@grillexa.local';
}

async function upsertUser({ name, email, role, storeId }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      role,
      stores: storeId ? { connect: { id: storeId } } : undefined,
    },
  });
  console.log(`Seeded ${role.toLowerCase()} user: ${email} / ${PASSWORD}`);
  return user;
}

async function createDispatch(storeId, productId, date, quantity, unitPrice, createdById) {
  return prisma.$transaction(async (tx) => {
    const amount = quantity * unitPrice;
    const created = await tx.dispatchInvoice.create({
      data: {
        number: 'PENDING',
        date,
        storeId,
        createdById,
        totalAmount: amount,
        lines: { create: [{ productId, quantity, unitPrice, amount }] },
      },
    });
    await adjustStock(tx, { storeId, productId, date, receivedDelta: quantity });
    return tx.dispatchInvoice.update({
      where: { id: created.id },
      data: { number: `DI-${String(created.id).padStart(6, '0')}` },
    });
  });
}

// Skips silently if there isn't enough stock on that day — this is demo
// data, not a real transaction, so an occasional skipped sale is fine.
async function createSaleIfPossible(storeId, productId, date, quantity, unitPrice, createdById) {
  try {
    return await prisma.$transaction(async (tx) => {
      await adjustStock(tx, { storeId, productId, date, soldDelta: quantity });
      const amount = quantity * unitPrice;
      const created = await tx.sale.create({
        data: {
          number: 'PENDING',
          date,
          storeId,
          createdById,
          totalAmount: amount,
          lines: { create: [{ productId, quantity, unitPrice, amount }] },
        },
      });
      return tx.sale.update({
        where: { id: created.id },
        data: { number: `SL-${String(created.id).padStart(6, '0')}` },
      });
    });
  } catch (err) {
    return null;
  }
}

async function recordWastageIfPossible(storeId, productId, date, quantity) {
  try {
    return await prisma.$transaction((tx) => adjustStock(tx, { storeId, productId, date, wastageDelta: quantity }));
  } catch (err) {
    return null;
  }
}

async function backfillHistory(stores, products, adminUser, salesUserByStoreId) {
  const alreadySeeded = await prisma.dispatchInvoice.count();
  if (alreadySeeded > 0) {
    console.log('Historical dispatches already exist — skipping demo backfill.');
    return;
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let d = DAYS_OF_HISTORY; d >= 1; d--) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - d);

    for (const store of stores) {
      const staffId = (salesUserByStoreId.get(store.id) || adminUser).id;

      for (const product of products) {
        // Restock roughly every 3 days.
        if (d % 3 === 0) {
          const qty = Math.max(5, Math.round(20 * product.popularity * store.mult));
          await createDispatch(store.id, product.id, date, qty, product.price, adminUser.id);
        }

        // Daily sales, scaled by how popular the product is at this store.
        const soldQty = Math.max(0, Math.round((Math.random() * 6 + 2) * product.popularity * store.mult));
        if (soldQty > 0) {
          await createSaleIfPossible(store.id, product.id, date, soldQty, product.price, staffId);
        }

        // Occasional spoilage/wastage.
        if (Math.random() < 0.3) {
          const wasteQty = Math.round(Math.random() * 2);
          if (wasteQty > 0) {
            await recordWastageIfPossible(store.id, product.id, date, wasteQty);
          }
        }
      }
    }
  }

  console.log(`Backfilled ${DAYS_OF_HISTORY} days of demo dispatch/sales/wastage history.`);
}

async function main() {
  const admin = await upsertUser({ name: 'Admin', email: 'admin@grillexa.local', role: 'ADMIN' });
  await upsertUser({ name: 'Manager', email: 'manager@grillexa.local', role: 'MANAGER' });

  const stores = [];
  for (const s of STORES) {
    const store = await prisma.store.upsert({
      where: { name: s.name },
      update: {},
      create: { name: s.name, address: s.address },
    });
    stores.push({ ...store, mult: s.mult });
  }

  const salesUserByStoreId = new Map();
  for (const store of stores) {
    const user = await upsertUser({
      name: `${store.name} Staff`,
      email: slugEmail(store.name),
      role: 'SALES',
      storeId: store.id,
    });
    salesUserByStoreId.set(store.id, user);
  }

  const products = [];
  for (const p of PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: { name: p.name, sku: p.sku, price: p.price, threshold: p.threshold },
    });
    products.push({ ...product, popularity: p.popularity });
  }

  await backfillHistory(stores, products, admin, salesUserByStoreId);

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
