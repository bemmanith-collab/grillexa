import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import LineItemsForm, { emptyLine } from '../components/LineItemsForm';
import BillDetailModal from '../components/BillDetailModal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { ReceiptIcon } from '../components/icons';
import { formatCurrency } from '../lib/format';
import { formatDate } from '../utils/date';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function DirectSale() {
  const { user } = useAuth();
  const isScoped = user.role === 'SALES';
  const myStores = isScoped ? user.stores : [];
  // A scoped user with just one store never needs to pick — same UX as Sales.
  const showStorePicker = !isScoped || myStores.length > 1;
  const [stores, setStores] = useState(isScoped ? myStores : []);
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [storeId, setStoreId] = useState(isScoped ? myStores[0]?.id || '' : '');
  const [date, setDate] = useState(todayStr());
  const [lines, setLines] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState(null);

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const requests = [client.get('/products'), client.get('/sales', { params: { direct: true } })];
      if (!isScoped) requests.unshift(client.get('/stores'));
      const results = await Promise.all(requests);
      const [productsRes, salesRes] = isScoped ? results : results.slice(1);
      if (!isScoped) {
        setStores(results[0].data.stores);
        setStoreId((current) => current || results[0].data.stores[0]?.id || '');
      }
      setProducts(productsRes.data.products);
      setSales(salesRes.data.sales);
      setLines((current) => (current.length ? current : [emptyLine(productsRes.data.products)]));
    } catch (err) {
      setError('Failed to load direct sale data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setLines([emptyLine(products)]);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerGstin('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const cleanLines = lines
      .filter((l) => l.productId && Number(l.quantity) > 0)
      .map((l) => ({
        productId: Number(l.productId),
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice) || 0,
        type: l.type === 'RETURN' ? 'RETURN' : 'SALE',
        reason: l.type === 'RETURN' ? l.reason : undefined,
      }));
    if (!storeId || cleanLines.length === 0) {
      setError('Pick a store and at least one product line with a quantity.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await client.post('/sales', {
        storeId: Number(storeId),
        date,
        lines: cleanLines,
        customerName,
        customerPhone,
        customerGstin,
      });
      resetForm();
      setFormOpen(false);
      setDetail(res.data.sale);
      loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record direct sale.');
    } finally {
      setSubmitting(false);
    }
  }

  async function openDetail(id) {
    const res = await client.get(`/sales/${id}`);
    setDetail(res.data.sale);
  }

  const noStoresAssigned = isScoped && myStores.length === 0;
  const singleStoreName = isScoped && myStores.length === 1 ? myStores[0].name : null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Direct Sale</h1>
          <p className="page-subtitle">
            Cash sale straight to a walk-in customer — billed and paid for immediately
            {singleStoreName && <> · {singleStoreName}</>}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setFormOpen((v) => !v)} disabled={noStoresAssigned}>
          {formOpen ? 'Cancel' : '+ New Direct Sale'}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}
      {noStoresAssigned && (
        <div className="form-error">Your account isn't assigned to a store yet. Ask an admin to assign one.</div>
      )}

      {formOpen && (
        <div className="card form-card">
          <form onSubmit={handleSubmit}>
            <div className="bill-form-header">
              {showStorePicker ? (
                <label>
                  Store
                  <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                    {!isScoped && <option value="">Select a store…</option>}
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                singleStoreName && (
                  <label>
                    Store
                    <input type="text" value={singleStoreName} disabled />
                  </label>
                )
              )}
              <label>
                Sale Date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label>
                Customer Name <span className="form-optional">(optional)</span>
                <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in customer" />
              </label>
              <label>
                Phone <span className="form-optional">(optional)</span>
                <input type="text" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
              </label>
              <label>
                GSTIN <span className="form-optional">(optional)</span>
                <input type="text" value={customerGstin} onChange={(e) => setCustomerGstin(e.target.value)} />
              </label>
            </div>
            <LineItemsForm products={products} lines={lines} setLines={setLines} />
            <div className="modal-actions">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Recording…' : 'Record Sale & Print Bill'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <Spinner label="Loading direct sales…" />
      ) : (
        <div className="card">
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Date</th>
                <th>Store</th>
                <th>Customer</th>
                {!isScoped && <th>Created By</th>}
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id}>
                  <td className="cell-mono">{s.number}</td>
                  <td className="cell-date">{formatDate(s.date)}</td>
                  <td>{s.store}</td>
                  <td>{s.customerName || <span className="cell-muted">—</span>}</td>
                  {!isScoped && <td>{s.createdBy}</td>}
                  <td>{formatCurrency(s.totalAmount)}</td>
                  <td className="actions-cell">
                    <button className="btn-secondary btn-sm" onClick={() => openDetail(s.id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr>
                  <td colSpan={isScoped ? 6 : 7}>
                    <EmptyState icon={ReceiptIcon} message="No direct sales recorded yet." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {detail && <BillDetailModal title="Sale Bill" bill={detail} onClose={() => setDetail(null)} hideCreatedBy={isScoped} />}
    </div>
  );
}
