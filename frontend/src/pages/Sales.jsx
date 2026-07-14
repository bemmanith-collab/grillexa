import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import LineItemsForm, { emptyLine } from '../components/LineItemsForm';
import BillDetailModal from '../components/BillDetailModal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { ReceiptIcon } from '../components/icons';
import { formatCurrency } from '../lib/format';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function Sales() {
  const { user } = useAuth();
  const isScoped = user.role === 'SALES';
  const myStores = isScoped ? user.stores : [];
  // A scoped user with just one store never needs to pick — same UX as before.
  const showStorePicker = !isScoped || myStores.length > 1;
  const [stores, setStores] = useState(isScoped ? myStores : []);
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [storeId, setStoreId] = useState(isScoped ? myStores[0]?.id || '' : '');
  const [date, setDate] = useState(todayStr());
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [lines, setLines] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState(null);
  const [dateFilter, setDateFilter] = useState('');
  const [salesLoading, setSalesLoading] = useState(true);

  async function loadProductsAndStores() {
    setError('');
    try {
      const requests = [client.get('/products')];
      if (!isScoped) requests.unshift(client.get('/stores'));
      const results = await Promise.all(requests);
      const productsRes = isScoped ? results[0] : results[1];
      if (!isScoped) {
        setStores(results[0].data.stores);
        setStoreId((current) => current || results[0].data.stores[0]?.id || '');
      }
      setProducts(productsRes.data.products);
      setLines((current) => (current.length ? current : [emptyLine(productsRes.data.products)]));
    } catch (err) {
      setError('Failed to load sales data.');
    }
  }

  async function loadSales() {
    setSalesLoading(true);
    setError('');
    try {
      const params = dateFilter ? { date: dateFilter } : {};
      const res = await client.get('/sales', { params });
      setSales(res.data.sales);
    } catch (err) {
      setError('Failed to load sales data.');
    } finally {
      setSalesLoading(false);
    }
  }

  useEffect(() => {
    loadProductsAndStores();
  }, []);

  useEffect(() => {
    loadSales();
  }, [dateFilter]);

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
      await client.post('/sales', {
        storeId: Number(storeId),
        date,
        lines: cleanLines,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        customerGstin: customerGstin.trim() || undefined,
      });
      setLines([emptyLine(products)]);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerGstin('');
      setFormOpen(false);
      // Jump the date filter to the bill's date so the new bill is visible
      // immediately, even if you were viewing a different day.
      if (dateFilter === date) {
        loadSales();
      } else {
        setDateFilter(date);
      }
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

  const noStoresAssigned = isScoped && myStores.length === 0;
  const singleStoreName = isScoped && myStores.length === 1 ? myStores[0].name : null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Sales</h1>
          <p className="page-subtitle">
            Retail bills issued to customers — add a Return line to credit stock back in the same bill
            {singleStoreName && <> · {singleStoreName}</>}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setFormOpen((v) => !v)} disabled={noStoresAssigned}>
          {formOpen ? 'Cancel' : '+ New Sale'}
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
                Date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
            </div>
            <div className="bill-form-header">
              <label>
                Customer name <span className="form-optional">(optional)</span>
                <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in customer" />
              </label>
              <label>
                Customer phone <span className="form-optional">(optional)</span>
                <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="For the WhatsApp invoice" />
              </label>
              <label>
                Customer GSTIN <span className="form-optional">(optional)</span>
                <input type="text" value={customerGstin} onChange={(e) => setCustomerGstin(e.target.value)} placeholder="If they need it for ITC" />
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

      <div className="page-header">
        <h2 className="section-title" style={{ margin: 0 }}>Bill History</h2>
        <div className="inline-form">
          <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          {dateFilter && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setDateFilter('')}>
              All dates
            </button>
          )}
        </div>
      </div>

      {salesLoading ? (
        <Spinner label="Loading sales…" />
      ) : (
        <div className="card">
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Date</th>
                <th>Store</th>
                {!isScoped && <th>Created By</th>}
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id}>
                  <td className="cell-mono">{s.number}</td>
                  <td>{s.date}</td>
                  <td>{s.store}</td>
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
                  <td colSpan={isScoped ? 5 : 6}>
                    <EmptyState
                      icon={ReceiptIcon}
                      message={dateFilter ? 'No sales on this date.' : 'No sales recorded yet.'}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {detail && (
        <BillDetailModal title="Sale Bill" bill={detail} onClose={() => setDetail(null)} hideCreatedBy={isScoped} />
      )}
    </div>
  );
}
