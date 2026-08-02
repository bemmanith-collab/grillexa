// A Consignment Note is not a tax invoice. Saying otherwise on a document
// that goes to a shopkeeper is a compliance problem, not a cosmetic one — and
// it happened: the PDF button called downloadInvoicePdf without passing
// documentOptions, so the same delivery note read "CONSIGNMENT NOTE — NOT A
// TAX INVOICE" on screen and in WhatsApp, and "OFFICIAL INVOICE" as a PDF.
// Nothing on screen showed the difference; you had to open the file.
//
// Both renderers are checked against the same options here, so neither can
// drift from the other again.
//
// Run: npm test (from frontend/). No browser: jsPDF builds the document in
// Node, and the finished PDF is searched for the words it printed.

import assert from 'node:assert/strict';
import { buildInvoiceShareText, buildInvoicePdf } from '../src/lib/invoice.js';

const BILL = {
  number: 'CN-000123',
  date: '2026-08-02',
  store: 'Sri Balaji Kirana',
  createdBy: 'Vijay',
  totalAmount: 1240.5,
  lines: [
    { quantity: 20, product: 'Sprouts 200g', amount: 900, type: 'SALE' },
    { quantity: 4, product: 'Fruit Bowl', amount: 340.5, type: 'SALE' },
  ],
};

const CONSIGNMENT = {
  bandLabel: 'CONSIGNMENT NOTE — NOT A TAX INVOICE',
  numberLabel: 'Consignment #',
  footerMessage: 'No payment is due yet — this stock is settled later based on what actually sells.',
};

// jsPDF writes uncompressed content streams by default, so the strings it
// drew are readable in the raw bytes. latin1 because the PDF is bytes, not
// UTF-8 text — an em dash is one WinAnsi byte, which is why the assertions
// below match on the ASCII part of a label rather than the whole thing.
async function pdfText(documentOptions) {
  const doc = await buildInvoicePdf('Consignment Note', BILL, false, documentOptions);
  return Buffer.from(doc.output('arraybuffer')).toString('latin1');
}

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok   ${name}`))
    .catch((err) => {
      console.error(`FAIL ${name}\n     ${err.message}`);
      process.exitCode = 1;
    });
}

const tests = [
  check('a bill with no options is still an OFFICIAL INVOICE', () => {
    const text = buildInvoiceShareText('Sale', BILL, false);
    assert.match(text, /OFFICIAL INVOICE/);
    assert.match(text, /Invoice #: CN-000123/);
  }),

  check('the share text uses the labels it was given', () => {
    const text = buildInvoiceShareText('Consignment Note', BILL, false, CONSIGNMENT);
    assert.match(text, /CONSIGNMENT NOTE — NOT A TAX INVOICE/);
    assert.match(text, /Consignment #: CN-000123/);
    assert.doesNotMatch(text, /OFFICIAL INVOICE/);
    assert.doesNotMatch(text, /Invoice #/);
  }),

  check('a PDF with no options is still an OFFICIAL INVOICE', async () => {
    const pdf = await pdfText(undefined);
    assert.ok(pdf.includes('OFFICIAL INVOICE'), 'band should default to OFFICIAL INVOICE');
    assert.ok(pdf.includes('Invoice #'), 'number label should default to Invoice #');
  }),

  // The regression itself.
  check('the PDF uses the labels it was given', async () => {
    const pdf = await pdfText(CONSIGNMENT);
    assert.ok(pdf.includes('CONSIGNMENT NOTE'), 'band label missing from the PDF');
    assert.ok(pdf.includes('Consignment #'), 'number label missing from the PDF');
    assert.ok(!pdf.includes('OFFICIAL INVOICE'), 'PDF still claims to be an official invoice');
    assert.ok(!pdf.includes('Invoice #'), 'PDF still labels the number as an invoice number');
  }),

  check('no document calls itself an invoice in the small print', async () => {
    const pdf = await pdfText(CONSIGNMENT);
    assert.ok(!pdf.includes('system-generated invoice'), 'footer still says invoice');
    assert.ok(pdf.includes('system-generated document'), 'footer disclaimer missing');
  }),

  // The prices on a consignment note are what the goods will settle at, so a
  // wrong total is a wrong amount owed. Rs. rather than the rupee sign is
  // deliberate: jsPDF's built-in fonts have no glyph for it.
  check('the PDF total is the bill total, written in Rs.', async () => {
    const pdf = await pdfText(CONSIGNMENT);
    assert.ok(pdf.includes('TOTAL: Rs.1240.50'), 'total missing or misformatted');
  }),
];

await Promise.all(tests);
if (!process.exitCode) console.log('\nall checks passed');
