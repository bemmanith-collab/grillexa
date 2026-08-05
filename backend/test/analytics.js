// The charts and the Excel export run the same arithmetic — this is that
// arithmetic. The failure mode worth guarding is a quiet one: a return that
// inflates a chart instead of reducing it, or a dead day the line chart draws
// straight through, both of which look plausible on screen.
//
// The last test writes a real workbook with exceljs and reads it back, because
// "the file downloaded" and "the file has the right numbers in the right cells
// with a frozen header" are different claims.
//
// Run: npm test (from backend/). No database.
const assert = require('assert');
const ExcelJS = require('exceljs');

const {
  salesTrend,
  sumLinesBy,
  wastageByProduct,
  withOther,
  storeActivity,
  productPerformance,
  salespersonPerformance,
} = require('../src/lib/analytics');
const { buildWorkbook } = require('../src/lib/excelReport');

const day = (s) => new Date(`${s}T00:00:00.000Z`);

function line(opts) {
  return {
    productId: opts.productId ?? 1,
    quantity: opts.quantity ?? 1,
    amount: opts.amount ?? 100,
    type: opts.type || 'SALE',
    product: { name: opts.name || 'Green sprouts', costPrice: opts.costPrice ?? 60 },
    sale: {
      id: opts.saleId ?? 1,
      date: day(opts.date || '2026-08-05'),
      storeId: opts.storeId ?? 1,
      createdById: opts.createdById ?? 1,
    },
  };
}

