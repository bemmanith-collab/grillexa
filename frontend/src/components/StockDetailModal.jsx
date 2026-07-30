import React from 'react';

function Row({ label, value }) {
  return (
    <div className="stock-detail-row">
      <span className="form-hint">{label}</span>
      <span className="cell-strong">{value}</span>
    </div>
  );
}

export default function StockDetailModal({ entry, onClose, onRecordWastage }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{entry.product}</h3>
        <p className="modal-help">
          {entry.store} · {entry.date}
        </p>
        <div className="stock-detail-grid">
          <Row label="Received" value={entry.received} />
          <Row label="Sold" value={entry.sold} />
          <Row label="Wastage" value={entry.wastage} />
          <Row label="On Consignment" value={entry.consignmentQty} />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn-primary" onClick={onRecordWastage}>
            Record Wastage
          </button>
        </div>
      </div>
    </div>
  );
}
