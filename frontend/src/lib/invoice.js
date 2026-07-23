import { formatCurrency } from './format';
import { BUSINESS_INFO } from './businessInfo';

// Keep the boxed header narrow — WhatsApp's mobile app wraps (or in some
// clients, horizontally clips) monospace lines that don't fit the message
// bubble on a small phone screen, which breaks the box border alignment.
// Everything in this box is short, fixed copy we control, so a tight width
// is safe; the itemized list below uses single-line, non-columnar rows
// instead of fixed-width columns, since product names are variable-length
// and would be the first thing to overflow on a narrow screen.
const BOX_WIDTH = 20;
const DASH_WIDTH = 24;

function center(text, width) {
  const t = String(text).length > width ? String(text).slice(0, width) : String(text);
  const pad = width - t.length;
  const left = Math.floor(pad / 2);
  return ' '.repeat(left) + t + ' '.repeat(pad - left);
}

function lineItemRow(l) {
  const isReturn = l.type === 'RETURN';
  const amt = formatCurrency(isReturn ? -l.amount : l.amount);
  return `${l.quantity}x ${l.product}${isReturn ? ' (Return)' : ''} — ${amt}`;
}

// bandLabel/numberLabel/footerMessage let a non-billing document (e.g. a
// Consignment delivery note, where no money is due yet) reuse this same
// template without claiming to be an invoice — defaults preserve the
// original wording for every existing caller (Sales, Dispatches, Settlement).
export function buildInvoiceShareText(
  title,
  bill,
  hideCreatedBy,
  { bandLabel = 'OFFICIAL INVOICE', numberLabel = 'Invoice #', footerMessage = '🙏 Thank you for shopping with us!' } = {}
) {
  const b = BUSINESS_INFO;
  const dash = '─'.repeat(DASH_WIDTH);

  const block = [
    `╔${'═'.repeat(BOX_WIDTH)}╗`,
    `║${center(`🥗 ${b.name}`, BOX_WIDTH)}║`,
    `╚${'═'.repeat(BOX_WIDTH)}╝`,
    ...(b.tagline ? [b.tagline] : []),
    bandLabel,
    '',
    `${numberLabel}: ${bill.number}`,
    `Date: ${bill.date}`,
    `Store: ${bill.store}`,
    ...(bill.customerName ? [`Customer: ${bill.customerName}`] : []),
    ...(bill.customerPhone ? [`Phone: ${bill.customerPhone}`] : []),
    ...(bill.customerGstin ? [`GSTIN: ${bill.customerGstin}`] : []),
    ...(!hideCreatedBy && bill.createdBy ? [`Billed by: ${bill.createdBy}`] : []),
    '',
    dash,
    ...bill.lines.map(lineItemRow),
    dash,
    `TOTAL: ${formatCurrency(bill.totalAmount)}`,
    dash,
    '',
    ...(b.gstin ? [`GSTIN: ${b.gstin}`] : []),
    ...(b.fssai ? [`FSSAI Lic. No: ${b.fssai}`] : []),
    ...(b.addressLines.length ? b.addressLines : []),
    '',
    footerMessage,
    ...(b.tagline ? [b.tagline] : []),
    '',
    'This is a system-generated document.',
  ].join('\n');

  const contactLines = [
    b.phone && `📞 ${b.phone}`,
    b.email && `✉️ ${b.email}`,
    b.website && `🌐 ${b.website}`,
    b.instagram && `📸 ${b.instagram}`,
    b.reviewLink && `⭐ Leave us a review: ${b.reviewLink}`,
    b.whatsappChannelLink && `💬 Join our WhatsApp channel: ${b.whatsappChannelLink}`,
  ].filter(Boolean);

  return ['```', block, '```', ...(contactLines.length ? ['', ...contactLines] : [])].join('\n');
}

// jsPDF's built-in fonts (Helvetica/Courier) are WinAnsi-only and have no ₹
// glyph — it renders as a broken superscript and throws off text-width
// calculations, clipping the digits after it. Use "Rs." in the PDF only;
// the WhatsApp text and on-screen views keep ₹ since those render with a
// real Unicode font.
function formatCurrencyPdf(amount) {
  const value = Number(amount) || 0;
  return value < 0 ? `-Rs.${Math.abs(value).toFixed(2)}` : `Rs.${value.toFixed(2)}`;
}

