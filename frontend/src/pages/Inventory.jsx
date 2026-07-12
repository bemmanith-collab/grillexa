import React, { useEffect, useMemo, useState } from 'react';
import { Package, CheckCircle2, XCircle, AlertTriangle, Search } from 'lucide-react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import WastageModal from '../components/WastageModal';
import StockDetailModal from '../components/StockDetailModal';
import DailyWisdom from '../components/DailyWisdom';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { BoxIcon } from '../components/icons';
import { STATUS_LABEL, STATUS_BADGE_CLASS } from '../lib/stockStatus';

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
  const [detailEntry, setDetailEntry] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

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

  const lowCount = data?.entries.filter((e) => e.status !== 'OK').length || 0;
  const totalClosing = data?.entries.reduce((sum, e) => sum + e.closing, 0) || 0;
  const totalSold = data?.entries.reduce((sum, e) => sum + e.sold, 0) || 0;
  const totalWastage = data?.entries.reduce((sum, e) => sum + e.wastage, 0) || 0;

  const prevLowCount = prevEntries.filter((e) => e.status !== 'OK').length;
  const prevClosing = prevEntries.reduce((sum, e) => sum + e.closing, 0);
  const prevSold = prevEntries.reduce((sum, e) => sum + e.sold, 0);
  const prevWastage = prevEntries.reduce((sum, e) => sum + e.wastage, 0);

  const filteredEntries = useMemo(() => {
    if (!data) return [];
    return data.entries.filter((e) => {
      if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
      if (search.trim() && !e.product.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [data, search, statusFilter]);

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
        <div className="page-header-actions">
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
      </div>

      <DailyWisdom variant={user.role === 'SALES' ? 'prominent' : 'subtle'} />

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

          <div className="card form-card">
            <div className="inline-form">
              <div className="search-input">
                <Search size={16} />
                <input
                  placeholder="Search products…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="ALL">All statuses</option>
                <option value="OK">In Stock</option>
                <option value="LOW">Low Stock</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
          </div>

          <div className="card">
            <div className="table-scroll">
            <table className="data-table data-table-zebra">
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
                {filteredEntries.map((e) => (
                  <tr key={e.id} className="row-clickable" onClick={() => setDetailEntry(e)}>
                    <td className="cell-strong">{e.product}</td>
                    <td>{e.opening}</td>
                    <td>{e.received}</td>
                    <td>{e.sold}</td>
                    <td>{e.wastage}</td>
                    <td className="cell-strong">{e.closing}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE_CLASS[e.status]}`}>{STATUS_LABEL[e.status]}</span>
                    </td>
                    <td className="actions-cell">
                      <button
                        className="btn-secondary btn-sm"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setWastageTarget(e);
                        }}
                      >
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
                {data.entries.length > 0 && filteredEntries.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState icon={Search} message="No products match your search or filter." />
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

      {detailEntry && (
        <StockDetailModal
          entry={detailEntry}
          onClose={() => setDetailEntry(null)}
          onRecordWastage={() => {
            setWastageTarget(detailEntry);
            setDetailEntry(null);
          }}
        />
      )}

    </div>
  );
}
