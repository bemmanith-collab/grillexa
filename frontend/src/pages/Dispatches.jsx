import React, { useEffect, useState } from 'react';
import client from '../api/client';
import LineItemsForm, { emptyLine } from '../components/LineItemsForm';
import BillDetailModal from '../components/BillDetailModal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { TruckIcon } from '../components/icons';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function Dispatches() {
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [storeId, setStoreId] = useState('');
  const [date, setDate] = useState(todayStr());
  const [lines, setLines] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState(null);

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [storesRes, productsRes, invoicesRes] = await Promise.all([
        client.get('/stores'),
        client.get('/products'),
        client.get('/dispatches'),
      ]);
      setStores(storesRes.data.stores);
      setProducts(productsRes.data.products);
      setInvoices(invoicesRes.data.invoices);
      setStoreId((current) => current || storesRes.data.stores[0]?.id || '');
      setLines((current) => (current.length ? current : [emptyLine(productsRes.data.products)]));
    } catch (err) {
      setError('Failed to load dispatch data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const cleanLines = lines
      .filter((l) => l.productId && Number(l.quantity) > 0)
      .map((l) => ({ productId: Number(l.productId), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) || 0 }));
    if (!storeId || cleanLines.length === 0) {
      setError('Pick a store and at least one product line with a quantity.');
      return;
    }
    setSubmitting(true);
    try {
      await client.post('/dispatches', { storeId: Number(storeId), date, lines: cleanLines });
      setLines([emptyLine(products)]);
      setFormOpen(false);
      loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create dispatch invoice.');
    } finally {
      setSubmitting(false);
    }
  }

  async function openDetail(id) {
    const res = await client.get(`/dispatches/${id}`);
    setDetail(res.data.invoice);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Dispatches</h1>
          <p className="page-subtitle">Stock sent from HQ to stores</p>
        </div>
        <button className="btn-primary" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? 'Cancel' : '+ New Dispatch'}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {formOpen && (
        <div className="card form-card">
          <form onSubmit={handleSubmit}>
            <div className="bill-form-header">
              <label>
                Store
                <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
            </div>
            <LineItemsForm products={products} lines={lines} setLines={setLines} />
            <div className="modal-actions">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create Dispatch Invoice'}
              </button>
            </div>
          </form>
        </div>
      )}

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
                  <td>${inv.totalAmount.toFixed(2)}</td>
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
                    <EmptyState icon={TruckIcon} message="No dispatches yet." />
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
