import React, { useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import { formatCurrency } from '../lib/format';
import BillDetailModal from '../components/BillDetailModal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { ReceiptIcon } from '../components/icons';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function asSaleBill(settlement, consignment) {
  return {
    number: settlement.saleNumber || settlement.settlementNo,
    date: settlement.settledAt,
    store: consignment.store,
    totalAmount: settlement.lines.reduce((sum, l) => {
      const item = consignment.items.find((i) => i.id === l.consignmentItemId);
      return sum + l.soldQty * (item?.pricePerUnit || 0);
    }, 0),
    lines: settlement.lines
      .filter((l) => l.soldQty > 0)
      .map((l) => {
        const item = consignment.items.find((i) => i.id === l.consignmentItemId);
        return {
          id: l.id,
          product: l.product,
          quantity: l.soldQty,
          unitPrice: item?.pricePerUnit || 0,
          amount: l.soldQty * (item?.pricePerUnit || 0),
          type: 'SALE',
        };
      }),
  };
}

function SettleForm({ consignment, onClose, onSettled }) {
  const [date, setDate] = useState(todayStr());
  const [rows, setRows] = useState(() =>
    consignment.items.map((i) => ({ consignmentItemId: i.id, soldQty: '', returnedQty: '' }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function updateRow(id, patch) {
    setRows((prev) => prev.map((r) => (r.consignmentItemId === id ? { ...r, ...patch } : r)));
  }

  const paymentDue = useMemo(() => {
    return rows.reduce((sum, r) => {
      const item = consignment.items.find((i) => i.id === r.consignmentItemId);
      return sum + (Number(r.soldQty) || 0) * (item?.pricePerUnit || 0);
    }, 0);
  }, [rows, consignment.items]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const lines = rows
      .map((r) => ({
        consignmentItemId: r.consignmentItemId,
        soldQty: Number(r.soldQty) || 0,
        returnedQty: Number(r.returnedQty) || 0,
      }))
      .filter((l) => l.soldQty > 0 || l.returnedQty > 0);
    if (lines.length === 0) {
      setError('Enter a sold or returned quantity for at least one product.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await client.post(`/consignments/${consignment.id}/settle`, { date, lines });
      onSettled(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to settle consignment.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <h3>Settle {consignment.consignmentNo}</h3>
        <p className="modal-help">
          {consignment.store} · delivered {consignment.deliveredAt} · enter what actually sold and what's coming back unsold
        </p>

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <label>
            Settlement Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Remaining</th>
                  <th>Sold Qty</th>
                  <th>Returned Qty</th>
                </tr>
              </thead>
              <tbody>
                {consignment.items.map((item) => {
                  const row = rows.find((r) => r.consignmentItemId === item.id);
                  return (
                    <tr key={item.id}>
                      <td className="cell-strong">{item.product}</td>
                      <td>{item.remainingQty}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max={item.remainingQty}
                          className="line-input"
                          value={row.soldQty}
                          onChange={(e) => updateRow(item.id, { soldQty: e.target.value })}
                          disabled={item.remainingQty === 0}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max={item.remainingQty}
                          className="line-input"
                          value={row.returnedQty}
                          onChange={(e) => updateRow(item.id, { returnedQty: e.target.value })}
                          disabled={item.remainingQty === 0}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="line-items-total" style={{ marginTop: 12 }}>
            Payment Due: {formatCurrency(paymentDue)}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Settling…' : 'Settle Consignment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SettleConsignment() {
  const [consignments, setConsignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [settling, setSettling] = useState(null);
  const [result, setResult] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/consignments', { params: { status: 'DELIVERED,PARTIAL_SETTLED' } });
      setConsignments(res.data.consignments);
    } catch (err) {
      setError('Failed to load pending consignments.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleSettled(data) {
    setSettling(null);
    if (data.settlement.saleId) {
      setResult({ settlement: data.settlement, consignment: data.consignment });
    }
    load();
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Settle Consignment</h1>
          <p className="page-subtitle">Report what sold and what's coming back — this is where revenue and GST get recognized</p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <Spinner label="Loading pending consignments…" />
      ) : (
        <div className="card">
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Consignment #</th>
                <th>Delivered</th>
                <th>Store</th>
                <th>Status</th>
                <th>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {consignments.map((c) => (
                <tr key={c.id}>
                  <td className="cell-mono">{c.consignmentNo}</td>
                  <td>{c.deliveredAt}</td>
                  <td>{c.store}</td>
                  <td>
                    <span className="badge">{c.status.replace('_', ' ')}</span>
                  </td>
                  <td>₹{c.totalDeliveredValue.toFixed(2)}</td>
                  <td className="actions-cell">
                    <button className="btn-primary btn-sm" onClick={() => setSettling(c)}>
                      Settle
                    </button>
                  </td>
                </tr>
              ))}
              {consignments.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState icon={ReceiptIcon} message="Nothing pending settlement — every delivery is accounted for." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {settling && <SettleForm consignment={settling} onClose={() => setSettling(null)} onSettled={handleSettled} />}

      {result && (
        <BillDetailModal
          title="Settlement Sale"
          bill={asSaleBill(result.settlement, result.consignment)}
          onClose={() => setResult(null)}
        />
      )}
    </div>
  );
}
