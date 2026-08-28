import React, { useState } from 'react';
import { Store, Search } from 'lucide-react';

// Lets an admin pick one or more stores for a SALES account. Stores can be
// shared across sales people (e.g. someone covering for a colleague who's
// out), so every store is selectable — the list just shows who else already
// has a given store for context.
//
// "All stores" is a standing assignment, not a tick-everything shortcut. With
// eighty-odd shops the list is a long scroll, and the account that is meant to
// cover everything should not need revisiting each time a shop opens — checking
// every box today would silently miss the one added next month. Choosing it
// stores a flag; the store list is resolved per request on the server.
export default function StoreAssignModal({
  stores,
  currentUserId,
  initialSelectedIds,
  initialAllStores = false,
  onClose,
  onConfirm,
}) {
  const [selected, setSelected] = useState(new Set(initialSelectedIds));
  const [allStores, setAllStores] = useState(initialAllStores);
  const [query, setQuery] = useState('');
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
      await onConfirm({ storeIds: Array.from(selected), allStores });
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update stores.');
    } finally {
      setSubmitting(false);
    }
  }

  // Eighty shops is a long scroll to find one name.
  const visible = query.trim()
    ? stores.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()))
    : stores;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-assign" onClick={(e) => e.stopPropagation()}>
        <h3>Assign Stores</h3>
        <p className="modal-help">
          Pick one or more stores for this sales account. A store can be shared with other sales people.
        </p>

        {/* Above the list, not beside OK — it decides whether the list below
            matters at all. */}
        <label className={`store-all-row${allStores ? ' on' : ''}`}>
          <input
            type="checkbox"
            checked={allStores}
            onChange={(e) => setAllStores(e.target.checked)}
          />
          <Store size={17} strokeWidth={1.9} aria-hidden="true" />
          <span>
            <strong>All stores</strong>
            <span className="form-hint">
              Every shop, including ones added later. No need to come back here when a new shop opens.
            </span>
          </span>
        </label>

        {allStores ? (
          <p className="form-hint store-all-note">
            This account covers all {stores.length} stores, and any opened from now on.
            Untick to choose them one by one.
          </p>
        ) : (
          <>
            {stores.length > 6 && (
              <label className="store-search">
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search stores…"
                  aria-label="Search stores"
                />
              </label>
            )}
            <div className="store-checkbox-list">
              {stores.length === 0 && <p className="form-hint">No stores exist yet.</p>}
              {stores.length > 0 && visible.length === 0 && (
                <p className="form-hint">No store matches “{query}”.</p>
              )}
              {visible.map((s) => {
                const others = (s.salesUsers || []).filter((u) => u.id !== currentUserId);
                return (
                  <label key={s.id} className="store-checkbox-row">
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                    <span>
                      {s.name}
                      {others.length > 0 && (
                        <span className="form-hint store-checkbox-hint">
                          {' '}· also: {others.map((u) => u.name).join(', ')}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="form-hint store-count">
              {selected.size} of {stores.length} selected
            </p>
          </>
        )}

        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleConfirm}
            disabled={submitting || (!allStores && selected.size === 0)}
          >
            {submitting ? 'Saving…' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
