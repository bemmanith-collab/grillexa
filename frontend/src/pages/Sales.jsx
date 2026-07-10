import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import LineItemsForm, { emptyLine } from '../components/LineItemsForm';
import BillDetailModal from '../components/BillDetailModal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { ReceiptIcon } from '../components/icons';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function Sales() {
  const { user } = useAuth();
  const isScoped = user.role === 'SALES';
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [storeId, setStoreId] = useState(isScoped ? user.storeId : '');
  const [date, setDate] = useState(todayStr());
  const [lines, setLines] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState(null);

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const requests = [client.get('/products'), client.get('/sales')];
      if (!isScoped) requests.unshift(client.get('/stores'));
      const results = await Promise.all(requests);
      const productsRes = isScoped ? results[0] : results[1];
      const salesRes = isScoped ? results[1] : results[2];
      if (!isScoped) {
        setStores(results[0].data.stores);
        setStoreId((current) => current || results[0].data.stores[0]?.id || '');
      }
      setProducts(productsRes.data.products);
      setSales(salesRes.data.sales);
      setLines((current) => (current.length ? current : [emptyLine(productsRes.data.products)]));
    } catch (err) {
      setError('Failed to load sales data.');
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
    if ((!isScoped && !storeId) || cleanLines.length === 0) {
      setError('Pick a store and at least one product line with a quantity.');
      return;
    }
    setSubmitting(true);
    try {
      await client.post('/sales', {
        ...(isScoped ? {} : { storeId: Number(storeId) }),
        date,
        lines: cleanLines,
      });
      setLines([emptyLine(products)]);
      setFormOpen(false);
      loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create sale.');
    } finally {
      setSubmitting(false);
    }
  }

  async function openDetail(id) {
    const res = await client.get(`/sales/${id}`);
    setDetail(res.data.sale);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Sales</h1>
          <p className="page-subtitle">Retail bills issued to customers</p>
        </div>
        <button className="btn-primary" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? 'Cancel' : '+ New Sale'}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {formOpen && (
        <div className="card form-card">
          <form onSubmit={handleSubmit}>
            <div className="bill-form-header">
              {!isScoped && (
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
              )}
              <label>
                Date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
            </div>
            <LineItemsForm products={products} lines={lines} setLines={setLines} />
            <div className="modal-actions">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create Sale Bill'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <Spinner label="Loading sales…" />
      ) : (
        <div className="card">
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Date</th>
                {!isScoped && <th>Store</th>}
                <th>Created By</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id}>
                  <td className="cell-mono">{s.number}</td>
                  <td>{s.date}</td>
                  {!isScoped && <td>{s.store}</td>}
                  <td>{s.createdBy}</td>
                  <td>${s.totalAmount.toFixed(2)}</td>
                  <td className="actions-cell">
                    <button className="btn-secondary btn-sm" onClick={() => openDetail(s.id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr>
                  <td colSpan={isScoped ? 5 : 6}>
                    <EmptyState icon={ReceiptIcon} message="No sales recorded yet." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {detail && <BillDetailModal title="Sale Bill" bill={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
