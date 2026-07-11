import React, { useState } from 'react';

// Lets an admin pick one or more stores for a SALES account. Stores already
// owned by a different sales user are left out entirely so two sales people
// can never be assigned the same store.
export default function StoreAssignModal({ stores, currentUserId, initialSelectedIds, onClose, onConfirm }) {
  const [selected, setSelected] = useState(new Set(initialSelectedIds));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const availableStores = stores.filter((s) => s.salesUserId == null || s.salesUserId === currentUserId);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleConfirm() {
    setError('');
    setSubmitting(true);
    try {
      await onConfirm(Array.from(selected));
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update stores.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Assign Stores</h3>
        <p className="modal-help">
          Pick one or more stores for this sales account. Stores already assigned to another sales person aren't shown here.
        </p>
        <div className="store-checkbox-list">
          {availableStores.length === 0 && <p className="form-hint">No stores available to assign.</p>}
          {availableStores.map((s) => (
            <label key={s.id} className="store-checkbox-row">
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
              {s.name}
            </label>
          ))}
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleConfirm}
            disabled={submitting || selected.size === 0}
          >
            {submitting ? 'Saving…' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
