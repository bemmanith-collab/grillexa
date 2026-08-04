// Turns a cross-tab sales/wastage sheet into the flat CSV that
// POST /api/import/offline accepts (see offline-import-template.csv).
//
//   node scripts/crosstab-to-csv.js sheet.csv --store "MG Road Store" > offline.csv
//   node scripts/crosstab-to-csv.js sheet.csv --store "MG Road Store" --payment UPI
//
// Export the cross-tab from Excel/Sheets as CSV first — this reads CSV, not
// .xlsx, so there is no spreadsheet library to install.
//
// EXPECTED INPUT: products down the left, one column per date × metric.
//
//   Product,          2026-07-01 Sold, 2026-07-01 Waste, 2026-07-01 Revenue, 2026-07-02 Sold, ...
//   Green Sprouts,    42,              3,                1050,               38
//   Mixed Sprouts,    18,              0,                540,                21
//
// Recognised in a column header: a date in YYYY-MM-DD, DD/MM/YYYY or DD-MM-YYYY,
// plus a metric word — sold/qty/units, waste/wastage/damage, revenue/amount/
// value/sales/total. Order within the header does not matter ("Sold 01/07/2026"
// works), and anything the sheet repeats per date but the import does not use
// is ignored.
//
// IF YOUR SHEET IS SHAPED DIFFERENTLY — dates down the side, stores across the
// top, one block per store — only readCrosstab() below needs changing; the
// rest works off the { date, product, metric, value } records it yields.

const fs = require('fs');
const path = require('path');
const { parseCsv } = require('../src/lib/offlineImport');

const METRICS = {
  sold: ['sold', 'qty', 'quantity', 'units', 'sale'],
  waste: ['waste', 'wastage', 'wasted', 'damage', 'damaged', 'spoilage'],
  revenue: ['revenue', 'amount', 'value', 'sales', 'total', 'rs', 'inr'],
};

function parseArgs(argv) {
  const args = { file: null, store: null, payment: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--store') args.store = argv[++i];
    else if (a === '--payment') args.payment = (argv[++i] || '').toUpperCase();
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!a.startsWith('--')) args.file = a;
  }
  return args;
}

// "2026-07-01", "01/07/2026", "1-7-2026" -> "2026-07-01". Day-first for the
// slashed forms: this is an Indian retail sheet, not a US one. Returns null if
// there is no date in the text, which is how a non-date column is recognised.
function findDate(text) {
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (dmy) {
    const [, d, m, rawY] = dmy;
    const year = rawY.length === 2 ? `20${rawY}` : rawY;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function findMetric(text) {
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  // Longest match first so "total sales" is revenue rather than matching the
  // "sale" in the sold list.
  for (const [metric, aliases] of Object.entries(METRICS)) {
    if (words.some((w) => aliases.includes(w))) return metric;
  }
  return null;
}

// Cross-tab grid -> flat { date, product, metric, value } records.
// This is the only function tied to the sheet's shape.
function readCrosstab(grid) {
  const header = grid[0];
  // Which columns carry data, and what each one means.
  const columns = header
    .map((cell, index) => ({ index, date: findDate(cell), metric: findMetric(cell), label: cell }))
    .filter((c) => c.date && c.metric);

  if (columns.length === 0) {
    throw new Error(
      'No date columns recognised in the header row.\n' +
        `Header was: ${header.join(' | ')}\n` +
        'Each data column needs a date and a metric word, e.g. "2026-07-01 Sold".'
    );
  }

  const records = [];
  for (const row of grid.slice(1)) {
    const product = (row[0] || '').trim();
    // Cross-tabs usually end in a Total row; it is not a product.
    if (!product || /^(total|grand total|sum)$/i.test(product)) continue;

    for (const col of columns) {
      const raw = (row[col.index] || '').trim();
      if (raw === '') continue;
      // Sheets carry ₹, thousands separators and "-" for nil.
      const cleaned = raw.replace(/[₹,\s]/g, '');
      if (cleaned === '' || cleaned === '-') continue;
      const value = Number(cleaned);
      if (!Number.isFinite(value)) {
        throw new Error(`Row "${product}", column "${col.label}": "${raw}" is not a number`);
      }
      records.push({ date: col.date, product, metric: col.metric, value });
    }
  }
  return records;
}

function toCsvField(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.file) {
    console.error(fs.readFileSync(__filename, 'utf8').split('\n\n')[0].replace(/^\/\/ ?/gm, ''));
    process.exit(args.help ? 0 : 1);
  }
  if (!args.store) {
    console.error('--store is required: the cross-tab has no store column, so every row needs one.');
    console.error('Run once per store if the sheet covers several.');
    process.exit(1);
  }

  const grid = parseCsv(fs.readFileSync(path.resolve(args.file), 'utf8'));
  if (grid.length < 2) {
    console.error('That file has no data rows.');
    process.exit(1);
  }

  const records = readCrosstab(grid);

  // Collapse the three metrics back into one row per date × product.
  const byKey = new Map();
  for (const r of records) {
    const key = `${r.date}|${r.product}`;
    if (!byKey.has(key)) {
      byKey.set(key, { date: r.date, product: r.product, sold: 0, waste: 0, revenue: 0 });
    }
    byKey.get(key)[r.metric] += r.value;
  }

  const rows = [...byKey.values()]
    // A cell that is only ever 0 is the sheet saying nothing happened; the
    // import rejects such a row, so drop it here rather than there.
    .filter((r) => r.sold > 0 || r.waste > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.product.localeCompare(b.product));

  const out = [['date', 'store', 'product', 'soldQty', 'wasteQty', 'revenue', 'paymentMethod']];
  for (const r of rows) {
    // Both blank when nothing sold: there is no bill for a payment method to
    // describe, and the import refuses revenue against a zero-sale row.
    const sold = r.sold > 0;
    out.push([r.date, args.store, r.product, r.sold, r.waste, sold ? r.revenue : '', sold ? args.payment : '']);
  }

  process.stdout.write(out.map((r) => r.map(toCsvField).join(',')).join('\n') + '\n');

  // stderr, so `> offline.csv` still gets clean CSV.
  console.error(
    `${rows.length} row(s) across ${new Set(rows.map((r) => r.date)).size} date(s) ` +
      `and ${new Set(rows.map((r) => r.product)).size} product(s).\n` +
      'Product names must match the catalogue exactly — check with: node scripts/show-catalogue.js'
  );
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { findDate, findMetric, readCrosstab };
