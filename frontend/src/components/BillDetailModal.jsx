import React, { useState } from 'react';
import { Printer, Share2, MessageCircle, Check, Copy, FileDown } from 'lucide-react';
import { formatCurrency } from '../lib/format';
import { RETURN_REASONS } from '../lib/returnReasons';
import { BUSINESS_INFO } from '../lib/businessInfo';
import { buildInvoiceShareText, downloadInvoicePdf } from '../lib/invoice';
import logoIcon from '../assets/grillexa-icon.png';

const REASON_LABEL = Object.fromEntries(RETURN_REASONS.map((r) => [r.value, r.label]));

export default function BillDetailModal({ title, bill, onClose, hideCreatedBy }) {
  const hasReturns = bill.lines.some((l) => l.type === 'RETURN');
  const [copied, setCopied] = useState(false);
  const b = BUSINESS_INFO;

  async function copyInvoice() {
    await navigator.clipboard.writeText(buildInvoiceShareText(title, bill, hideCreatedBy));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function shareWhatsApp() {
    const text = buildInvoiceShareText(title, bill, hideCreatedBy);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  async function shareGeneric() {
    try {
      await navigator.share({ title: `${title} ${bill.number}`, text: buildInvoiceShareText(title, bill, hideCreatedBy) });
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

        <div className="bill-official-tag">OFFICIAL INVOICE</div>

        <div className="bill-header">
          <div>
            <h3>{title}</h3>
            <p className="modal-help">{bill.number}</p>
          </div>
          <div className="bill-meta">
            <div><strong>Date:</strong> {bill.date}</div>
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
          <div className="bill-thankyou">🙏 Thank you for shopping with us!</div>
          <div className="bill-disclaimer">This is a system-generated invoice.</div>
        </div>

        <div className="modal-actions no-print">
          <button type="button" className="btn-secondary" onClick={() => window.print()}>
            <Printer size={16} strokeWidth={2} /> Print
          </button>
          <button type="button" className="btn-secondary" onClick={() => downloadInvoicePdf(title, bill, hideCreatedBy).catch(console.error)}>
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
