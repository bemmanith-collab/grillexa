// The offline CSV import handles money and stock coming from a sheet nobody
// can re-key, so the parsing and validation are checked here — the rules that
// stop a bad row reaching the ledger, and the arithmetic that decides what a
// bill is worth.
//
// Run: npm test (from backend/). No database: everything under test is pure.
const assert = require('assert');

const { parseCsv, toRecords, planImport, applyImport, saleNumberFor } = require('../src/lib/offlineImport');
const { findDate, findMetric, readCrosstab } = require('../scripts/crosstab-to-csv');
const { normalizeDate } = require('../src/lib/stock');
const { fakeTx } = require('./fake-tx');

const storesByName = new Map([['mg road store', { id: 3, name: 'MG Road Store' }]]);
const productsByName = new Map([
  ['green sprouts', { id: 7, name: 'Green Sprouts' }],
  ['mixed fruit bowl', { id: 9, name: 'Mixed Fruit Bowl' }],
]);

const HEADER = 'date,store,product,soldQty,wasteQty,revenue,paymentMethod';

// Plans one CSV body and returns { plan, errors }.
function planOf(...dataLines) {
  const { rows, error } = toRecords([HEADER, ...dataLines].join('\n'));
  assert.strictEqual(error, null, `header rejected: ${error}`);
  return planImport(rows, { storesByName, productsByName });
}

