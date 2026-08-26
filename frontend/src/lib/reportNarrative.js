// Turns a loaded Reports page into sentences a person can read.
//
// The dashboard answers "what are the numbers". This answers "so what" — the
// same figures, arranged as the questions somebody actually asks when they open
// the page, each with a one-line answer before any detail. It is what gets
// forwarded to someone who was not going to squint at five charts.
//
// Deliberately pure: no jsPDF, no React, no network. It takes the four responses
// the page already has and returns a plain object, which is what lets
// test/reportNarrative.js check the wording and the arithmetic under plain Node
// without a browser or a database.
//
// Money is formatted by a function passed in rather than imported, because the
// screen wants ₹ and the PDF must not have it — jsPDF's built-in fonts have no
// rupee glyph and render it as a broken superscript that also throws off text
// width. Same sentences, two currencies.

const pct = (part, whole) => (whole ? (part * 100) / whole : 0);

// "about 13 paise in every rupee" beats "13.4% margin" for the person reading
// this on a phone. Margin is the one number here that everybody nods at and
// nobody pictures.
function paiseLine(marginPct) {
  const paise = Math.round(marginPct);
  if (paise <= 0) return null;
  return `about ${paise} paise in every rupee`;
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
}

// How many of the top rows it takes to reach a share of the total. Answers
// "how much of this rests on a handful of shops" without the word concentration.
function topShare(rows, key, targetPct) {
  const total = sum(rows, key);
  if (!total) return null;
  const sorted = [...rows].sort((a, b) => (b[key] || 0) - (a[key] || 0));
  let running = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    running += Number(sorted[i][key]) || 0;
    if (pct(running, total) >= targetPct) {
      return { count: i + 1, of: sorted.length, sharePct: pct(running, total) };
    }
  }
  return { count: sorted.length, of: sorted.length, sharePct: 100 };
}

// Bars are drawn from these. Values are kept raw and the display string is
// computed alongside, so the PDF never has to know what the number means.
function barRows(rows, { key, label = 'label', take = 5, format }) {
  const sorted = [...rows].sort((a, b) => (b[key] || 0) - (a[key] || 0)).slice(0, take);
  const max = sorted.length ? Number(sorted[0][key]) || 0 : 0;
  return sorted.map((row) => ({
    label: String(row[label] ?? '').trim() || '—',
    value: Number(row[key]) || 0,
    // Share of the largest bar, which is what the bar length encodes.
    fraction: max ? (Number(row[key]) || 0) / max : 0,
    display: format(Number(row[key]) || 0),
  }));
}

/**
 * @param data  { from, to, summary, pnl, analytics, productSales, scope }
 *              scope is the human label for any filter in force, or null.
 * @param money a currency formatter — ₹ on screen, "Rs." in the PDF.
 * @returns     { period, scope, sections, footnote }
 */
