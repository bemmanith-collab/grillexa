// Parsing, validation and the write loop for the offline sales/wastage CSV
// import (POST /api/import/offline).
//
// No Prisma client is imported here: the write half takes the caller's
// transaction as an argument, the same way lib/stock.js and lib/pricing.js do.
// That keeps the whole file checkable without a database — see
// test/offline-import.js. The route does the HTTP and owns the transaction.
const { normalizeDate, getOrCreateDailyEntry, adjustStock } = require('./stock');

const REQUIRED_COLUMNS = ['date', 'store', 'product', 'soldqty', 'wasteqty', 'revenue', 'paymentmethod'];
const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'CREDIT', 'OTHER'];

// A whole file is validated before a single row is written, so a bad row
// fails the import instead of half-importing it. That means holding the file
// in memory and holding one transaction open for the write, which is why this
// is capped rather than streamed. Well past a year of daily sheets.
const MAX_ROWS = 2000;

// RFC 4180 enough for spreadsheet exports: quoted fields, "" for a literal
// quote, commas and newlines inside quotes, CRLF or LF line endings.
// Deliberately not a dependency — this is the whole format.
function parseCsv(text) {
  if (typeof text !== 'string') return [];
  // Excel writes a BOM on "CSV UTF-8"; left in place it becomes part of the
  // first header name and the date column stops being found.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  row.push(field);
  rows.push(row);

  // Trailing newline leaves one empty trailing row; blank lines mid-file are
  // equally meaningless. Drop anything with nothing in it.
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

// CSV rows -> objects keyed by lowercased header, each carrying the 1-based
// line number it came from so an error can name the row in the user's editor.
// Returns { rows, error } rather than throwing: a missing column is a
// user-fixable problem, not a bug.
function toRecords(text) {
  const grid = parseCsv(text);
  if (grid.length === 0) return { rows: [], error: 'The CSV is empty' };

  const header = grid[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    return { rows: [], error: `CSV is missing required column(s): ${missing.join(', ')}` };
  }
  if (grid.length === 1) return { rows: [], error: 'The CSV has a header but no data rows' };
  if (grid.length - 1 > MAX_ROWS) {
    return { rows: [], error: `Too many rows (${grid.length - 1}). Split the file into chunks of ${MAX_ROWS} or fewer.` };
  }

  const rows = grid.slice(1).map((cells, index) => {
    const record = { line: index + 2 };
    header.forEach((name, i) => {
      record[name] = (cells[i] ?? '').trim();
    });
    return record;
  });
  return { rows, error: null };
}

// Blank means "nothing recorded", which for a quantity is zero — an offline
// sheet leaves the cell empty rather than writing 0. Anything else must be a
// whole number: Int columns in the schema, and 2.5 units of wastage would
// reach Prisma and come back as a 500 naming the model's internals.
function wholeNumber(raw, label, errors) {
  if (raw === '') return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    errors.push(`${label} must be a whole number of zero or more (got "${raw}")`);
    return null;
  }
  return n;
}

// The sale number is derived from the row's own identity rather than a
// sequence, which is what makes the import idempotent: Sale.number is unique,
// so a second import of the same row cannot create a second bill. It also
// reads as an offline import at a glance in the Sales list, next to the
// app's own SL-000123.
function saleNumberFor(date, storeId, productId) {
  return `OFF-${date.replace(/-/g, '')}-S${storeId}-P${productId}`;
}

