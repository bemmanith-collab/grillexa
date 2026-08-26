// The Reports PDF is a document somebody forwards to a person who was not going
// to read five charts. That makes the wording part of the product: a report that
// says "Yes, we made money" when the period lost money is worse than no report.
//
// What is checked here is the reasoning and the sentences, not the drawing — the
// narrative module is pure so it can be run under plain Node with no browser, no
// jsPDF and no database.
//
// The currency formatter is injected on purpose, because the screen uses ₹ and
// the PDF must not: jsPDF's built-in fonts have no rupee glyph. A test that let
// ₹ through would pass while the PDF printed broken superscripts.
//
// Run: npm test (from frontend/).
import assert from 'assert';
import { buildReport } from '../src/lib/reportNarrative.js';

const money = (n) => {
  const v = Number(n) || 0;
  return v < 0 ? `-Rs.${Math.abs(v).toFixed(2)}` : `Rs.${v.toFixed(2)}`;
};

// A period that traded normally. Individual tests override one branch at a time.
function fixture(over = {}) {
  return {
    from: '2026-08-01',
    to: '2026-08-26',
    scope: null,
    summary: { storesReporting: 12 },
    pnl: {
      overall: { revenue: 100000, cogs: 87000, profit: 13000, marginPct: 13 },
      stores: [
        { storeId: 1, store: 'Chandra stores', revenue: 40000, cogs: 33000, profit: 7000, marginPct: 17.5 },
        { storeId: 2, store: 'Rk kirana', revenue: 35000, cogs: 29000, profit: 6000, marginPct: 17.1 },
        { storeId: 3, store: 'Pushpa kirana', revenue: 25000, cogs: 25000, profit: 0, marginPct: 0 },
      ],
    },
    analytics: {
      salesTrend: [
        { date: '2026-08-01', amount: 50000 },
        { date: '2026-08-02', amount: 50000 },
      ],
      storePerformance: [
        { label: 'Chandra stores', amount: 40000 },
        { label: 'Rk kirana', amount: 35000 },
        { label: 'Pushpa kirana', amount: 25000 },
      ],
      productDistribution: [
        { label: 'Mixed sprouts', amount: 60000 },
        { label: 'Banana', amount: 38000 },
        { label: 'Single fruit bowl', amount: 2000 },
      ],
      wastageByProduct: [
        { label: 'Banana', value: 3000 },
        { label: 'Green sprouts', value: 1000 },
      ],
      salespersonPerformance: [
        { id: 1, name: 'vj', role: 'SALES', assignedStores: 10, storesVisited: 10, sales: 60000, settlements: 20, pendingSettlements: 0, efficiencyPct: 100 },
        { id: 2, name: 'Rocky', role: 'SALES', assignedStores: 10, storesVisited: 4, sales: 40000, settlements: 8, pendingSettlements: 3, efficiencyPct: 40 },
      ],
    },
    productSales: [],
    ...over,
  };
}

const build = (over) => buildReport(fixture(over), { money });
const find = (r, q) => r.sections.find((s) => s.q === q);
const allText = (r) =>
  r.sections.map((s) => [s.q, s.answer, ...s.lines].filter(Boolean).join(' ')).join(' ') + ' ' + r.footnote;