const tests = {
  'quoted fields keep their commas': () => {
    const grid = parseCsv('a,b\n"Smith, John",2');
    assert.deepStrictEqual(grid[1], ['Smith, John', '2']);
  },

  'a doubled quote is one literal quote': () => {
    const grid = parseCsv('a\n"say ""hi"""');
    assert.strictEqual(grid[1][0], 'say "hi"');
  },

  'CRLF and a UTF-8 BOM do not corrupt the header': () => {
    const grid = parseCsv('﻿date,store\r\n2026-07-01,MG Road Store\r\n');
    assert.strictEqual(grid[0][0], 'date', 'BOM left stuck to the first column name');
    assert.strictEqual(grid[1][1], 'MG Road Store');
    assert.strictEqual(grid.length, 2, 'trailing CRLF produced a phantom row');
  },

  'a missing column is refused by name': () => {
    const { error } = toRecords('date,store,product\n2026-07-01,MG Road Store,Green Sprouts');
    assert.match(error, /soldqty/, `expected the missing columns listed, got: ${error}`);
  },

  'a good row becomes one bill and one wastage figure': () => {
    const { plan, errors } = planOf('2026-07-01,MG Road Store,Green Sprouts,42,3,1050,cash');
    assert.deepStrictEqual(errors, []);
    assert.strictEqual(plan.length, 1);
    assert.strictEqual(plan[0].storeId, 3);
    assert.strictEqual(plan[0].productId, 7);
    assert.strictEqual(plan[0].wasteQty, 3);
    assert.strictEqual(plan[0].revenue, 1050);
    assert.strictEqual(plan[0].unitPrice, 25);
    assert.strictEqual(plan[0].paymentMethod, 'CASH', 'payment method not normalised to upper case');
  },

  'store and product names match case-insensitively': () => {
    const { plan, errors } = planOf('2026-07-01,mg road STORE,green sprouts,1,0,25,UPI');
    assert.deepStrictEqual(errors, []);
    assert.strictEqual(plan[0].storeId, 3);
  },

  // Revenue is the money the sheet actually took, so the bill has to total it
  // exactly. 100/3 does not divide evenly, and recomputing the line as
  // quantity × unitPrice would bill 99.99999... instead.
  'revenue that does not divide evenly still totals exactly': () => {
    const { plan } = planOf('2026-07-01,MG Road Store,Green Sprouts,3,0,100,CASH');
    assert.strictEqual(plan[0].revenue, 100, 'the sheet total was not preserved');
  },

  'a wastage-only row is allowed and books no sale': () => {
    const { plan, errors } = planOf('2026-07-01,MG Road Store,Mixed Fruit Bowl,0,4,,');
    assert.deepStrictEqual(errors, []);
    assert.strictEqual(plan[0].saleNumber, null, 'a zero-sale row must not create a bill');
    assert.strictEqual(plan[0].wasteQty, 4);
  },

  'a row that records nothing at all is refused': () => {
    const { errors } = planOf('2026-07-01,MG Road Store,Green Sprouts,0,0,,CASH');
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].errors[0], /neither a sale nor wastage/);
  },

  'sold units with no revenue are refused': () => {
    const { errors } = planOf('2026-07-01,MG Road Store,Green Sprouts,5,0,,CASH');
    assert.match(errors[0].errors[0], /revenue is required/);
  },

  // Money with nothing sold is the sheet contradicting itself. Importing it
  // would book revenue against no stock movement and the day would not tie out.
  'revenue with nothing sold is refused': () => {
    const { errors } = planOf('2026-07-01,MG Road Store,Green Sprouts,0,2,500,CASH');
    assert.match(errors[0].errors[0], /one of the two is wrong/);
  },

  'unknown stores and products are named, not guessed at': () => {
    const { errors } = planOf('2026-07-01,Nowhere Store,Blue Sprouts,1,0,10,CASH');
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].errors.join(' '), /unknown store "Nowhere Store"/);
    assert.match(errors[0].errors.join(' '), /unknown product "Blue Sprouts"/);
  },

  'fractional and negative quantities are refused': () => {
    const { errors } = planOf(
      '2026-07-01,MG Road Store,Green Sprouts,2.5,0,60,CASH',
      '2026-07-02,MG Road Store,Green Sprouts,4,-1,100,CASH'
    );
    assert.strictEqual(errors.length, 2, 'a fractional quantity would 500 inside Prisma');
  },

  'a bad date is refused before it reaches the ledger': () => {
    const { errors } = planOf('01/07/2026,MG Road Store,Green Sprouts,1,0,25,CASH');
    assert.match(errors[0].errors[0], /YYYY-MM-DD/);
  },

  'an unknown payment method is refused': () => {
    const { errors } = planOf('2026-07-01,MG Road Store,Green Sprouts,1,0,25,PAYTM');
    assert.match(errors[0].errors[0], /paymentMethod must be one of/);
  },

  // Both rows collide on sale number, so the second would be silently skipped
  // as "already imported" and its money would vanish without a word.
  'the same date, store and product twice is refused, naming both lines': () => {
    const { errors } = planOf(
      '2026-07-01,MG Road Store,Green Sprouts,10,0,250,CASH',
      '2026-07-01,MG Road Store,Green Sprouts,5,0,125,CASH'
    );
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].line, 3);
    assert.match(errors[0].errors[0], /duplicates line 2/);
  },

  // This is what makes a re-import a no-op instead of a second bill.
  'the sale number is derived from the row, not a sequence': () => {
    assert.strictEqual(saleNumberFor('2026-07-01', 3, 7), 'OFF-20260701-S3-P7');
    const a = planOf('2026-07-01,MG Road Store,Green Sprouts,4,0,100,CASH').plan[0];
    const b = planOf('2026-07-01,MG Road Store,Green Sprouts,9,1,225,UPI').plan[0];
    assert.strictEqual(a.saleNumber, b.saleNumber, 'same row imported twice must collide');
  },

  'every bad row is reported at once, not just the first': () => {
    const { plan, errors } = planOf(
      '2026-07-01,MG Road Store,Green Sprouts,4,0,100,CASH',
      'nonsense,MG Road Store,Green Sprouts,4,0,100,CASH',
      '2026-07-03,Nowhere Store,Green Sprouts,4,0,100,CASH'
    );
    assert.strictEqual(errors.length, 2, 'the user has to fix the file in one pass, not three');
    assert.deepStrictEqual(errors.map((e) => e.line), [3, 4]);
    assert.strictEqual(plan.length, 1);
  },

  // --- the write path, against a faked transaction ------------------------

  'importing a row books the sale and the wastage against the ledger': async () => {
    const { plan } = planOf('2026-07-01,MG Road Store,Green Sprouts,42,3,1050,CASH');
    const tx = fakeTx();
    const [result] = await applyImport(tx, plan, 1);

    assert.strictEqual(result.sale, 'created');
    const [sale] = tx.saleRows;
    assert.strictEqual(sale.number, 'OFF-20260701-S3-P7');
    assert.strictEqual(sale.totalAmount, 1050);
    assert.strictEqual(sale.paymentMethod, 'CASH');
    assert.strictEqual(sale.createdById, 1);
    // A Direct Sale is precisely a sale with no consignment behind it — that
    // is the filter the Direct Sale page and the day's takings card use.
    assert.ok(!sale.consignmentId, 'imported bill must not be tied to a consignment');
    assert.strictEqual(sale.lines[0].quantity, 42);
    assert.strictEqual(sale.lines[0].amount, 1050);

    const [entry] = tx.rows;
    assert.strictEqual(entry.sold, 42);
    assert.strictEqual(entry.wastage, 3);
    assert.strictEqual(entry.closing, -45, 'sold and wastage both have to leave the ledger');
  },

  // The whole reason importedWastage exists: wastage is an increment with no
  // audit row, so without it a second run would add the same units again.
  'importing the same file twice changes nothing the second time': async () => {
    const { plan } = planOf('2026-07-01,MG Road Store,Green Sprouts,42,3,1050,CASH');
    const tx = fakeTx();
    await applyImport(tx, plan, 1);
    const [second] = await applyImport(tx, plan, 1);

    assert.strictEqual(second.sale, 'skipped');
    assert.strictEqual(second.wastageDelta, 0);
    assert.strictEqual(tx.saleRows.length, 1, 'a second bill was created for the same row');
    assert.strictEqual(tx.rows[0].sold, 42, 'stock was deducted twice');
    assert.strictEqual(tx.rows[0].wastage, 3, 'wastage was counted twice');
  },

  'a corrected wastage figure re-imports as the difference, not as a second lot': async () => {
    const tx = fakeTx();
    await applyImport(tx, planOf('2026-07-01,MG Road Store,Green Sprouts,42,3,1050,CASH').plan, 1);
    // The sheet said 3; it was really 7.
    const [result] = await applyImport(
      tx,
      planOf('2026-07-01,MG Road Store,Green Sprouts,42,7,1050,CASH').plan,
      1
    );

    assert.strictEqual(result.wastageDelta, 4);
    assert.strictEqual(tx.rows[0].wastage, 7, 'the day should hold the corrected figure, not 3+7');
    assert.strictEqual(tx.rows[0].importedWastage, 7);
    // The bill is left alone and the caller is told so, rather than the row
    // being silently half-updated.
    assert.strictEqual(result.sale, 'skipped');
    assert.match(result.note, /left untouched/);
  },

  // Wastage recorded by hand through the wastage form is not the import's to
  // reverse — only what the import itself contributed.
  'a re-import does not swallow wastage entered by hand': async () => {
    const tx = fakeTx();
    await applyImport(tx, planOf('2026-07-01,MG Road Store,Green Sprouts,10,2,250,CASH').plan, 1);
    // Someone records 5 more through the wastage form: a plain increment.
    tx.rows[0].wastage += 5;
    tx.rows[0].closing -= 5;

    await applyImport(tx, planOf('2026-07-01,MG Road Store,Green Sprouts,10,2,250,CASH').plan, 1);
    assert.strictEqual(tx.rows[0].wastage, 7, 'the hand-entered 5 was clobbered by the re-import');
  },

  'a wastage-only row moves stock without inventing a bill': async () => {
    const { plan } = planOf('2026-07-01,MG Road Store,Mixed Fruit Bowl,0,4,,');
    const tx = fakeTx();
    const [result] = await applyImport(tx, plan, 1);

    assert.strictEqual(result.sale, 'none');
    assert.strictEqual(tx.saleRows.length, 0, 'a zero-rupee bill was created');
    assert.strictEqual(tx.rows[0].wastage, 4);
  },

  // Backfilling an old date is the normal case for this endpoint, and the
  // ledger carries each day's closing into the next day's opening.
  'a back-dated import re-chains the days after it': async () => {
    const tx = fakeTx([
      { date: '2026-07-01', storeId: 3, productId: 7, opening: 0, received: 100, closing: 100 },
      { date: '2026-07-02', storeId: 3, productId: 7, opening: 100, sold: 10, closing: 90 },
    ]);
    await applyImport(tx, planOf('2026-07-01,MG Road Store,Green Sprouts,40,5,1000,CASH').plan, 1);

    const july2 = tx.rows.find((r) => +r.date === +normalizeDate('2026-07-02'));
    assert.strictEqual(july2.opening, 55, 'the day after the backfill kept a stale opening');
    assert.strictEqual(july2.closing, 45);
  },

  // --- scripts/crosstab-to-csv.js -----------------------------------------

  'cross-tab dates are read day-first, as the sheets are written': () => {
    assert.strictEqual(findDate('2026-07-01 Sold'), '2026-07-01');
    assert.strictEqual(findDate('Sold 01/07/2026'), '2026-07-01');
    assert.strictEqual(findDate('1-7-26 Waste'), '2026-07-01');
    assert.strictEqual(findDate('Product'), null, 'a label column was mistaken for a date');
  },

  'metric words are recognised however the header words them': () => {
    assert.strictEqual(findMetric('01/07/2026 Units'), 'sold');
    assert.strictEqual(findMetric('01/07/2026 Wastage'), 'waste');
    assert.strictEqual(findMetric('01/07/2026 Amount'), 'revenue');
    assert.strictEqual(findMetric('Opening Stock'), null);
  },

  'a cross-tab collapses to one record per date, product and metric': () => {
    const grid = parseCsv(
      [
        'Product,01/07/2026 Sold,01/07/2026 Waste,01/07/2026 Revenue,02/07/2026 Sold',
        'Green Sprouts,42,3,"1,050",38',
        'Mixed Fruit Bowl,0,4,-,',
        'Total,42,7,1050,38',
      ].join('\n')
    );
    const records = readCrosstab(grid);

    // The Total row is not a product.
    assert.ok(!records.some((r) => r.product === 'Total'), 'the Total row was imported as a product');
    // "1,050" is one number, not a broken pair of cells.
    const revenue = records.find((r) => r.product === 'Green Sprouts' && r.metric === 'revenue');
    assert.strictEqual(revenue.value, 1050);
    // "-" means nil, and an empty cell means nothing was recorded.
    assert.ok(
      !records.some((r) => r.product === 'Mixed Fruit Bowl' && r.metric === 'revenue'),
      '"-" was read as a number'
    );
    assert.strictEqual(records.filter((r) => r.date === '2026-07-02').length, 1);
  },

  'a cross-tab with no recognisable date columns says so': () => {
    const grid = parseCsv('Product,Notes\nGreen Sprouts,fine');
    assert.throws(() => readCrosstab(grid), /No date columns recognised/);
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try {
      await fn();
      console.log(`  ok  ${name}`);
    } catch (err) {
      failed++;
      console.error(`FAIL  ${name}\n      ${err.message}`);
    }
  }
  console.log(`\noffline-import: ${Object.keys(tests).length - failed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
