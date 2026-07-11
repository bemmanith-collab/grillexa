import React, { useState } from 'react';

// Lets an admin pick one or more stores for a SALES account. Stores can be
// shared across sales people (e.g. someone covering for a colleague who's
// out), so every store is selectable — the list just shows who else already
// has a given store for context.
export default function StoreAssignModal({ stores, currentUserId, initialSelectedIds, onClose, onConfirm }) {
  const [selected, setSelected] = useState(new Set(initialSelectedIds));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
        <p className="modal-help">Pick one or more stores for this sales account. A store can be shared with other sales people.</p>
        <div className="store-checkbox-list">
          {stores.length === 0 && <p className="form-hint">No stores exist yet.</p>}
          {stores.map((s) => {
            const others = (s.salesUsers || []).filter((u) => u.id !== currentUserId);
            return (
              <label key={s.id} className="store-checkbox-row">
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                <span>
                  {s.name}
                  {others.length > 0 && (
                    <span className="form-hint store-checkbox-hint"> · also: {others.map((u) => u.name).join(', ')}</span>
                  )}
                </span>
              </label>
            );
          })}
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