// Validates every row and works out what it would write. Names are resolved
// through the caller's maps (lowercased name -> id) so this stays pure.
//
// Returns { plan, errors }. The route treats any error as fatal for the whole
// file — see MAX_ROWS above for why all-or-nothing is the right contract here.
function planImport(rows, { storesByName, productsByName }) {
  const plan = [];
  const errors = [];
  // The sheet is one cell per date × store × product, so the same key twice
  // is the sheet being wrong, not two legitimate bills. Silently importing
  // the first and skipping the second (they collide on sale number) would
  // lose the second row's money without saying so.
  const seen = new Map();

  for (const row of rows) {
    const rowErrors = [];

    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || Number.isNaN(new Date(`${row.date}T00:00:00.000Z`).getTime())) {
      rowErrors.push(`date must be YYYY-MM-DD (got "${row.date}")`);
    }

    const store = storesByName.get(row.store.toLowerCase());
    if (!row.store) rowErrors.push('store is required');
    else if (!store) rowErrors.push(`unknown store "${row.store}"`);

    const product = productsByName.get(row.product.toLowerCase());
    if (!row.product) rowErrors.push('product is required');
    else if (!product) rowErrors.push(`unknown product "${row.product}"`);

    const soldQty = wholeNumber(row.soldqty, 'soldQty', rowErrors);
    const wasteQty = wholeNumber(row.wasteqty, 'wasteQty', rowErrors);

    // Revenue is what the offline sheet actually took, so it wins over the
    // catalogue price — that is the entire point of importing it. Required
    // when something sold, because there is no second source for it.
    let revenue = 0;
    if (soldQty !== null && soldQty > 0) {
      if (row.revenue === '') {
        rowErrors.push('revenue is required when soldQty is greater than zero');
      } else {
        revenue = Number(row.revenue);
        if (!Number.isFinite(revenue) || revenue < 0) {
          rowErrors.push(`revenue must be a number of zero or more (got "${row.revenue}")`);
        }
      }
    } else if (row.revenue !== '' && Number(row.revenue) !== 0) {
      rowErrors.push(`revenue is ${row.revenue} but soldQty is 0 — one of the two is wrong`);
    }

    const paymentMethod = row.paymentmethod ? row.paymentmethod.toUpperCase() : null;
    if (paymentMethod && !PAYMENT_METHODS.includes(paymentMethod)) {
      rowErrors.push(`paymentMethod must be one of ${PAYMENT_METHODS.join(', ')} (got "${row.paymentmethod}")`);
    }

    if (soldQty === 0 && wasteQty === 0) {
      rowErrors.push('row records neither a sale nor wastage — delete it or fill in a quantity');
    }

    if (store && product && rowErrors.length === 0) {
      const key = `${row.date}|${store.id}|${product.id}`;
      if (seen.has(key)) {
        rowErrors.push(`duplicates line ${seen.get(key)} (same date, store and product)`);
      } else {
        seen.set(key, row.line);
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ line: row.line, errors: rowErrors });
      continue;
    }

    plan.push({
      line: row.line,
      date: row.date,
      storeId: store.id,
      store: store.name,
      productId: product.id,
      product: product.name,
      soldQty,
      wasteQty,
      revenue,
      paymentMethod,
      saleNumber: soldQty > 0 ? saleNumberFor(row.date, store.id, product.id) : null,
      // Per-unit price the bill records. The line amount is set to `revenue`
      // itself, not recomputed as quantity × unitPrice, so a revenue that
      // does not divide evenly (₹100 over 3 units) still totals exactly what
      // the sheet says rather than losing a paisa to rounding.
      unitPrice: soldQty > 0 ? revenue / soldQty : 0,
    });
  }

  return { plan, errors };
}

// Writes a validated plan. Called inside a transaction by the route, which
// passes its `tx` in — the same shape lib/stock.js and lib/pricing.js use, so
// this file still imports no Prisma client and the write path can be checked
// without a database (see test/offline-import.js).
//
// Returns one result per row, saying what it did, so the caller can report
// back per line rather than as a count.
async function applyImport(tx, plan, createdById) {
  const results = [];

  for (const row of plan) {
    const date = normalizeDate(row.date);
    const result = { line: row.line, date: row.date, store: row.store, product: row.product };

    if (row.soldQty > 0) {
      // Sale.number is unique and derived from the row's identity, so this is
      // what makes a re-import a no-op rather than a second bill. Checked
      // rather than caught: a unique-constraint violation inside an
      // interactive transaction aborts the whole transaction, taking every
      // good row with it.
      const existing = await tx.sale.findUnique({ where: { number: row.saleNumber } });
      if (existing) {
        result.sale = 'skipped';
        result.saleNumber = row.saleNumber;
        result.note = 'already imported — existing bill left untouched';
      } else {
        await adjustStock(tx, {
          storeId: row.storeId,
          productId: row.productId,
          date,
          soldDelta: row.soldQty,
        });
        await tx.sale.create({
          data: {
            number: row.saleNumber,
            date,
            storeId: row.storeId,
            createdById,
            totalAmount: row.revenue,
            paymentMethod: row.paymentMethod,
            // consignmentId stays null, which is what makes this a Direct
            // Sale — the same filter the Direct Sale page and the day's
            // takings card list by.
            lines: {
              create: [
                {
                  productId: row.productId,
                  quantity: row.soldQty,
                  unitPrice: row.unitPrice,
                  amount: row.revenue,
                  type: 'SALE',
                },
              ],
            },
          },
        });
        result.sale = 'created';
        result.saleNumber = row.saleNumber;
      }
    } else {
      result.sale = 'none';
    }

    // Wastage has no audit row of its own, only this running column, so a
    // re-import applies the difference between what the import last
    // contributed and what the file says now. Same file twice: delta 0, no
    // write. Corrected file: the day is corrected rather than doubled.
    const entry = await getOrCreateDailyEntry(tx, row.storeId, row.productId, date);
    const wastageDelta = row.wasteQty - entry.importedWastage;
    if (wastageDelta !== 0) {
      await adjustStock(tx, { storeId: row.storeId, productId: row.productId, date, wastageDelta });
      await tx.dailyStockEntry.update({
        where: { id: entry.id },
        data: { importedWastage: row.wasteQty },
      });
    }
    result.wastageDelta = wastageDelta;

    results.push(result);
  }

  return results;
}

module.exports = {
  parseCsv,
  toRecords,
  planImport,
  applyImport,
  saleNumberFor,
  PAYMENT_METHODS,
  REQUIRED_COLUMNS,
  MAX_ROWS,
};
