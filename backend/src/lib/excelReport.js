const ExcelJS = require('exceljs');

// The workbook a manager downloads from Reports. Takes data already
// aggregated by lib/analytics.js and only decides how it looks — so the
// figures here are the same ones the charts drew, by construction.
//
// exceljs rather than SheetJS: the free build of SheetJS cannot write bold or
// filled cells (styling is a paid feature there), and bold, filled headers on
// a frozen row are most of what makes six sheets readable. Both write .xlsx,
// so this is the only file that would change to swap back.

// Petrol and flame, the same two colours the app uses.
const HEADER_FILL = 'FF052A33';
const HEADER_TEXT = 'FFEAF6F8';

// Excel number formats. The rupee is quoted so Excel prints it literally
// instead of trying to resolve it as a currency code, and percentages are
// stored as plain numbers (12.34, not 0.1234) with the sign glued on — the
// alternative silently multiplies every figure by 100.
const MONEY = '"₹"#,##0.00';
const PERCENT = '0.00"%"';
const DATE = 'dd/mm/yyyy';
const INT = '#,##0';

// exceljs has no auto-fit — the width has to be measured. Header text counts
// too (it is the widest cell on an empty sheet), and everything is capped so
// one long address cannot push a column off the screen.
function autoWidth(ws) {
  ws.columns.forEach((column) => {
    let widest = String(column.header || '').length;
    column.eachCell({ includeEmpty: false }, (cell) => {
      const value = cell.value instanceof Date ? 'dd/mm/yyyy' : cell.value;
      const text = value === null || value === undefined ? '' : String(value);
      // Money and dates render wider than their raw value ("4200" prints as
      // "₹4,200.00"), so the format gets a small allowance.
      const rendered = cell.numFmt === MONEY ? text.length + 5 : text.length;
      if (rendered > widest) widest = rendered;
    });
    column.width = Math.min(Math.max(widest + 2, 10), 42);
  });
}

function addSheet(workbook, name, columns, rows) {
  // Frozen header: six sheets of a month's data are all scrolled, and a
  // column of bare numbers with the heading off-screen is unreadable.
  const ws = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    style: c.numFmt ? { numFmt: c.numFmt } : undefined,
  }));

  for (const row of rows) ws.addRow(row);

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: HEADER_TEXT } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  header.alignment = { vertical: 'middle' };
  header.height = 20;

  // A filter on the header row: six sheets of raw rows are worth sorting and
  // filtering, and it costs one line.
  if (rows.length) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }

  autoWidth(ws);
  return ws;
}

