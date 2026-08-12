import React, { useEffect, useMemo, useState } from 'react';
import { Download, X } from 'lucide-react';
import client from '../api/client';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { AlertIcon } from '../components/icons';
import { formatCurrency } from '../lib/format';
import { formatDate, todayStr, startOfWeekStr, startOfMonthStr } from '../utils/date';
import Chart, { lineData, barData, doughnutData, TEAL, FLAME, WARN, money } from '../components/Chart';

// The four ranges a manager actually asks for, plus a custom pair. Each one
// resolves to a from/to here rather than on the server, so every endpoint on
// the page takes the same two dates and cannot disagree about what "this
// month" meant.
const RANGES = {
  today: { label: 'Today', of: () => [todayStr(), todayStr()] },
  week: { label: 'This week', of: () => [startOfWeekStr(), todayStr()] },
  month: { label: 'This month', of: () => [startOfMonthStr(), todayStr()] },
  custom: { label: 'Custom', of: null },
};

export default function Reports() {
  const [range, setRange] = useState('month');
  const [custom, setCustom] = useState({ from: startOfMonthStr(), to: todayStr() });
  const [storeId, setStoreId] = useState('');
  const [productId, setProductId] = useState('');
  const [userId, setUserId] = useState('');

  const [analytics, setAnalytics] = useState(null);
  const [summary, setSummary] = useState(null);
  const [pnl, setPnl] = useState(null);
  const [productSales, setProductSales] = useState(null);
  const [error, setError] = useState('');

  const [from, to] = range === 'custom' ? [custom.from, custom.to] : RANGES[range].of();

  // One params object for every request on the page and for the Excel link, so
  // the workbook covers exactly what is on screen.
  const params = useMemo(() => {
    const p = { from, to };
    if (storeId) p.storeId = storeId;
    if (productId) p.productId = productId;
    if (userId) p.userId = userId;
    return p;
  }, [from, to, storeId, productId, userId]);

  useEffect(() => {
    let cancelled = false;
    setError('');
    Promise.all([
      client.get('/reports/analytics', { params }),
      client.get('/reports/summary'),
      client.get('/reports/pnl', {
        params: { from, to, storeId: storeId || undefined, userId: userId || undefined },
      }),
      // No userId: Units Moved comes from the stock ledger, which records a
      // store and a day and nobody's name — see the note above the table.
      client.get('/reports/product-sales', {
        params: { from, to, storeId: storeId || undefined, productId: productId || undefined },
      }),
    ])
      .then(([a, s, p, ps]) => {
        if (cancelled) return;
        setAnalytics(a.data);
        setSummary(s.data);
        setPnl(p.data);
        setProductSales(ps.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || 'Failed to load reports.');
      });
    return () => {
      cancelled = true;
    };
  }, [params, from, to, storeId, productId, userId]);

  const excelUrl = `/api/reports/excel?${new URLSearchParams({
    from,
    to,
    ...(storeId ? { storeId } : {}),
  })}`;

  // Drilling down is just setting the filter the clicked mark stands for —
  // same state the dropdowns write, so there is one way in and one way out.
  function drillToStore(index) {
    const row = analytics?.storePerformance[index];
    if (row?.id) setStoreId(String(row.id));
  }
  function drillToProduct(rows) {
    return (index) => {
      const row = rows[index];
      if (row?.id) setProductId(String(row.id));
    };
  }
  function drillToPerson(index) {
    const row = analytics?.salespersonPerformance[index];
    if (row?.id) setUserId(String(row.id));
  }
  function drillToDay(index) {
    const day = analytics?.salesTrend[index];
    if (!day) return;
    setCustom({ from: day.date, to: day.date });
    setRange('custom');
  }

  const storeName = analytics?.filters.stores.find((s) => String(s.id) === storeId)?.name;
  const productName = analytics?.filters.products.find((p) => String(p.id) === productId)?.name;
  const personName = analytics?.filters.people.find((p) => String(p.id) === userId)?.name;

  if (error) return <div className="page"><div className="form-error">{error}</div></div>;
  if (!analytics || !summary || !pnl || !productSales) return <Spinner label="Loading reports…" />;

  const trend = analytics.salesTrend;
  const totalSales = trend.reduce((sum, d) => sum + d.amount, 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Reports</h1>
          <p className="page-subtitle">
            {formatDate(from)} – {formatDate(to)} · {summary.storesReporting} stores reporting today
          </p>
        </div>
        <div className="page-header-actions">
          <a className="btn-primary btn-sm" href={excelUrl} download>
            <Download size={15} /> Download Excel
          </a>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-group" role="group" aria-label="Date range">
          {Object.entries(RANGES).map(([key, r]) => (
            <button
              key={key}
              type="button"
              className={`filter-chip${range === key ? ' active' : ''}`}
              onClick={() => setRange(key)}
            >
              {r.label}
            </button>
          ))}
        </div>

        {range === 'custom' && (
          <div className="filter-group">
            <input
              type="date"
              value={custom.from}
              max={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              aria-label="From date"
            />
            <input
              type="date"
              value={custom.to}
              min={custom.from}
              max={todayStr()}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              aria-label="To date"
            />
          </div>
        )}

        <div className="filter-group">
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} aria-label="Store">
            <option value="">All stores</option>
            {analytics.filters.stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Product">
            <option value="">All products</option>
            {analytics.filters.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Sales person">
            <option value="">All sales people</option>
            {analytics.filters.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {(storeId || productId || userId) && (
          <div className="filter-group">
            {storeId && (
              <button type="button" className="filter-chip active" onClick={() => setStoreId('')}>
                {storeName || 'Store'} <X size={13} />
              </button>
            )}
            {productId && (
              <button type="button" className="filter-chip active" onClick={() => setProductId('')}>
                {productName || 'Product'} <X size={13} />
              </button>
            )}
            {userId && (
              <button type="button" className="filter-chip active" onClick={() => setUserId('')}>
                {personName || 'Sales person'} <X size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {userId && (
        <p className="chart-hint">
          The Excel export covers the store and date range, not the sales person — every person's
          figures are on its Salesperson Performance sheet.
        </p>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div>
            <div className="stat-value">{formatCurrency(totalSales)}</div>
            <div className="stat-label">Sales in range</div>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-value">{formatCurrency(pnl.overall.profit)}</div>
            <div className="stat-label">Profit</div>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-value">
              {pnl.overall.revenue !== 0 ? `${pnl.overall.marginPct.toFixed(1)}%` : '—'}
            </div>
            <div className="stat-label">Margin</div>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-value">
              {formatCurrency(analytics.wastageByProduct.reduce((s, w) => s + w.value, 0))}
            </div>
            <div className="stat-label">Wastage (at cost)</div>
          </div>
        </div>
      </div>

      <h2 className="section-title">Sales trend</h2>
      <div className="card">
        <p className="chart-hint">Tap a day to zoom the whole page to it.</p>
        <Chart
          type="line"
          height={240}
          ariaLabel={`Daily sales from ${from} to ${to}`}
          data={lineData(trend, { label: 'Sales', color: TEAL })}
          onSelect={drillToDay}
        />
      </div>

      <div className="chart-grid">
        <div className="card">
          <h2 className="card-title">Product mix</h2>
          {analytics.productDistribution.length === 0 ? (
            <EmptyState icon={AlertIcon} message="No sales in this range." />
          ) : (
            <Chart
              type="doughnut"
              height={260}
              ariaLabel="Share of sales by product"
              data={doughnutData(analytics.productDistribution, { label: 'Sales' })}
              onSelect={drillToProduct(analytics.productDistribution)}
              options={{
                plugins: {
                  tooltip: {
                    callbacks: {
                      label: (ctx) => ` ${ctx.label}: ${money(ctx.parsed)}`,
                    },
                  },
                },
              }}
            />
          )}
        </div>

        <div className="card">
          <h2 className="card-title">Store performance</h2>
          {analytics.storePerformance.length === 0 ? (
            <EmptyState icon={AlertIcon} message="No sales in this range." />
          ) : (
            <Chart
              type="bar"
              height={260}
              ariaLabel="Sales by store"
              data={barData(analytics.storePerformance, { label: 'Sales', color: FLAME })}
              onSelect={drillToStore}
            />
          )}
        </div>

        <div className="card">
          <h2 className="card-title">Wastage by product</h2>
          {/* Said out loud rather than left to be inferred from a chart that
              did not move when the person filter was set. */}
          {userId && (
            <p className="chart-hint">
              Wastage is recorded against a store and a day, never a person — this is all wastage
              in the range.
            </p>
          )}
          {analytics.wastageByProduct.length === 0 ? (
            <EmptyState icon={AlertIcon} message="No wastage recorded. Good." />
          ) : (
            <Chart
              type="bar"
              height={260}
              ariaLabel="Wastage value by product"
              data={barData(analytics.wastageByProduct, { label: 'Wastage', y: 'value', color: WARN })}
              onSelect={drillToProduct(analytics.wastageByProduct)}
            />
          )}
        </div>

        <div className="card">
          <h2 className="card-title">Sales people</h2>
          {analytics.salespersonPerformance.length === 0 ? (
            <EmptyState icon={AlertIcon} message="No sales in this range." />
          ) : (
            <Chart
              type="bar"
              height={260}
              ariaLabel="Sales by salesperson"
              data={barData(analytics.salespersonPerformance, { label: 'Sales', color: TEAL })}
              onSelect={drillToPerson}
              options={{ horizontal: true, chart: { indexAxis: 'y' } }}
            />
          )}
        </div>
      </div>

      <h2 className="section-title">Profit &amp; Loss by Store</h2>
      <div className="card">
        <div className="table-scroll">
        <table className="data-table pnl-table">
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

      <h2 className="section-title" style={{ marginTop: 28 }}>Units Moved by Store</h2>
      {userId && (
        <p className="chart-hint">
          Not filtered by sales person: these come from the stock ledger, which records a store and
          a day, not who moved the goods.
        </p>
      )}

      <div className="store-report-grid">
        {productSales.stores.map((store) => (
          <details key={store.storeId} className="card store-report-card">
            {/* Closed by default: on a phone every row of every store's table
                is a card, so 60-odd stores expanded is a page nobody reaches
                the end of. A summary per store is one line each. */}
            <summary>{store.store}</summary>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Received</th>
                    <th>Sold</th>
                    <th>Wastage</th>
                  </tr>
                </thead>
                <tbody>
                  {store.products.map((p) => (
                    <tr key={p.productId}>
                      <td className="cell-strong">{p.product}</td>
                      <td>{p.totalReceived}</td>
                      <td className="cell-strong">{p.totalSold}</td>
                      <td>{p.totalWastage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
