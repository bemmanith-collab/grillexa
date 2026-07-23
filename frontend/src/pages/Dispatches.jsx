import React, { useEffect, useState } from 'react';
import client from '../api/client';
import BillDetailModal from '../components/BillDetailModal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { TruckIcon } from '../components/icons';

export default function Dispatches() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/dispatches');
      setInvoices(res.data.invoices);
    } catch (err) {
      setError('Failed to load dispatch history.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function openDetail(id) {
    const res = await client.get(`/dispatches/${id}`);
    setDetail(res.data.invoice);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Dispatches</h1>
          <p className="page-subtitle">
            Historical HQ→store transfers from before the consignment model — see Deliver to Store for new deliveries
          </p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <Spinner label="Loading dispatches…" />
      ) : (
        <div className="card">
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Store</th>
                <th>Created By</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="cell-mono">{inv.number}</td>
                  <td>{inv.date}</td>
                  <td>{inv.store}</td>
                  <td>{inv.createdBy}</td>
                  <td>₹{inv.totalAmount.toFixed(2)}</td>
                  <td className="actions-cell">
                    <button className="btn-secondary btn-sm" onClick={() => openDetail(inv.id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState icon={TruckIcon} message="No dispatches in history." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {detail && <BillDetailModal title="Dispatch Invoice" bill={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
