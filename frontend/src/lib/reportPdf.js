// Draws the narrative report as a PDF.
//
// Text is drawn directly rather than screenshotting the page. html2canvas would
// have been fewer lines and would have produced a blurry raster you cannot
// select, search or print properly — which is the whole point of a document
// somebody forwards.
//
// jsPDF is imported on demand, the same way invoice.js does it, so it stays out
// of the main bundle for everyone who never presses the button.

import { buildReport } from './reportNarrative.js';
import { formatDate } from '../utils/date.js';

// jsPDF's built-in fonts are WinAnsi-only and have no ₹ glyph — it renders as a
// broken superscript and throws the text-width maths off, clipping the digits
// after it. Same reason invoice.js carries its own formatter.
function money(amount) {
  const value = Number(amount) || 0;
  const body = Math.abs(value).toFixed(2);
  return value < 0 ? `-Rs.${body}` : `Rs.${body}`;
}

// Ink and accents. Green is chrome only and never encodes a value against red:
// Grillexa's brand green and brand red are 4.2 apart for a red-green colourblind
// reader, which makes "good" and "bad" the same colour. Bars are blue, and every
// bar carries its number in text so the colour is never doing the work alone.
const INK = [26, 29, 23];
const INK_2 = [71, 76, 64];
const INK_3 = [121, 126, 112];
const GREEN = [46, 125, 50];
const BAR = [42, 120, 214];
const BAR_SOFT = [201, 222, 246];
const RULE = [229, 227, 217];

const PAGE_W = 210;
const PAGE_H = 297;
const M = 16;
const CONTENT_W = PAGE_W - M * 2;
const BOTTOM = PAGE_H - 18;

export async function buildReportPdf(data) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const report = buildReport(data, { money });

  let y = 0;
  let page = 1;

  const paintGround = () => {
    doc.setFillColor(252, 251, 247);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  };

  // Every page gets the ground and the footer; only the first gets the title.
  const startPage = () => {
    paintGround();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...INK_3);
    doc.text('Grillo · ' + formatDate(report.period.from) + ' to ' + formatDate(report.period.to), M, PAGE_H - 10);
    doc.text(String(page), PAGE_W - M, PAGE_H - 10, { align: 'right' });
  };

  const newPage = () => {
    doc.addPage();
    page += 1;
    startPage();
    y = 22;
  };

  // Nothing here is worth splitting across a page — a question stranded from its
  // answer, or a bar chart with two bars on one page and three on the next.
  const need = (h) => {
    if (y + h > BOTTOM) newPage();
  };

  const paragraph = (text, { size = 9.6, colour = INK_2, style = 'normal', gap = 3.4, width = CONTENT_W } = {}) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...colour);
    const lines = doc.splitTextToSize(text, width);
    const lineH = size * 0.52;
    need(lines.length * lineH);
    doc.text(lines, M, y);
    y += lines.length * lineH + gap;
  };

  // ---- title block --------------------------------------------------------
  startPage();
  y = 26;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...GREEN);
  doc.text('GRILLO · SALES REPORT', M, y);
  y += 9;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(23);
  doc.setTextColor(...INK);
  doc.text('How the shops did', M, y);
  y += 9;

  paragraph(
    formatDate(report.period.from) + ' to ' + formatDate(report.period.to)
      + (report.scope ? ' · ' + report.scope : ''),
    { size: 10.5, colour: INK_2, gap: 5 }
  );

  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.3);
  doc.line(M, y, PAGE_W - M, y);
  y += 8;

  // ---- sections -----------------------------------------------------------
  for (const section of report.sections) {
    // Keep the question with at least its answer line.
    need(20);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13.5);
    doc.setTextColor(...INK);
    const qLines = doc.splitTextToSize(section.q, CONTENT_W);
    doc.text(qLines, M, y);
    y += qLines.length * 6.2 + 2.5;

    if (section.answer) {
      paragraph(section.answer, { size: 11, colour: INK, style: 'bold', gap: 3.6 });
    }

    if (section.isList) {
      for (const line of section.lines) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.6);
        const lines = doc.splitTextToSize(line, CONTENT_W - 6);
        need(lines.length * 5 + 1.5);
        doc.setFillColor(...GREEN);
        doc.circle(M + 1.2, y - 1.4, 0.8, 'F');
        doc.setTextColor(...INK_2);
        doc.text(lines, M + 6, y);
        y += lines.length * 5 + 1.8;
      }
      y += 2;
    } else {
      for (const line of section.lines) paragraph(line);
    }

    if (section.bars && section.bars.rows.length) {
      drawBars(doc, section.bars, () => y, (next) => { y = next; }, need);
    }

    y += 5;
    need(6);
    doc.setDrawColor(...RULE);
    doc.line(M, y, PAGE_W - M, y);
    y += 7;
  }

  // ---- footnote -----------------------------------------------------------
  y += 1;
  paragraph(report.footnote, { size: 7.6, colour: INK_3, gap: 0 });

  return doc;
}

// Shorten to fit, and say so. splitTextToSize's first line was being used before
// and it drops the overflow silently — "Guru krupa Kirana store (Rocky)" came out
// as "Guru krupa Kirana store", quietly losing the rep tag that tells you whose
// shop it is. A visible "..." is a shortened name; a clean one is a wrong name.
//
// Three dots rather than a real ellipsis for the same reason the rupee sign is
// avoided here: the built-in fonts are WinAnsi and not every glyph survives.
function fit(doc, text, width) {
  const label = String(text ?? '').trim() || '—';
  if (doc.getTextWidth(label) <= width) return label;
  let cut = label;
  while (cut.length > 1 && doc.getTextWidth(cut + '...') > width) cut = cut.slice(0, -1);
  return cut.trimEnd() + '...';
}

// A row is: name, a bar, and the number. The number is always printed — the bar
// is there to make the shape obvious at a glance, not to be measured.
function drawBars(doc, bars, getY, setY, need) {
  let y = getY();

  const LABEL_W = 42;
  const BAR_X = M + LABEL_W + 3;
  const VALUE_W = 30;
  const BAR_MAX = PAGE_W - M - VALUE_W - BAR_X - 3;

  need(8 + bars.rows.length * 6.5);
  y = getY();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(...INK_2);
  doc.text(bars.title, M, y);
  y += 5;

  for (const row of bars.rows) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.4);
    doc.setTextColor(...INK_2);
    doc.text(fit(doc, row.label, LABEL_W), M, y);

    const w = Math.max(0.8, BAR_MAX * row.fraction);
    // The longest bar is solid; the rest sit back a shade so the top row reads
    // first. Length still carries the value — the tint is not a second scale.
    doc.setFillColor(...(row.fraction >= 0.999 ? BAR : BAR_SOFT));
    doc.roundedRect(BAR_X, y - 2.6, w, 3.4, 0.6, 0.6, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(...INK_2);
    doc.text(row.display, PAGE_W - M, y, { align: 'right' });

    y += 6.5;
  }

  setY(y + 1);
}

/** Grillexa-Report-2026-08-01-to-2026-08-26.pdf */
export function reportFileName({ from, to }) {
  return `Grillexa-Report-${from}-to-${to}.pdf`;
}
