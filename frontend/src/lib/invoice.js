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

// A monospace, WhatsApp-friendly invoice (wrapped in ``` by the caller so it
// renders aligned) plus a plain-text block of clickable links appended after
// it — links inside a ``` block don't always stay tappable in WhatsApp.
export function buildInvoiceShareText(title, bill, hideCreatedBy) {
  const b = BUSINESS_INFO;
  const dash = '─'.repeat(DASH_WIDTH);

  const block = [
    `╔${'═'.repeat(BOX_WIDTH)}╗`,
    `║${center(`🥗 ${b.name}`, BOX_WIDTH)}║`,
    `╚${'═'.repeat(BOX_WIDTH)}╝`,
    ...(b.tagline ? [b.tagline] : []),
    'OFFICIAL INVOICE',
    '',
    `Invoice #: ${bill.number}`,
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
    '🙏 Thank you for shopping with us!',
    ...(b.tagline ? [b.tagline] : []),
    '',
    'This is a system-generated invoice.',
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

// A properly laid-out PDF (drawn borders, not ASCII art) using the same data.
// jsPDF is loaded on demand so it doesn't add weight to the main bundle for
// people who never click "Download PDF".
export async function downloadInvoicePdf(title, bill, hideCreatedBy) {
  const { jsPDF } = await import('jspdf');
  const b = BUSINESS_INFO;
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  const innerWidth = pageWidth - margin * 2;
  let y = margin;

  doc.setDrawColor(230, 90, 30);
  doc.setLineWidth(0.6);
  doc.rect(margin - 3, margin - 3, innerWidth + 6, doc.internal.pageSize.getHeight() - (margin - 3) * 2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(230, 90, 30);
  doc.text(`🥗 ${b.name}`, pageWidth / 2, y + 6, { align: 'center' });

  if (b.tagline) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(b.tagline, pageWidth / 2, y + 11, { align: 'center' });
  }

  y += 16;
  doc.setFillColor(230, 90, 30);
  doc.rect(margin, y, innerWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('OFFICIAL INVOICE', pageWidth / 2, y + 5, { align: 'center' });
  y += 13;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 30, 30);
  const metaLeft = [`Invoice #: ${bill.number}`, `Date: ${bill.date}`, `Store: ${bill.store}`];
  const metaRight = [
    bill.customerName && `Customer: ${bill.customerName}`,
    bill.customerPhone && `Phone: ${bill.customerPhone}`,
    bill.customerGstin && `GSTIN: ${bill.customerGstin}`,
    !hideCreatedBy && bill.createdBy && `Billed by: ${bill.createdBy}`,
  ].filter(Boolean);
  metaLeft.forEach((line, i) => doc.text(line, margin, y + i * 5));
  metaRight.forEach((line, i) => doc.text(line, pageWidth - margin, y + i * 5, { align: 'right' }));
  y += Math.max(metaLeft.length, metaRight.length) * 5 + 4;

  doc.setDrawColor(210, 210, 210);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  const col = { product: margin, qty: margin + innerWidth * 0.55, price: margin + innerWidth * 0.7, amount: pageWidth - margin };
  doc.text('Product', col.product, y);
  doc.text('Qty', col.qty, y, { align: 'right' });
  doc.text('Price', col.price, y, { align: 'right' });
  doc.text('Amount', col.amount, y, { align: 'right' });
  y += 2;
  doc.setDrawColor(230, 90, 30);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  bill.lines.forEach((l) => {
    const isReturn = l.type === 'RETURN';
    doc.setTextColor(isReturn ? 200 : 30, isReturn ? 40 : 30, isReturn ? 40 : 30);
    const name = isReturn ? `${l.product} (Return)` : l.product;
    doc.text(name, col.product, y, { maxWidth: innerWidth * 0.5 });
    doc.text(String(l.quantity), col.qty, y, { align: 'right' });
    doc.text(`₹${l.unitPrice.toFixed(2)}`, col.price, y, { align: 'right' });
    doc.text(formatCurrency(isReturn ? -l.amount : l.amount), col.amount, y, { align: 'right' });
    y += 6;
  });

  doc.setDrawColor(210, 210, 210);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text('TOTAL', col.product, y);
  doc.text(formatCurrency(bill.totalAmount), col.amount, y, { align: 'right' });
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  if (b.gstin) { doc.text(`GSTIN: ${b.gstin}`, margin, y); y += 4; }
  if (b.fssai) { doc.text(`FSSAI Lic. No: ${b.fssai}`, margin, y); y += 4; }
  b.addressLines.forEach((line) => { doc.text(line, margin, y); y += 4; });

  const contacts = [b.phone, b.email, b.website, b.instagram].filter(Boolean).join('   |   ');
  if (contacts) { y += 1; doc.text(contacts, margin, y); y += 4; }

  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(230, 90, 30);
  doc.text('🙏 Thank you for shopping with us!', pageWidth / 2, y, { align: 'center' });
  y += 6;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  doc.text('This is a system-generated invoice.', pageWidth / 2, y, { align: 'center' });

  doc.save(`${bill.number}.pdf`);
}
