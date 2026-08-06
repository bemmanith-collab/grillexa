import React, { useState } from 'react';

export default function WastageModal({ entry, onClose, onSubmit }) {
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const value = Number(quantity);
    // Integer, not just positive: DailyStockEntry.wastage is an Int column, so
    // a half unit reached Prisma and came back as a 500 with nothing useful in
    // it. Products are counted in whole units — there is no half a fruit bowl.
    if (quantity === '' || !Number.isInteger(value) || value <= 0) {
      setError('Enter a whole number of units, greater than zero.');
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
          How many units of "{entry.product}" were wasted/discarded today?
        </p>
        <form onSubmit={handleSubmit}>
          <label>
            Quantity
            {/* inputMode numeric gets the phone's number pad instead of the
                full keyboard — this modal is used standing in a shop. No max:
                the ledger's running balance is deliberately meaningless (stock
                is not booked in before it is billed, see the README), so there
                is no honest "units on hand" to cap wastage against. */}
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
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
