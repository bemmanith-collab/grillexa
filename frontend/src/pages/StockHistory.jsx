import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { HistoryIcon } from '../components/icons';
import { formatDate, todayStr, daysAgoStr } from '../utils/date';

export default function StockHistory() {
  const { user } = useAuth();
  const isScoped = user.role === 'SALES';
  const myStores = isScoped ? user.stores : [];
  const showStorePicker = !isScoped || myStores.length > 1;
  const [stores, setStores] = useState(isScoped ? myStores : []);
  const [products, setProducts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [storeId, setStoreId] = useState('');
  const [productId, setProductId] = useState('');
  const [from, setFrom] = useState(daysAgoStr(13));
  const [to, setTo] = useState(todayStr());

  useEffect(() => {
    if (!isScoped) {
      client.get('/stores').then((res) => setStores(res.data.stores));
    }
    client.get('/products').then((res) => setProducts(res.data.products));
  }, [isScoped]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const params = { from, to };
      if (storeId) params.storeId = storeId;
      if (productId) params.productId = productId;
      const res = await client.get('/stock/history', { params });
      setEntries(res.data.entries);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load stock history.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, productId, from, to]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Stock History</h1>
          <p className="page-subtitle">Daily received / sold / wastage movements per store</p>
        </div>
      </div>

      <div className="card form-card">
        <div className="inline-form">
          {showStorePicker && (
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">All stores</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label className="inline-date">
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="inline-date">
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <Spinner label="Loading stock history…" />
      ) : (
        <div className="card">
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                {showStorePicker && <th>Store</th>}
                <th>Product</th>
                <th>Received</th>
                <th>Sold</th>
                <th>Wastage</th>
                <th>On Consignment</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="cell-date">{formatDate(e.date)}</td>
                  {showStorePicker && <td>{e.store}</td>}
                  <td className="cell-strong">{e.product}</td>
                  <td>{e.received}</td>
                  <td>{e.sold}</td>
                  <td>{e.wastage}</td>
                  <td className="cell-strong">{e.consignmentQty}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={showStorePicker ? 6 : 5}>
                    <EmptyState icon={HistoryIcon} message="No stock history for this filter." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