function buildWorkbook(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Grillexa';
  workbook.created = new Date();

  const { from, to, summary, stores, products, salespeople, consignments, wastage } = report;

  // ---- 1. Summary ----------------------------------------------------
  // Label/value rather than a header row of twelve columns: this sheet is
  // read, not sorted.
  const summarySheet = workbook.addWorksheet('Summary', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  summarySheet.columns = [
    { header: 'Measure', key: 'measure' },
    { header: 'Value', key: 'value' },
  ];
  const summaryRows = [
    ['Period', `${from} to ${to}`],
    ['Stores covered', summary.storeFilter],
    ['Total sales', summary.totalSales, MONEY],
    ['Bills raised', summary.billCount, INT],
    ['Consignments delivered', summary.consignmentCount, INT],
    ['Consignment value delivered', summary.consignmentValue, MONEY],
    ['Settlements recorded', summary.settlementCount, INT],
    ['Consignments still unsettled past the grace period', summary.pendingCount, INT],
    ['Total wastage (units)', summary.wastageUnits, INT],
    ['Total wastage (cost)', summary.wastageValue, MONEY],
    ['Stores visited', summary.storesVisited, INT],
    ['Stores missed (no activity in the period)', summary.storesMissed, INT],
  ];
  for (const [measure, value, numFmt] of summaryRows) {
    const row = summarySheet.addRow({ measure, value });
    if (numFmt) row.getCell('value').numFmt = numFmt;
  }
  summarySheet.getColumn('measure').font = { bold: false };
  const summaryHeader = summarySheet.getRow(1);
  summaryHeader.font = { bold: true, color: { argb: HEADER_TEXT } };
  summaryHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  summaryHeader.height = 20;
  autoWidth(summarySheet);

  // ---- 2. Store Performance -------------------------------------------
  addSheet(
    workbook,
    'Store Performance',
    [
      { header: 'Store', key: 'store' },
      // The schema has no city column — the address is one composed string
      // (see lib/geocode.js), so it goes out whole rather than guessed apart.
      { header: 'Address', key: 'address' },
      { header: 'Sales people', key: 'salespeople' },
      { header: 'Sales (₹)', key: 'sales', numFmt: MONEY },
      { header: 'Wastage (₹)', key: 'wastageValue', numFmt: MONEY },
      { header: 'Consignments', key: 'consignments', numFmt: INT },
      { header: 'Last visit', key: 'lastVisit', numFmt: DATE },
      { header: 'Status', key: 'status' },
    ],
    stores
  );

  // ---- 3. Product Performance -----------------------------------------
  addSheet(
    workbook,
    'Product Performance',
    [
      { header: 'Product', key: 'name' },
      { header: 'Units sold', key: 'units', numFmt: INT },
      { header: 'Revenue (₹)', key: 'revenue', numFmt: MONEY },
      { header: 'Cost (₹)', key: 'cost', numFmt: MONEY },
      { header: 'Profit (₹)', key: 'profit', numFmt: MONEY },
      { header: 'Wastage (units)', key: 'wastageUnits', numFmt: INT },
      { header: 'Wastage (₹)', key: 'wastageValue', numFmt: MONEY },
      { header: 'Margin %', key: 'marginPct', numFmt: PERCENT },
    ],
    products
  );

  // ---- 4. Salesperson Performance --------------------------------------
  addSheet(
    workbook,
    'Salesperson Performance',
    [
      { header: 'Sales person', key: 'name' },
      { header: 'Role', key: 'role' },
      { header: 'Stores assigned', key: 'assignedStores', numFmt: INT },
      { header: 'Stores visited', key: 'storesVisited', numFmt: INT },
      { header: 'Sales (₹)', key: 'sales', numFmt: MONEY },
      { header: 'Settlements', key: 'settlements', numFmt: INT },
      { header: 'Pending settlements', key: 'pendingSettlements', numFmt: INT },
      { header: 'Coverage %', key: 'efficiencyPct', numFmt: PERCENT },
    ],
    salespeople
  );

  // ---- 5. Consignment Summary ------------------------------------------
  // No wastage column: wastage is recorded against a store and a day, never
  // against the consignment the stock arrived on, so any figure here would be
  // invented. It is on the Wastage Breakdown sheet at the grain it exists at.
  addSheet(
    workbook,
    'Consignment Summary',
    [
      { header: 'Consignment #', key: 'consignmentNo' },
      { header: 'Store', key: 'store' },
      { header: 'Delivered', key: 'deliveredAt', numFmt: DATE },
      { header: 'Status', key: 'status' },
      { header: 'Delivered qty', key: 'deliveredQty', numFmt: INT },
      { header: 'Sold qty', key: 'soldQty', numFmt: INT },
      { header: 'Returned qty', key: 'returnedQty', numFmt: INT },
      { header: 'Unsettled qty', key: 'openQty', numFmt: INT },
      { header: 'Value (₹)', key: 'value', numFmt: MONEY },
    ],
    consignments
  );

  // ---- 6. Wastage Breakdown --------------------------------------------
  // No reason column: wastage is a counter on the daily stock ledger, not an
  // event log — there is no per-entry record to hang a reason on. Returns are
  // the ledger that carries reasons.
  addSheet(
    workbook,
    'Wastage Breakdown',
    [
      { header: 'Date', key: 'date', numFmt: DATE },
      { header: 'Store', key: 'store' },
      { header: 'Product', key: 'product' },
      { header: 'Quantity', key: 'quantity', numFmt: INT },
      { header: 'Value (₹)', key: 'value', numFmt: MONEY },
    ],
    wastage
  );

  return workbook;
}

module.exports = { buildWorkbook, MONEY, PERCENT, DATE, INT };