export function buildReport(data, { money }) {
  const { from, to, pnl, analytics, scope } = data;

  const trend = analytics?.salesTrend ?? [];
  const stores = analytics?.storePerformance ?? [];
  const products = analytics?.productDistribution ?? [];
  const wastage = analytics?.wastageByProduct ?? [];
  const people = analytics?.salespersonPerformance ?? [];
  const pnlStores = pnl?.stores ?? [];
  const overall = pnl?.overall ?? { revenue: 0, cogs: 0, profit: 0, marginPct: 0 };

  const totalSales = sum(trend, 'amount');
  const totalWastage = sum(wastage, 'value');

  const sections = [];

  // ---- 1. Did we make money? ---------------------------------------------
  {
    const lines = [];
    let answer;

    if (!overall.revenue) {
      answer = 'Nothing sold in this period.';
      lines.push('There are no sales in the dates selected, so there is nothing to report on below.');
    } else if (overall.profit > 0) {
      const paise = paiseLine(overall.marginPct);
      answer = `Yes. ${money(overall.profit)} kept from ${money(overall.revenue)} of sales.`;
      lines.push(
        `Stock cost ${money(overall.cogs)}, so we kept ${money(overall.profit)}${paise ? ` — ${paise}` : ''}.`
      );
    } else if (overall.profit === 0) {
      answer = 'We broke even.';
      lines.push(`Sales and stock cost both came to ${money(overall.revenue)}.`);
    } else {
      answer = `No. We lost ${money(Math.abs(overall.profit))}.`;
      lines.push(
        `Sales were ${money(overall.revenue)} and the stock behind them cost ${money(overall.cogs)}.`
      );
    }

    const losing = pnlStores.filter((s) => s.profit < 0);
    if (losing.length && overall.revenue) {
      const worst = losing[losing.length - 1];
      lines.push(
        losing.length === 1
          ? `One shop lost money: ${worst.store}, ${money(Math.abs(worst.profit))} down.`
          : `${losing.length} shops lost money. The worst is ${worst.store}, ${money(Math.abs(worst.profit))} down.`
      );
    }

    sections.push({ q: 'Did we make money?', answer, lines });
  }

  // ---- 2. Which shops are carrying us? -----------------------------------
  if (stores.length) {
    const lines = [];
    const half = topShare(stores, 'amount', 50);
    const best = [...stores].sort((a, b) => b.amount - a.amount)[0];

    const answer = half && half.count <= 3 && half.of > 3
      ? `A few. ${half.count} shop${half.count === 1 ? '' : 's'} out of ${half.of} bring in half our sales.`
      : `${best.label} is our best shop.`;

    if (half) {
      lines.push(
        `${half.count} of ${half.of} shops account for ${Math.round(half.sharePct)}% of everything sold.`
      );
    }
    lines.push(`${best.label} alone did ${money(best.amount)}.`);
    if (half && half.count <= 3 && half.of > 5) {
      lines.push('That is worth knowing before one of them closes or changes hands.');
    }

    sections.push({
      q: 'Which shops are carrying us?',
      answer,
      lines,
      bars: {
        title: 'Best shops by sales',
        rows: barRows(stores, { key: 'amount', format: money }),
      },
    });
  }

  // ---- 3. What is actually selling? --------------------------------------
  if (products.length) {
    const sorted = [...products].sort((a, b) => b.amount - a.amount);
    const top = sorted[0];
    const totalProduct = sum(products, 'amount');
    const topPct = Math.round(pct(top.amount, totalProduct));

    const lines = [`${top.label} is ${topPct}% of sales on its own — ${money(top.amount)}.`];
    const tail = sorted.filter((p) => pct(p.amount, totalProduct) < 5);
    if (tail.length) {
      lines.push(
        `${tail.length} product${tail.length === 1 ? '' : 's'} came to under 5% each. Worth asking whether they earn their space on the van.`
      );
    }

    sections.push({
      q: 'What is actually selling?',
      answer: `${top.label}, mostly.`,
      lines,
      bars: {
        title: 'Sales by product',
        rows: barRows(products, { key: 'amount', format: money }),
      },
    });
  }

  // ---- 4. What are we throwing away? -------------------------------------
  {
    const lines = [];
    let answer;

    if (!totalWastage) {
      answer = 'Nothing was written off.';
      lines.push('No wastage was counted in this period. If that looks wrong, the end-of-shift count may not be getting done.');
    } else {
      const worst = [...wastage].sort((a, b) => b.value - a.value)[0];
      const share = pct(totalWastage, totalSales);
      answer = `${money(totalWastage)} of stock, at what it cost us.`;
      if (totalSales) {
        lines.push(
          `That is ${share.toFixed(1)}% of everything we sold — it comes straight off the profit above.`
        );
      }
      lines.push(`Most of it is ${worst.label}: ${money(worst.value)}.`);
    }

    sections.push({
      q: 'What are we throwing away?',
      answer,
      lines,
      bars: totalWastage
        ? { title: 'Thrown away, by product', rows: barRows(wastage, { key: 'value', format: money }) }
        : null,
    });
  }

  // ---- 5. Who is out there selling? --------------------------------------
  if (people.length) {
    const sorted = [...people].sort((a, b) => b.sales - a.sales);
    const top = sorted[0];
    const lines = [`${top.name} sold the most: ${money(top.sales)}.`];

    // Coverage is the honest one. Somebody can top the sales table and still be
    // leaving half their shops unvisited.
    const withCoverage = people.filter((p) => p.efficiencyPct !== null && p.assignedStores > 0);
    const missing = withCoverage
      .filter((p) => p.efficiencyPct < 100)
      .sort((a, b) => a.efficiencyPct - b.efficiencyPct);

    if (missing.length) {
      const w = missing[0];
      lines.push(
        `${w.name} reached ${w.storesVisited} of ${w.assignedStores} shops. The rest were not visited at all in this period.`
      );
    } else if (withCoverage.length) {
      lines.push('Everyone reached every shop they were given.');
    }

    const pending = people.filter((p) => p.pendingSettlements > 0);
    if (pending.length) {
      const total = pending.reduce((s, p) => s + p.pendingSettlements, 0);
      lines.push(`${total} consignment${total === 1 ? '' : 's'} are still waiting to be settled.`);
    }

    sections.push({
      q: 'Who is out there selling?',
      answer: `${top.name}, on the money. Coverage is the thing to check.`,
      lines,
      bars: { title: 'Sales by person', rows: barRows(people, { key: 'sales', label: 'name', format: money }) },
    });
  }

  // ---- 6. What should I look at this week? -------------------------------
  {
    const todo = [];

    const losing = pnlStores.filter((s) => s.profit < 0);
    if (losing.length) {
      const worst = losing[losing.length - 1];
      todo.push(`${worst.store} is selling at a loss. Check the prices being charged there before sending more stock.`);
    }

    if (totalWastage && totalSales && pct(totalWastage, totalSales) > 3) {
      const worst = [...wastage].sort((a, b) => b.value - a.value)[0];
      todo.push(`Send less ${worst.label}. It is the biggest thing we are throwing away.`);
    }

    const uncovered = people
      .filter((p) => p.efficiencyPct !== null && p.efficiencyPct < 70 && p.assignedStores > 0)
      .sort((a, b) => a.efficiencyPct - b.efficiencyPct);
    if (uncovered.length) {
      const p = uncovered[0];
      todo.push(`${p.name} has ${p.assignedStores - p.storesVisited} shops nobody visited. Either visit them or move them to someone who will.`);
    }

    const half = stores.length ? topShare(stores, 'amount', 50) : null;
    if (half && half.count <= 2 && half.of > 5) {
      todo.push(`Half our sales come from ${half.count} shop${half.count === 1 ? '' : 's'}. Worth opening a few more before that becomes a problem.`);
    }

    if (!todo.length) {
      todo.push('Nothing is flashing red in these numbers. Keep going.');
    }

    sections.push({ q: 'What should I look at this week?', answer: null, lines: todo, isList: true });
  }

  return {
    period: { from, to },
    scope: scope || null,
    sections,
    footnote:
      'Figures come straight from the Grillexa database for the dates shown. Profit is sales minus what the stock cost. Wastage is valued at cost, not at what it would have sold for.',
  };
}