// Mirrors the WhatsApp text invoice's look: a double-ruled box around the
// store name, a monospace (Courier) typeface throughout, and dashed rules
// around the item list — rather than the helvetica/table layout a normal
// PDF invoice would use. jsPDF is loaded on demand so it doesn't add weight
// to the main bundle for people who never click "Download PDF".
export async function downloadInvoicePdf(
  title,
  bill,
  hideCreatedBy,
  { bandLabel = 'OFFICIAL INVOICE', numberLabel = 'Invoice #', footerMessage = 'Thank you for shopping with us!' } = {}
) {
  const { jsPDF } = await import('jspdf');
  const b = BUSINESS_INFO;
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  const innerWidth = pageWidth - margin * 2;
  const center = pageWidth / 2;
  let y = margin;

  const dashLine = (yy) => {
    doc.setFont('courier', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(120, 120, 120);
    doc.text('-'.repeat(Math.floor(innerWidth / 1.6)), center, yy, { align: 'center' });
  };

  // Double-ruled box around the store name, echoing the ╔═╗ WhatsApp header.
  const boxTop = y;
  const boxHeight = 12;
  doc.setDrawColor(230, 90, 30);
  doc.setLineWidth(0.6);
  doc.rect(margin, boxTop, innerWidth, boxHeight);
  doc.setLineWidth(0.25);
  doc.rect(margin + 1.2, boxTop + 1.2, innerWidth - 2.4, boxHeight - 2.4);

  doc.setFont('courier', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(230, 90, 30);
  doc.text(`${b.name}`, center, boxTop + boxHeight / 2 + 2, { align: 'center' });
  y = boxTop + boxHeight + 5;

  if (b.tagline) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(b.tagline, center, y, { align: 'center' });
    y += 5;
  }

  doc.setFont('courier', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text(bandLabel, center, y, { align: 'center' });
  y += 8;

  doc.setFont('courier', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 30, 30);
  const metaLines = [
    `${numberLabel}: ${bill.number}`,
    `Date: ${bill.date}`,
    `Store: ${bill.store}`,
    ...(bill.customerName ? [`Customer: ${bill.customerName}`] : []),
    ...(bill.customerPhone ? [`Phone: ${bill.customerPhone}`] : []),
    ...(bill.customerGstin ? [`GSTIN: ${bill.customerGstin}`] : []),
    ...(!hideCreatedBy && bill.createdBy ? [`Billed by: ${bill.createdBy}`] : []),
  ];
  metaLines.forEach((line) => { doc.text(line, margin, y); y += 5; });
  y += 2;

  dashLine(y);
  y += 6;

  doc.setFont('courier', 'normal');
  doc.setFontSize(9.5);
  bill.lines.forEach((l) => {
    const isReturn = l.type === 'RETURN';
    doc.setTextColor(isReturn ? 200 : 30, isReturn ? 40 : 30, isReturn ? 40 : 30);
    const amt = formatCurrencyPdf(isReturn ? -l.amount : l.amount);
    const label = `${l.quantity}x ${l.product}${isReturn ? ' (Return)' : ''}`;
    doc.text(label, margin, y, { maxWidth: innerWidth * 0.65 });
    doc.text(amt, pageWidth - margin, y, { align: 'right' });
    y += 6;
  });

  dashLine(y);
  y += 7;

  doc.setFont('courier', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text(`TOTAL: ${formatCurrencyPdf(bill.totalAmount)}`, center, y, { align: 'center' });
  y += 6;

  dashLine(y);
  y += 8;

  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  if (b.gstin) { doc.text(`GSTIN: ${b.gstin}`, center, y, { align: 'center' }); y += 4; }
  if (b.fssai) { doc.text(`FSSAI Lic. No: ${b.fssai}`, center, y, { align: 'center' }); y += 4; }
  b.addressLines.forEach((line) => { doc.text(line, center, y, { align: 'center' }); y += 4; });

  const contacts = [b.phone, b.email, b.website, b.instagram].filter(Boolean).join('   |   ');
  if (contacts) { y += 1; doc.text(contacts, center, y, { align: 'center' }); y += 4; }

  y += 4;
  doc.setFont('courier', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(230, 90, 30);
  doc.text(footerMessage, center, y, { align: 'center' });
  y += 5;

  if (b.tagline) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(b.tagline, center, y, { align: 'center' });
    y += 6;
  }

  doc.setFont('courier', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  doc.text('This is a system-generated invoice.', center, y, { align: 'center' });

  doc.save(`${bill.number}.pdf`);
}
