import React, { useEffect, useState } from 'react';
import { Printer, Share2, MessageCircle, Check, Copy, FileDown } from 'lucide-react';
import client from '../api/client';
import { formatCurrency } from '../lib/format';
import { formatDate } from '../utils/date';
import { ALL_RETURN_REASON_LABELS } from '../lib/returnReasons';
import { BUSINESS_INFO } from '../lib/businessInfo';
import { buildInvoiceShareText, downloadInvoicePdf } from '../lib/invoice';
import logoIcon from '../assets/grillexa-icon.png';

const REASON_LABEL = Object.fromEntries(ALL_RETURN_REASON_LABELS.map((r) => [r.value, r.label]));

// documentOptions lets a non-billing document (e.g. a Consignment delivery
// note — stock transferred but no money owed yet) reuse this same
// print/share UI without visually claiming to be a paid invoice. Omit it
// for anything that's actually a bill (Sales, Dispatches, Settlement).
export default function BillDetailModal({ title, bill, onClose, hideCreatedBy, documentOptions }) {
  const hasReturns = bill.lines.some((l) => l.type === 'RETURN');
  const [copied, setCopied] = useState(false);
  const b = BUSINESS_INFO;
  const bandLabel = documentOptions?.bandLabel || 'OFFICIAL INVOICE';

  // The day's customer line from the Wisdom Planner, printed where the fixed
  // "Thank you for shopping with us" used to be — the one thing on this
  // screen a customer actually takes away with them.
  //
  // Fetched here rather than passed in by each page: the bill is the only
  // place it belongs, and one component asking for it means no caller can
  // forget to. A document that brings its own footer (a Consignment Note says
  // no payment is due yet) keeps it — that goes to a shopkeeper, not a
  // customer, and is not the place for a word about breakfast.
  const [wisdom, setWisdom] = useState('');
  useEffect(() => {
    if (documentOptions?.footerMessage) return undefined;
    let cancelled = false;
    client
      .get('/quotes/today', { params: { audience: 'CUSTOMER' } })
      .then((res) => {
        if (!cancelled && res.data.message) setWisdom(res.data.message.text);
      })
      .catch(() => {
        /* the bill prints with its usual thank-you */
      });
    return () => {
      cancelled = true;
    };
  }, [documentOptions?.footerMessage]);

  const footerMessage =
    documentOptions?.footerMessage || wisdom || '🙏 Thank you for shopping with us!';

  // Every document helper takes the same four arguments, assembled here and
  // nowhere else. They used to be spelled out at each call site, and the PDF
  // button was written without the fourth — so a Consignment Note printed
  // "OFFICIAL INVOICE" while the same note copied to WhatsApp did not. One
  // caller cannot fall out of step with the others if there is one caller.
  // …including the footer resolved above, so the PDF and the WhatsApp text
  // carry the same line as the bill on screen.
  const render = (fn) => fn(title, bill, hideCreatedBy, { ...documentOptions, footerMessage });

  async function copyInvoice() {
    await navigator.clipboard.writeText(render(buildInvoiceShareText));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function shareWhatsApp() {
    const text = render(buildInvoiceShareText);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  async function shareGeneric() {
    try {
      await navigator.share({ title: `${title} ${bill.number}`, text: render(buildInvoiceShareText) });
    } catch (err) {
      // user dismissed the native share sheet — nothing to do
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal bill-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bill-brand">
          <img src={logoIcon} alt="" className="bill-brand-icon" />
          <div>
            <div className="bill-brand-name">🥗 {b.name}</div>
            {b.tagline && <div className="bill-brand-tagline">{b.tagline}</div>}
          </div>
        </div>

        <div className="bill-official-tag">{bandLabel}</div>

        <div className="bill-header">
          <div>
            <h3>{title}</h3>
            <p className="modal-help">{bill.number}</p>
          </div>
          <div className="bill-meta">
            <div><strong>Date:</strong> {formatDate(bill.date)}</div>
            <div><strong>Store:</strong> {bill.store}</div>
            {!hideCreatedBy && <div><strong>By:</strong> {bill.createdBy}</div>}
          </div>
        </div>

        {(bill.customerName || bill.customerPhone || bill.customerGstin) && (
          <div className="bill-customer">
            {bill.customerName && <div><strong>Customer:</strong> {bill.customerName}</div>}
            {bill.customerPhone && <div><strong>Phone:</strong> {bill.customerPhone}</div>}
            {bill.customerGstin && <div><strong>GSTIN:</strong> {bill.customerGstin}</div>}
          </div>
        )}

        <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Quantity</th>
              <th>Unit Price</th>
              {hasReturns && <th>Reason</th>}
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {bill.lines.map((l) => {
              const isReturn = l.type === 'RETURN';
              return (
                <tr key={l.id} className={isReturn ? 'line-return' : undefined}>
                  <td>{l.product}{isReturn && <span className="badge badge-critical" style={{ marginLeft: 8 }}>Return</span>}</td>
                  <td>{l.quantity}</td>
                  <td>₹{l.unitPrice.toFixed(2)}</td>
                  {hasReturns && <td>{isReturn ? REASON_LABEL[l.reason] || l.reason : <span className="cell-muted">—</span>}</td>}
                  <td className={isReturn ? 'text-danger' : undefined}>{formatCurrency(isReturn ? -l.amount : l.amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        <div className="bill-total">Total: {formatCurrency(bill.totalAmount)}</div>

        <div className="bill-footer">
          {(b.gstin || b.fssai) && (
            <div>
              {b.gstin && <span>GSTIN: {b.gstin}</span>}
              {b.gstin && b.fssai && ' · '}
              {b.fssai && <span>FSSAI Lic. No: {b.fssai}</span>}
            </div>
          )}
          {b.addressLines.map((line) => <div key={line}>{line}</div>)}
          {(b.phone || b.email || b.website || b.instagram) && (
            <div className="bill-footer-contacts">
              {[b.phone, b.email, b.website, b.instagram].filter(Boolean).join('  ·  ')}
            </div>
          )}
          <div className="bill-thankyou">{footerMessage}</div>
          <div className="bill-disclaimer">This is a system-generated document.</div>
        </div>

        <div className="modal-actions no-print">
          <button type="button" className="btn-secondary" onClick={() => window.print()}>
            <Printer size={16} strokeWidth={2} /> Print
          </button>
          <button type="button" className="btn-secondary" onClick={() => render(downloadInvoicePdf).catch(console.error)}>
            <FileDown size={16} strokeWidth={2} /> Download PDF
          </button>
          <button type="button" className="btn-secondary" onClick={copyInvoice}>
            {copied ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={2} />}
            {copied ? 'Copied' : 'Copy Invoice'}
          </button>
          <button type="button" className="btn-secondary" onClick={shareWhatsApp}>
            <MessageCircle size={16} strokeWidth={2} /> WhatsApp
          </button>
          {typeof navigator !== 'undefined' && navigator.share && (
            <button type="button" className="btn-secondary" onClick={shareGeneric}>
              <Share2 size={16} strokeWidth={2} /> Share
            </button>
          )}
          <button type="button" className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
