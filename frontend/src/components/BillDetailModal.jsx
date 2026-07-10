import React from 'react';

export default function BillDetailModal({ title, bill, onClose }) {
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
            <div><strong>By:</strong> {bill.createdBy}</div>
          </div>
        </div>

        <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Quantity</th>
              <th>Unit Price</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {bill.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.product}</td>
                <td>{l.quantity}</td>
                <td>${l.unitPrice.toFixed(2)}</td>
                <td>${l.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <div className="bill-total">Total: ${bill.totalAmount.toFixed(2)}</div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
