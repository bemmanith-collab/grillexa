const ExcelJS = require('exceljs');
const { addSheet, MONEY, PERCENT, INT } = require('./excelReport');

// The Delivery report as a workbook: the same object GET /reports/delivery
// returns, so the download and the screen cannot disagree. Sheet 1 is laid out
// like the store sheet the team kept by hand — a product heading over Sold /
// Ret (/ Exch) columns and a yellow TOTAL row.

const HEAD = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF052A33' } };
const HEAD_FONT = { bold: true, color: { argb: 'FFEAF6F8' } };
const TOTAL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF200' } };
const RET_FONT = { color: { argb: 'FFB54708' }, bold: true };
const SOURCE = { CONSIGNMENT: 'Consignment', DIRECT: 'Direct' };

function storeSheet(workbook, report) {
  const ws = workbook.addWorksheet('Store sheet', { views: [{ state: 'frozen', ySplit: 2, xSplit: 2 }] });
  const products = report.products;
  const exch = new Set(products.filter((p) => p.exchanged > 0).map((p) => p.id));

  const top = ['SL.NO', 'STORE NAME', 'PERSON', 'TYPE'];
  const sub = ['', `${report.from} to ${report.to}`, '', ''];
  const spans = [];
  for (const p of products) {
    const width = exch.has(p.id) ? 3 : 2;
    spans.push([top.length + 1, top.length + width]);
    top.push(p.name.toUpperCase(), ...Array(width - 1).fill(''));
    sub.push('SALES', 'RETURNS', ...(exch.has(p.id) ? ['EXCHANGES'] : []));
  }
  top.push('DELIVERED', 'MADE', 'LOSS');
  sub.push('', '', '');
  ws.addRow(top);
  ws.addRow(sub);
  for (const [a, b] of spans) if (b > a) ws.mergeCells(1, a, 1, b);
  for (const r of [1, 2]) {
    const row = ws.getRow(r);
    row.font = HEAD_FONT;
    row.fill = HEAD;
    row.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  const blank = (n) => (n ? n : null); // like the hand-kept sheet: zero is an empty cell
  report.rows.forEach((r, i) => {
    const cells = [i + 1, r.store, r.person, SOURCE[r.source]];
    for (const p of products) {
      const c = r.cells[p.id] || {};
      cells.push(blank(c.sold), blank(c.returned), ...(exch.has(p.id) ? [blank(c.exchanged)] : []));
    }
    cells.push(r.delivered, r.revenue, r.loss);
    const row = ws.addRow(cells);
    // Returns in orange, as on screen.
    let col = 5;
    for (const p of products) {
      row.getCell(col + 1).font = RET_FONT;
      col += exch.has(p.id) ? 3 : 2;
    }
  });

  const total = ['', 'TOTAL', '', ''];
  for (const p of products) total.push(p.sold, p.returned, ...(exch.has(p.id) ? [p.exchanged] : []));
  total.push(report.totals.delivered, report.totals.revenue, report.totals.loss);
  const totalRow = ws.addRow(total);
  totalRow.font = { bold: true };
  totalRow.fill = TOTAL;

  const last = top.length;
  ws.getColumn(last - 1).numFmt = MONEY;
  ws.getColumn(last).numFmt = MONEY;
  ws.columns.forEach((c, i) => {
    c.width = i === 1 ? 30 : i === 2 ? 16 : i < 4 ? 12 : i >= last - 2 ? 13 : 10;
  });
}

function buildDeliveryWorkbook(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Grillexa';
  workbook.created = new Date();

  storeSheet(workbook, report);

  addSheet(
    workbook,
    'Bills',
    [
      { header: 'Bill', key: 'number' },
      { header: 'Store', key: 'store' },
      { header: 'Billed by', key: 'person' },
      { header: 'Type', key: 'type' },
      { header: 'Amount', key: 'amount', numFmt: MONEY },
      { header: 'Generated', key: 'generatedAt', numFmt: 'dd/mm/yyyy hh:mm' },
      { header: 'Last edited', key: 'editedAt', numFmt: 'dd/mm/yyyy hh:mm' },
    ],
    report.bills.map((b) => ({
      ...b,
      type: SOURCE[b.source],
      // Excel has no time zones; write the India wall-clock time it was.
      generatedAt: ist(b.generatedAt),
      editedAt: b.editedAt ? ist(b.editedAt) : null,
    }))
  );

  const money = (key, header) => ({ header, key, numFmt: MONEY });
  const qty = (key, header) => ({ header, key, numFmt: INT });
  addSheet(
    workbook,
    'Each store',
    [
      { header: 'Store', key: 'label' },
      qty('delivered', 'Delivered'), qty('sold', 'Sold'), qty('returned', 'Returned'),
      qty('exchanged', 'Exchanged'), qty('pending', 'Pending'),
      money('revenue', 'Made'), money('cost', 'Cost'), money('loss', 'Loss'), money('profit', 'Profit'),
      { header: 'Return rate', key: 'returnRatePct', numFmt: PERCENT },
    ],
    report.stores
  );
  addSheet(
    workbook,
    'Each person',
    [
      { header: 'Person', key: 'label' },
      qty('delivered', 'Delivered'), qty('sold', 'Sold'), qty('returned', 'Returned'), qty('exchanged', 'Exchanged'),
      money('revenueConsignment', 'Made (consignment)'), money('revenueDirect', 'Made (direct)'),
      money('loss', 'Loss'), money('profit', 'Profit'),
      { header: 'Return rate', key: 'returnRatePct', numFmt: PERCENT },
    ],
    report.people
  );
  addSheet(
    workbook,
    'Suggestions',
    [
      { header: '#', key: 'n' },
      { header: 'Suggestion', key: 'title' },
      { header: 'Why', key: 'detail' },
      { header: 'About', key: 'impact', numFmt: MONEY },
    ],
    report.suggestions.map((s, i) => ({ n: i + 1, ...s, impact: s.impact || null }))
  );

  return workbook;
}

// A Date whose UTC fields read as India time, so Excel shows 4:31 pm, not 11:01 am.
function ist(value) {
  return new Date(new Date(value).getTime() + 330 * 60000);
}

module.exports = { buildDeliveryWorkbook };
