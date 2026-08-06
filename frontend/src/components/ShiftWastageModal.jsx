import React, { useEffect, useRef, useState } from 'react';
import client from '../api/client';
import Spinner from '../components/Spinner';
import { todayStr } from '../utils/date';

// End-of-shift wastage. One screen, every product, no store picker — by the
// time this is counted the unsold stock is already back at HQ (settlement
// books it as a CONSIGNMENT_UNSOLD return, and unsold is not wasted: it goes
// out again to another store). What spoiled is only knowable here, at the end
// of the run, which is why this is the one wastage count with no store on it.
//
// Distinct from components/WastageModal.jsx, which records wastage against one
// store's daily ledger from Today's Stock. That one decrements stock; this one
// does not, because HQ stock is not tracked.
const REASON_LABELS = {
  SPOILED: 'Spoiled',
  DAMAGED: 'Damaged',
  EXPIRED: 'Expired',
  OTHER: 'Other',
};

export default function ShiftWastageModal({ onClose, onSaved }) {
  const [date, setDate] = useState(todayStr());
  const [products, setProducts] = useState(null);
  const [reasons, setReasons] = useState([]);
  const [rows, setRows] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const firstInput = useRef(null);

  useEffect(() => {
    let cancelled = false;
    client
      .get('/wastage/products')
      .then((res) => {
        if (cancelled) return;
        setProducts(res.data.products);
        setReasons(res.data.reasons);
      })
      .catch(() => !cancelled && setError('Could not load the product list.'));
    return () => {
      cancelled = true;
    };
  }, []);

  // Autofocus the first quantity once the list has actually rendered — the ref
  // is null while the spinner is up, so focusing on mount would do nothing.
  useEffect(() => {
    if (products?.length) firstInput.current?.focus();
  }, [products]);

  function updateRow(productId, patch) {
    setRows((prev) => ({ ...prev, [productId]: { ...prev[productId], ...patch } }));
  }

  const counted = Object.entries(rows).filter(([, r]) => Number(r?.quantity) > 0);
  const totalUnits = counted.reduce((sum, [, r]) => sum + Number(r.quantity), 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Whole units, and nothing negative. No upper bound: there is no HQ stock
    // figure to check against, and refusing a true count is worse than
    // accepting a surprising one.
    const bad = counted.find(([, r]) => !Number.isInteger(Number(r.quantity)));
    if (bad) {
      setError('Quantities are whole units — there is no half a fruit bowl.');
      return;
    }
    if (counted.length === 0) {
      setError('Enter a quantity for at least one product.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await client.post('/wastage', {
        date,
        lines: counted.map(([productId, r]) => ({
          productId: Number(productId),
          quantity: Number(r.quantity),
          reason: r.reason || 'SPOILED',
        })),
      });
      onSaved(`Recorded ${res.data.units} ${res.data.units === 1 ? 'unit' : 'units'} of wastage.`);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save the wastage count.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <h3>Record End-of-Shift Wastage</h3>
        <p className="modal-help">
          What spoiled across the whole run today. Leave a product blank if none of it was wasted.
          Unsold stock coming back is not wastage — settle the consignment instead.
        </p>

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          {products === null ? (
            <Spinner label="Loading products…" />
          ) : (
            <div className="table-scroll shift-wastage">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, i) => (
                    <tr key={p.id}>
                      <td className="cell-strong">{p.name}</td>
                      <td>
                        {/* inputMode numeric gets the number pad — this is
                            filled in standing at the back of a van. */}
                        <input
                          ref={i === 0 ? firstInput : undefined}
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          className="line-input"
                          placeholder="—"
                          value={rows[p.id]?.quantity || ''}
                          onChange={(e) => updateRow(p.id, { quantity: e.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          value={rows[p.id]?.reason || 'SPOILED'}
                          onChange={(e) => updateRow(p.id, { reason: e.target.value })}
                          aria-label={`Reason for ${p.name}`}
                        >
                          {reasons.map((r) => (
                            <option key={r} value={r}>
                              {REASON_LABELS[r] || r}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="line-items-total" style={{ marginTop: 12 }}>
            {totalUnits > 0
              ? `${totalUnits} ${totalUnits === 1 ? 'unit' : 'units'} across ${counted.length} ${
                  counted.length === 1 ? 'product' : 'products'
                }`
              : 'Nothing counted yet'}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-danger" disabled={submitting || counted.length === 0}>
              {submitting ? 'Saving…' : 'Record Wastage'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
