import React, { useState } from 'react';
import { Printer, Share2, MessageCircle, Check } from 'lucide-react';
import { formatCurrency } from '../lib/format';
import { RETURN_REASONS } from '../lib/returnReasons';
import logoIcon from '../assets/grillexa-icon.png';

const REASON_LABEL = Object.fromEntries(RETURN_REASONS.map((r) => [r.value, r.label]));

function buildBillText(title, bill, hideCreatedBy) {
  const lines = bill.lines.map((l) => {
    const isReturn = l.type === 'RETURN';
    return `${isReturn ? 'RETURN — ' : ''}${l.product} x${l.quantity} @ ₹${l.unitPrice.toFixed(2)} = ${formatCurrency(isReturn ? -l.amount : l.amount)}`;
  });
  return [
    `Grillexa – ${title}`,
    `Bill #: ${bill.number}`,
    `Date: ${bill.date}`,
    `Store: ${bill.store}`,
    ...(!hideCreatedBy && bill.createdBy ? [`By: ${bill.createdBy}`] : []),
    '',
    ...lines,
    '',
    `Total: ${formatCurrency(bill.totalAmount)}`,
  ].join('\n');
}

export default function BillDetailModal({ title, bill, onClose, hideCreatedBy }) {
  const hasReturns = bill.lines.some((l) => l.type === 'RETURN');
  const [copied, setCopied] = useState(false);

  function shareWhatsApp() {
    const text = buildBillText(title, bill, hideCreatedBy);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  async function shareGeneric() {
    const text = buildBillText(title, bill, hideCreatedBy);
    if (navigator.share) {
      try {
        await navigator.share({ title: `${title} ${bill.number}`, text });
      } catch (err) {
        // user dismissed the share sheet — nothing to do
      }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal bill-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bill-brand">
          <img src={logoIcon} alt="" className="bill-brand-icon" />
          <span>Grillexa</span>
        </div>

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

        <div className="modal-actions no-print">
          <button type="button" className="btn-secondary" onClick={() => window.print()}>
            <Printer size={16} strokeWidth={2} /> Print / PDF
          </button>
          <button type="button" className="btn-secondary" onClick={shareWhatsApp}>
            <MessageCircle size={16} strokeWidth={2} /> WhatsApp
          </button>
          <button type="button" className="btn-secondary" onClick={shareGeneric}>
            {copied ? <Check size={16} strokeWidth={2} /> : <Share2 size={16} strokeWidth={2} />}
            {copied ? 'Copied' : 'Share'}
          </button>
          <button type="button" className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
