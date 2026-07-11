import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import WastageModal from '../components/WastageModal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { BoxIcon, AlertIcon, ReceiptIcon, TrashIcon } from '../components/icons';

export default function Inventory() {
  const { user } = useAuth();
  const isScoped = user.role === 'SALES';
  const myStores = isScoped ? user.stores : [];
  const showStorePicker = !isScoped || myStores.length > 1;
  const [stores, setStores] = useState(isScoped ? myStores : []);
  const [storeId, setStoreId] = useState(isScoped ? myStores[0]?.id || '' : '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [wastageTarget, setWastageTarget] = useState(null);

  useEffect(() => {
    if (isScoped) return;
    client.get('/stores').then((res) => {
      setStores(res.data.stores);
      setStoreId((current) => current || res.data.stores[0]?.id || '');
    });
  }, [isScoped]);

  async function load(sid) {
    if (!sid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/stock/today', { params: { storeId: sid } });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load stock.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(storeId);
  }, [storeId]);

  async function handleWastageSubmit(entry, quantity) {
    const res = await client.post(`/stock/${entry.storeId}/${entry.productId}/wastage`, { quantity });
    setData((prev) => ({
      ...prev,
      entries: prev.entries.map((e) => (e.id === res.data.entry.id ? res.data.entry : e)),
    }));
  }

  const lowCount = data?.entries.filter((e) => e.status === 'LOW').length || 0;
  const totalClosing = data?.entries.reduce((sum, e) => sum + e.closing, 0) || 0;
  const totalSold = data?.entries.reduce((sum, e) => sum + e.sold, 0) || 0;
  const totalWastage = data?.entries.reduce((sum, e) => sum + e.wastage, 0) || 0;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Today's Stock</h1>
          <p className="page-subtitle">
            {data ? data.date : ''}
            {data?.store && <> · {data.store}</>}
          </p>
        </div>
        {showStorePicker && stores.length > 0 && (
          <select value={storeId} onChange={(e) => setStoreId(Number(e.target.value))}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}
      {isScoped && myStores.length === 0 && (
        <div className="form-error">Your account isn't assigned to a store yet. Ask an admin to assign one.</div>
      )}

      {!storeId ? null : loading || !data ? (
        <Spinner label="Loading today's stock…" />
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-icon stat-icon-indigo"><BoxIcon /></div>
              <div>
                <div className="stat-value">{totalClosing}</div>
                <div className="stat-label">Units On Hand</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon stat-icon-green"><ReceiptIcon /></div>
              <div>
                <div className="stat-value">{totalSold}</div>
                <div className="stat-label">Units Sold Today</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon stat-icon-red"><TrashIcon /></div>
              <div>
                <div className="stat-value">{totalWastage}</div>
                <div className="stat-label">Units Wasted Today</div>
              </div>
            </div>
            <div className={`stat-card${lowCount > 0 ? ' stat-card-alert' : ''}`}>
              <div className="stat-icon stat-icon-amber"><AlertIcon /></div>
              <div>
                <div className="stat-value">{lowCount}</div>
                <div className="stat-label">Low Stock Alerts</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Opening</th>
                  <th>Received</th>
                  <th>Sold</th>
                  <th>Wastage</th>
                  <th>Closing</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="cell-strong">{e.product}</td>
                    <td>{e.opening}</td>
                    <td>{e.received}</td>
                    <td>{e.sold}</td>
                    <td>{e.wastage}</td>
                    <td className="cell-strong">{e.closing}</td>
                    <td>
                      <span className={`badge ${e.status === 'LOW' ? 'badge-low' : 'badge-ok'}`}>
                        {e.status === 'LOW' ? 'Low Stock' : 'OK'}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <button className="btn-secondary btn-sm" onClick={() => setWastageTarget(e)}>
                        Record Wastage
                      </button>
                    </td>
                  </tr>
                ))}
                {data.entries.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState icon={BoxIcon} message="No products in the catalog yet." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}

      {wastageTarget && (
        <WastageModal
          entry={wastageTarget}
          onClose={() => setWastageTarget(null)}
          onSubmit={(quantity) => handleWastageSubmit(wastageTarget, quantity)}
        />
      )}
    </div>
  );
}