const tests = {
  'a day with no sales is a zero on the line, not a gap': () => {
    const trend = salesTrend([line({ date: '2026-08-03', amount: 500 })], day('2026-08-01'), day('2026-08-05'));
    assert.strictEqual(trend.length, 5);
    assert.deepStrictEqual(trend.map((t) => t.amount), [0, 0, 500, 0, 0]);
    assert.strictEqual(trend[0].date, '2026-08-01');
  },

  'sales outside the window are not drawn into it': () => {
    const trend = salesTrend([line({ date: '2026-07-01', amount: 999 })], day('2026-08-01'), day('2026-08-02'));
    assert.deepStrictEqual(trend.map((t) => t.amount), [0, 0]);
  },

  'a return reduces the day it happened on': () => {
    const trend = salesTrend(
      [line({ amount: 1000 }), line({ amount: 200, type: 'RETURN' })],
      day('2026-08-05'),
      day('2026-08-05')
    );
    assert.strictEqual(trend[0].amount, 800);
  },

  'buckets group by whatever key they are given, biggest first': () => {
    const rows = sumLinesBy(
      [
        line({ storeId: 1, amount: 100 }),
        line({ storeId: 2, amount: 900 }),
        line({ storeId: 1, amount: 300 }),
      ],
      (l) => l.sale.storeId,
      (l) => `Store ${l.sale.storeId}`
    );
    assert.deepStrictEqual(rows.map((r) => [r.label, r.amount]), [['Store 2', 900], ['Store 1', 400]]);
  },

  'a return subtracts units as well as money': () => {
    const [row] = sumLinesBy(
      [line({ quantity: 10, amount: 1000 }), line({ quantity: 2, amount: 200, type: 'RETURN' })],
      (l) => l.productId,
      (l) => l.product.name
    );
    assert.strictEqual(row.quantity, 8);
    assert.strictEqual(row.amount, 800);
  },

  'wastage is valued at what it cost, not what it would have sold for': () => {
    const [row] = wastageByProduct([
      { productId: 1, wastage: 5, product: { name: 'Green sprouts', costPrice: 60 } },
    ]);
    assert.strictEqual(row.value, 300);
    assert.strictEqual(row.quantity, 5);
  },

  'a long tail becomes one Other slice rather than forty': () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, label: `P${i}`, amount: 10, quantity: 1 }));
    const capped = withOther(rows, 8);
    assert.strictEqual(capped.length, 9);
    assert.strictEqual(capped[8].label, 'Other (4)');
    assert.strictEqual(capped[8].amount, 40, 'the tail money went missing');
    assert.strictEqual(capped[8].id, null, 'Other must not be drillable — it is not one thing');
  },

  'a short list is left exactly as it is': () => {
    const rows = [{ id: 1, label: 'A', amount: 10, quantity: 1 }];
    assert.strictEqual(withOther(rows, 8), rows);
  },

  'a store visit is the most recent work recorded there': () => {
    const activity = storeActivity(
      [{ storeId: 1, date: day('2026-08-01') }, { storeId: 1, date: day('2026-08-04') }],
      [{ storeId: 2, date: day('2026-07-30') }]
    );
    assert.strictEqual(activity.get(1).toISOString().slice(0, 10), '2026-08-04');
    assert.strictEqual(activity.get(2).toISOString().slice(0, 10), '2026-07-30');
    assert.strictEqual(activity.has(3), false);
  },

  'product profit is revenue less the cost of what actually sold': () => {
    const [row] = productPerformance(
      [line({ quantity: 10, amount: 1000, costPrice: 60 })],
      [{ productId: 1, wastage: 2, product: { name: 'Green sprouts', costPrice: 60 } }]
    );
    assert.strictEqual(row.revenue, 1000);
    assert.strictEqual(row.cost, 600);
    assert.strictEqual(row.profit, 400);
    assert.strictEqual(row.marginPct, 40);
    // Wastage is reported beside the profit, never folded into it: a product
    // can sell at a healthy margin and still lose money once what rotted is
    // counted, and that is two facts, not one.
    assert.strictEqual(row.wastageUnits, 2);
    assert.strictEqual(row.wastageValue, 120);
  },

  'a product with no sales still reports its wastage': () => {
    const [row] = productPerformance([], [
      { productId: 7, wastage: 3, product: { name: 'Mixed bowl', costPrice: 40 } },
    ]);
    assert.strictEqual(row.name, 'Mixed bowl');
    assert.strictEqual(row.revenue, 0);
    assert.strictEqual(row.marginPct, 0, 'a margin on no revenue must not divide by zero');
    assert.strictEqual(row.wastageValue, 120);
  },

  'coverage is stores reached over stores assigned': () => {
    const [row] = salespersonPerformance([{ id: 1, name: 'Rakesh', role: 'SALES', stores: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] }], {
      linesByUser: new Map([[1, 4200]]),
      visitsByUser: new Map([[1, new Set([1, 2, 3])]]),
      settledByUser: new Map([[1, 2]]),
      pendingByUser: new Map([[1, 1]]),
    });
    assert.strictEqual(row.storesVisited, 3);
    assert.strictEqual(row.efficiencyPct, 75);
    assert.strictEqual(row.sales, 4200);
    assert.strictEqual(row.pendingSettlements, 1);
  },

  'someone with no stores assigned has no coverage figure, not 0%': () => {
    const [row] = salespersonPerformance([{ id: 9, name: 'Admin', role: 'ADMIN', stores: [] }], {
      linesByUser: new Map(),
      visitsByUser: new Map(),
      settledByUser: new Map(),
      pendingByUser: new Map(),
    });
    assert.strictEqual(row.efficiencyPct, null, '0% would read as "visited none of their stores"');
  },

  'the workbook has six sheets, a frozen bold header, and the numbers in the cells': async () => {
    const workbook = buildWorkbook({
      from: '2026-08-01',
      to: '2026-08-05',
      summary: {
        storeFilter: 'All stores',
        totalSales: 4200,
        billCount: 3,
        consignmentCount: 2,
        consignmentValue: 5000,
        settlementCount: 1,
        pendingCount: 1,
        wastageUnits: 5,
        wastageValue: 300,
        storesVisited: 6,
        storesMissed: 2,
      },
      stores: [
        {
          store: 'Anna Nagar',
          address: '12 Main Rd, Chennai',
          salespeople: 'Rakesh',
          sales: 4200,
          wastageValue: 300,
          consignments: 2,
          lastVisit: day('2026-08-05'),
          status: 'Visited',
        },
      ],
      products: [
        { name: 'Green sprouts', units: 10, revenue: 1000, cost: 600, profit: 400, wastageUnits: 2, wastageValue: 120, marginPct: 40 },
      ],
      salespeople: [
        { name: 'Rakesh', role: 'SALES', assignedStores: 4, storesVisited: 3, sales: 4200, settlements: 2, pendingSettlements: 1, efficiencyPct: 75 },
      ],
      consignments: [
        { consignmentNo: 'C-1', store: 'Anna Nagar', deliveredAt: day('2026-08-03'), status: 'DELIVERED', deliveredQty: 20, soldQty: 12, returnedQty: 3, openQty: 5, value: 2000 },
      ],
      wastage: [{ date: day('2026-08-04'), store: 'Anna Nagar', product: 'Green sprouts', quantity: 5, value: 300 }],
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(buffer);

    assert.deepStrictEqual(
      reopened.worksheets.map((ws) => ws.name),
      ['Summary', 'Store Performance', 'Product Performance', 'Salesperson Performance', 'Consignment Summary', 'Wastage Breakdown']
    );

    const products = reopened.getWorksheet('Product Performance');
    assert.strictEqual(products.getRow(1).getCell(1).value, 'Product');
    assert.strictEqual(products.getRow(1).font.bold, true, 'header lost its bold');
    assert.strictEqual(products.getRow(1).fill.fgColor.argb, 'FF052A33', 'header lost its fill');
    assert.strictEqual(products.views[0].state, 'frozen', 'header row is not frozen');
    assert.strictEqual(products.getRow(2).getCell(3).value, 1000, 'revenue is not in the revenue cell');
    assert.ok(products.getRow(2).getCell(3).numFmt.includes('₹'), 'revenue is not formatted as money');
    assert.ok(products.columns[0].width > 'Product'.length, 'columns were never widened');

    // A date has to arrive as a date, not the text "05/08/2026" — a text
    // column cannot be sorted or filtered by month, which is most of why
    // anyone opens this in Excel.
    const wastage = reopened.getWorksheet('Wastage Breakdown');
    assert.ok(wastage.getRow(2).getCell(1).value instanceof Date, 'the date column is text');
    assert.strictEqual(wastage.getRow(2).getCell(1).value.toISOString().slice(0, 10), '2026-08-04');
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try {
      await fn();
      console.log(`  ok  ${name}`);
    } catch (err) {
      failed += 1;
      console.error(`FAIL  ${name}\n      ${err.message}`);
    }
  }
  console.log(failed ? `\n${failed} failing` : `\n${Object.keys(tests).length} passing`);
  process.exit(failed ? 1 : 0);
})();
