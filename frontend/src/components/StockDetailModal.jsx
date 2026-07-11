import React from 'react';
import { STATUS_LABEL, STATUS_BADGE_CLASS } from '../lib/stockStatus';

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
        <span className={`badge ${STATUS_BADGE_CLASS[entry.status]}`}>{STATUS_LABEL[entry.status]}</span>

        <div className="stock-detail-grid">
          <Row label="Opening" value={entry.opening} />
          <Row label="Received" value={entry.received} />
          <Row label="Sold" value={entry.sold} />
          <Row label="Wastage" value={entry.wastage} />
          <Row label="Closing" value={entry.closing} />
          <Row label="Reorder threshold" value={entry.threshold} />
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
