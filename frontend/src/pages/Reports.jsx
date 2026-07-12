import React, { useEffect, useState } from 'react';
import client from '../api/client';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { AlertIcon } from '../components/icons';
import { formatCurrency } from '../lib/format';

const RECOMMENDATION_LABEL = {
  INCREASE: 'Increase Supply',
  MAINTAIN: 'Maintain',
  DECREASE: 'Decrease Supply',
  NO_DATA: 'No Data',
};

const RECOMMENDATION_CLASS = {
  INCREASE: 'badge-ok',
  MAINTAIN: 'badge-neutral',
  DECREASE: 'badge-low',
  NO_DATA: 'badge-neutral',
};

export default function Reports() {
  const [summary, setSummary] = useState(null);
  const [pnl, setPnl] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState('');

  useEffect(() => {
    client
      .get('/reports/summary')
      .then((res) => setSummary(res.data))
      .catch(() => setError('Failed to load summary.'));
  }, []);

  useEffect(() => {
    client
      .get('/reports/pnl', { params: { days } })
      .then((res) => setPnl(res.data))
      .catch(() => setError('Failed to load profit & loss.'));
  }, [days]);

  useEffect(() => {
    client
      .get('/reports/recommendations', { params: { days } })
      .then((res) => setRecommendations(res.data))
      .catch(() => setError('Failed to load recommendations.'));
  }, [days]);

  if (error) return <div className="page"><div className="form-error">{error}</div></div>;
  if (!summary || !pnl || !recommendations) return <Spinner label="Loading reports…" />;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Reports</h1>
          <p className="page-subtitle">
            {pnl.from} – {pnl.to} · {summary.storesReporting} stores reporting
          </p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{formatCurrency(pnl.overall.revenue)}</div>
          <div className="stat-label">Revenue</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatCurrency(pnl.overall.cogs)}</div>
          <div className="stat-label">Cost of Goods Sold</div>
        </div>
        <div className={`stat-card${pnl.overall.profit < 0 ? ' stat-card-alert' : ''}`}>
          <div className="stat-value">{formatCurrency(pnl.overall.profit)}</div>
          <div className="stat-label">Profit</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{pnl.overall.revenue !== 0 ? `${pnl.overall.marginPct.toFixed(1)}%` : '—'}</div>
          <div className="stat-label">Profit Margin</div>
        </div>
        <div className={`stat-card${summary.lowStockCount > 0 ? ' stat-card-alert' : ''}`}>
          <div className="stat-value">{summary.lowStockCount}</div>
          <div className="stat-label">Low Stock Alerts</div>
        </div>
      </div>

      <h2 className="section-title">Profit &amp; Loss by Store</h2>
      <div className="card">
        <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Store</th>
              <th>Revenue</th>
              <th>COGS</th>
              <th>Profit</th>
              <th>Margin</th>
            </tr>
          </thead>
          <tbody>
            {pnl.stores.map((s) => (
              <tr key={s.storeId}>
                <td className="cell-strong">{s.store}</td>
                <td>{formatCurrency(s.revenue)}</td>
                <td>{formatCurrency(s.cogs)}</td>
                <td className={s.profit < 0 ? 'text-danger' : undefined}>{formatCurrency(s.profit)}</td>
                <td>{s.revenue !== 0 ? `${s.marginPct.toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
            {pnl.stores.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EmptyState icon={AlertIcon} message="No stores yet." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      <h2 className="section-title" style={{ marginTop: 28 }}>Low Stock Today</h2>
      <div className="card">
        <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Store</th>
              <th>Product</th>
              <th>Closing Stock</th>
              <th>Threshold</th>
            </tr>
          </thead>
          <tbody>
            {summary.lowStock.map((p, i) => (
              <tr key={i}>
                <td>{p.store}</td>
                <td className="cell-strong">{p.product}</td>
                <td className="text-low">{p.closing}</td>
                <td>{p.threshold}</td>
              </tr>
            ))}
            {summary.lowStock.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <EmptyState icon={AlertIcon} message="Nothing is low on stock right now." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      <h2 className="section-title" style={{ marginTop: 28 }}>Product Recommendations by Store</h2>

      <div className="store-report-grid">
        {recommendations.stores.map((store) => (
          <div key={store.storeId} className="card store-report-card">
            <h3>{store.store}</h3>
            {store.products.length === 0 ? (
              <p className="form-hint">No activity in this period.</p>
            ) : (
              <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Sold</th>
                    <th>Sell-through</th>
                    <th>Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {store.products.map((p) => (
                    <tr key={p.productId}>
                      <td className="cell-strong">{p.product}</td>
                      <td>{p.totalSold}</td>
                      <td>{Math.round(p.sellThroughRate * 100)}%</td>
                      <td>
                        <span className={`badge ${RECOMMENDATION_CLASS[p.recommendation]}`} title={p.note}>
                          {RECOMMENDATION_LABEL[p.recommendation]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