const tests = {
  'a profitable period says so, in money rather than percent': () => {
    const s = find(build(), 'Did we make money?');
    assert.match(s.answer, /^Yes\./, 'expected a plain yes');
    assert.ok(s.answer.includes('Rs.13000.00'), 'profit should be in the answer line');
    assert.ok(
      s.lines.join(' ').includes('13 paise in every rupee'),
      'margin should be said as paise in the rupee, not as a percentage'
    );
  },

  'a loss is never dressed up': () => {
    const r = build({
      pnl: {
        overall: { revenue: 50000, cogs: 62000, profit: -12000, marginPct: -24 },
        stores: [{ storeId: 1, store: 'Rk kirana', revenue: 50000, cogs: 62000, profit: -12000, marginPct: -24 }],
      },
    });
    const s = find(r, 'Did we make money?');
    assert.match(s.answer, /^No\./);
    assert.ok(s.answer.includes('Rs.12000.00'));
    // No "paise in the rupee" on a loss — it would read as a gain.
    assert.ok(!s.lines.join(' ').includes('paise'), 'a loss must not report paise per rupee');
  },

  'a period with no sales says nothing sold rather than reporting zeros': () => {
    const r = build({
      pnl: { overall: { revenue: 0, cogs: 0, profit: 0, marginPct: 0 }, stores: [] },
      analytics: { ...fixture().analytics, salesTrend: [], storePerformance: [], productDistribution: [] },
    });
    const s = find(r, 'Did we make money?');
    assert.strictEqual(s.answer, 'Nothing sold in this period.');
  },

  'loss-making shops are named': () => {
    const r = build({
      pnl: {
        overall: { revenue: 100000, cogs: 95000, profit: 5000, marginPct: 5 },
        stores: [
          { storeId: 1, store: 'Chandra stores', revenue: 80000, cogs: 60000, profit: 20000, marginPct: 25 },
          { storeId: 2, store: 'Leaky shop', revenue: 20000, cogs: 35000, profit: -15000, marginPct: -75 },
        ],
      },
    });
    const text = find(r, 'Did we make money?').lines.join(' ');
    assert.ok(text.includes('Leaky shop'), 'the shop losing money must be named');
    assert.ok(text.includes('Rs.15000.00'));
  },

  'it says how few shops carry the sales': () => {
    const s = find(build(), 'Which shops are carrying us?');
    // 40k of 100k is not half; 40+35 is. So two of three.
    assert.ok(s.lines.join(' ').includes('2 of 3 shops'), 'expected the half-of-sales count');
    assert.ok(s.bars.rows.length > 0, 'expected bars');
    assert.strictEqual(s.bars.rows[0].label, 'Chandra stores');
    assert.strictEqual(s.bars.rows[0].fraction, 1, 'the largest bar must be full width');
  },

  'wastage is put against sales so it means something': () => {
    const s = find(build(), 'What are we throwing away?');
    assert.ok(s.answer.includes('Rs.4000.00'), 'total wastage in the answer');
    // 4,000 against 100,000 of sales.
    assert.ok(s.lines.join(' ').includes('4.0% of everything we sold'));
    assert.ok(s.lines.join(' ').includes('Banana'), 'the worst product must be named');
  },

  'no wastage counted is reported as a possible missing count, not as good news': () => {
    const r = build({ analytics: { ...fixture().analytics, wastageByProduct: [] } });
    const s = find(r, 'What are we throwing away?');
    assert.ok(s.lines.join(' ').includes('may not be getting done'), 'should question the count');
    assert.strictEqual(s.bars, null, 'no bars when there is nothing to chart');
  },

  'someone can top the sales table and still be flagged for coverage': () => {
    const s = find(build(), 'Who is out there selling?');
    assert.ok(s.lines[0].includes('vj'), 'top seller named first');
    const text = s.lines.join(' ');
    assert.ok(text.includes('Rocky') && text.includes('4 of 10 shops'), 'the coverage gap must be named');
    assert.ok(text.includes('3 consignments are still waiting'), 'pending settlements surface');
  },

  'the what-to-do list turns the findings into instructions': () => {
    const s = find(build(), 'What should I look at this week?');
    assert.ok(s.isList, 'this section renders as a list');
    const text = s.lines.join(' ');
    assert.ok(/Send less Banana/.test(text), 'biggest wastage becomes an instruction');
    assert.ok(/Rocky has 6 shops nobody visited/.test(text), 'coverage becomes an instruction');
  },

  'a clean period still gets a closing line rather than an empty list': () => {
    const r = build({
      analytics: {
        ...fixture().analytics,
        wastageByProduct: [],
        salespersonPerformance: [
          { id: 1, name: 'vj', role: 'SALES', assignedStores: 4, storesVisited: 4, sales: 100000, settlements: 9, pendingSettlements: 0, efficiencyPct: 100 },
        ],
        storePerformance: [
          { label: 'A', amount: 25000 }, { label: 'B', amount: 25000 },
          { label: 'C', amount: 25000 }, { label: 'D', amount: 25000 },
        ],
      },
      pnl: { overall: { revenue: 100000, cogs: 80000, profit: 20000, marginPct: 20 }, stores: [] },
    });
    const s = find(r, 'What should I look at this week?');
    assert.strictEqual(s.lines.length, 1);
    assert.match(s.lines[0], /Nothing is flashing red/);
  },

  'no rupee sign reaches the PDF text': () => {
    // jsPDF's built-in fonts have no ₹ glyph. Every figure in the document goes
    // through the injected formatter, so if one is ever hardcoded this catches it.
    const text = allText(build());
    assert.ok(!text.includes('₹'), 'the ₹ character must never appear when the PDF formatter is used');
    assert.ok(text.includes('Rs.'), 'sanity: the injected formatter was actually used');
  },

  'a filter in force is carried onto the document': () => {
    const r = build({ scope: 'Chandra stores · Banana' });
    assert.strictEqual(r.scope, 'Chandra stores · Banana');
  },

  'every section has a question and something under it': () => {
    for (const s of build().sections) {
      assert.ok(s.q && s.q.endsWith('?'), `section "${s.q}" should be a question`);
      assert.ok(s.lines.length > 0, `section "${s.q}" has no content`);
    }
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL  ${name}\n        ${err.message}`);
  }
}
console.log(`\n${Object.keys(tests).length - failed} passing${failed ? `, ${failed} failing` : ''}`);
if (failed) process.exitCode = 1;
