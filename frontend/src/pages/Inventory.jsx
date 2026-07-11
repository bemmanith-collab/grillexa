import React, { useEffect, useState } from 'react';
import { Package, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import WastageModal from '../components/WastageModal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { BoxIcon } from '../components/icons';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// direction the metric moved, plus the % change (null once previous is 0 —
// a percentage off a zero baseline isn't meaningful, so we just say "New").
function computeTrend(current, previous) {
  if (!previous) return current > 0 ? { direction: 'up', pct: null } : null;
  if (current === previous) return { direction: 'flat', pct: 0 };
  const pct = Math.round((Math.abs(current - previous) / previous) * 100);
  return { direction: current > previous ? 'up' : 'down', pct };
}

// sentiment: which direction counts as "good" for this metric, or 'neutral'
// for metrics (like Units On Hand) where up/down isn't inherently good/bad.
function StatTrend({ trend, sentiment }) {
  if (!trend) return null;
  const arrow = trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→';
  const amount = trend.pct == null ? 'New today' : `${trend.pct}% from yesterday`;
  let tone = 'stat-trend-neutral';
  if (sentiment !== 'neutral' && trend.direction !== 'flat') {
    const good = sentiment === 'up-is-good' ? trend.direction === 'up' : trend.direction === 'down';
    tone = good ? 'stat-trend-good' : 'stat-trend-bad';
  }
  return (
    <div className={`stat-trend ${tone}`}>
      {arrow} {amount}
    </div>
  );
}

export default function Inventory() {
  const { user } = useAuth();
  const isScoped = user.role === 'SALES';
  const myStores = isScoped ? user.stores : [];
  const showStorePicker = !isScoped || myStores.length > 1;
  const [stores, setStores] = useState(isScoped ? myStores : []);
  const [storeId, setStoreId] = useState(isScoped ? myStores[0]?.id || '' : '');
  const [data, setData] = useState(null);
  const [prevEntries, setPrevEntries] = useState([]);
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
      const [todayRes, historyRes] = await Promise.all([
        client.get('/stock/today', { params: { storeId: sid, date: todayStr() } }),
        client
          .get('/stock/history', { params: { storeId: sid, from: yesterdayStr(), to: yesterdayStr() } })
          .catch(() => ({ data: { entries: [] } })),
      ]);
      setData(todayRes.data);
      setPrevEntries(historyRes.data.entries);
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

  const prevLowCount = prevEntries.filter((e) => e.status === 'LOW').length;
  const prevClosing = prevEntries.reduce((sum, e) => sum + e.closing, 0);
  const prevSold = prevEntries.reduce((sum, e) => sum + e.sold, 0);
  const prevWastage = prevEntries.reduce((sum, e) => sum + e.wastage, 0);

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
              <div className="stat-icon stat-icon-blue"><Package size={20} strokeWidth={1.8} /></div>
              <div>
                <div className="stat-value">{totalClosing}</div>
                <div className="stat-label">Units On Hand</div>
                <StatTrend trend={computeTrend(totalClosing, prevClosing)} sentiment="neutral" />
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon stat-icon-green"><CheckCircle2 size={20} strokeWidth={1.8} /></div>
              <div>
                <div className="stat-value">{totalSold}</div>
                <div className="stat-label">Units Sold Today</div>
                <StatTrend trend={computeTrend(totalSold, prevSold)} sentiment="up-is-good" />
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon stat-icon-amber"><XCircle size={20} strokeWidth={1.8} /></div>
              <div>
                <div className="stat-value">{totalWastage}</div>
                <div className="stat-label">Units Wasted Today</div>
                <StatTrend trend={computeTrend(totalWastage, prevWastage)} sentiment="down-is-good" />
              </div>
            </div>
            <div className={`stat-card${lowCount > 0 ? ' stat-card-alert' : ''}`}>
              <div className="stat-icon stat-icon-red"><AlertTriangle size={20} strokeWidth={1.8} /></div>
              <div>
                <div className="stat-value">{lowCount}</div>
                <div className="stat-label">Low Stock Alerts</div>
                <StatTrend trend={computeTrend(lowCount, prevLowCount)} sentiment="down-is-good" />
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
