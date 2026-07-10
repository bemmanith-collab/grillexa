import React, { useState } from 'react';

export default function WastageModal({ entry, onClose, onSubmit }) {
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const value = Number(quantity);
    if (quantity === '' || !Number.isFinite(value) || value <= 0) {
      setError('Please enter a valid quantity.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(value);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Record Wastage</h3>
        <p className="modal-help">
          How many units of "{entry.product}" were wasted/discarded today? Available stock: {entry.closing}.
        </p>
        <form onSubmit={handleSubmit}>
          <label>
            Quantity
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              autoFocus
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-danger" disabled={submitting}>
              {submitting ? 'Saving…' : 'Record Wastage'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
