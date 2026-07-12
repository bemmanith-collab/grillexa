import React from 'react';
import { formatCurrency } from '../lib/format';
import { RETURN_REASONS } from '../lib/returnReasons';

const REASON_LABEL = Object.fromEntries(RETURN_REASONS.map((r) => [r.value, r.label]));

export default function BillDetailModal({ title, bill, onClose, hideCreatedBy }) {
  const hasReturns = bill.lines.some((l) => l.type === 'RETURN');
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal bill-modal" onClick={(e) => e.stopPropagation()}>
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

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
