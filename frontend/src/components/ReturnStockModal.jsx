import React, { useState } from 'react';

const REASONS = [
  { value: 'CUSTOMER_RETURN', label: 'Customer Return' },
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'EXCHANGE', label: 'Exchange' },
  { value: 'OTHER', label: 'Other' },
];

export default function ReturnStockModal({ products, onClose, onSubmit }) {
  const [productId, setProductId] = useState(products[0]?.id || '');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState(REASONS[0].value);
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const qty = Number(quantity);
    if (!productId) {
      setError('Pick a product.');
      return;
    }
    if (quantity === '' || !Number.isFinite(qty) || qty <= 0) {
      setError('Enter a valid quantity.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ productId: Number(productId), quantity: qty, reason, reference: reference.trim() || undefined });
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to process return.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Return Stock</h3>
        <p className="modal-help">Add returned or exchanged units back to today's stock.</p>
        <form onSubmit={handleSubmit}>
          <label>
            Product
            <select value={productId} onChange={(e) => setProductId(e.target.value)} autoFocus>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantity
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <label>
            Reason
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reference (optional)
            <input
              type="text"
              placeholder="Original invoice / sale number"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Processing…' : 'Process Return'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
