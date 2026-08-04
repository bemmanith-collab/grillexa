// Just enough of the Prisma client for lib/stock.js and lib/offlineImport.js —
// the query shapes they actually issue. Dates are compared by time value, as
// Postgres would. Shared by stock-cascade.js and offline-import.js so there is
// one fake to keep honest rather than two that drift.
//
// Not a test itself: required by tests, runs nothing on its own.
const { normalizeDate } = require('../src/lib/stock');

// The column defaults DailyStockEntry declares. Applied on create/upsert as
// well as on seeding: Postgres fills them in for any column the insert leaves
// out, and getOrCreateDailyEntry leaves importedWastage out. A fake that
// returned it undefined instead of 0 would turn the import's wastage delta
// into NaN — a bug in the fake that looks exactly like a bug in the code.
const ENTRY_DEFAULTS = {
  opening: 0,
  received: 0,
  sold: 0,
  wastage: 0,
  closing: 0,
  consignmentQty: 0,
  importedWastage: 0,
};

function fakeTx(seed = [], sales = []) {
  let nextId = 1;
  const rows = seed.map((r) => ({
    id: nextId++,
    ...ENTRY_DEFAULTS,
    ...r,
    date: normalizeDate(r.date),
  }));
  const match = (row, storeId, productId) => row.storeId === storeId && row.productId === productId;

  let nextSaleId = 1;
  const saleRows = sales.map((s) => ({ id: nextSaleId++, ...s }));

  return {
    rows,
    saleRows,
    dailyStockEntry: {
      async findUnique({ where: { dailyEntryKey: k } }) {
        return rows.find((r) => match(r, k.storeId, k.productId) && +r.date === +k.date) || null;
      },
      async findFirst({ where: { storeId, productId, date } }) {
        return (
          rows
            .filter((r) => match(r, storeId, productId) && +r.date <= +date.lte)
            .sort((a, b) => b.date - a.date)[0] || null
        );
      },
      async findMany({ where: { storeId, productId, date } }) {
        return rows
          .filter((r) => match(r, storeId, productId) && +r.date > +date.gt)
          .sort((a, b) => a.date - b.date);
      },
      async create({ data }) {
        const row = { ...ENTRY_DEFAULTS, id: nextId++, ...data };
        rows.push(row);
        return row;
      },
      // Understands Prisma's { increment: n } as well as a plain value —
      // adjustStock writes increments so concurrent movements can't clobber
      // each other, and a fake that ignored that would test nothing real.
      async update({ where: { id }, data }) {
        const row = rows.find((r) => r.id === id);
        for (const [field, value] of Object.entries(data)) {
          row[field] =
            value && typeof value === 'object' && 'increment' in value
              ? (row[field] || 0) + value.increment
              : value;
        }
        return row;
      },
      async upsert({ where: { dailyEntryKey: k }, create }) {
        const found = rows.find((r) => match(r, k.storeId, k.productId) && +r.date === +k.date);
        if (found) return found;
        const row = { ...ENTRY_DEFAULTS, id: nextId++, ...create };
        rows.push(row);
        return row;
      },
    },
    sale: {
      // Sale.number is unique in the schema, which is what the import relies on
      // to stay idempotent — so the fake enforces it too.
      async findUnique({ where: { number } }) {
        return saleRows.find((s) => s.number === number) || null;
      },
      async create({ data }) {
        if (saleRows.some((s) => s.number === data.number)) {
          throw new Error(`Unique constraint failed on Sale.number (${data.number})`);
        }
        const { lines, ...rest } = data;
        const row = { id: nextSaleId++, ...rest, lines: lines?.create || [] };
        saleRows.push(row);
        return row;
      },
    },
  };
}

module.exports = { fakeTx };
