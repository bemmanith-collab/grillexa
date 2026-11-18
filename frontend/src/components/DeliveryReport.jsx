import React, { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import client from '../api/client';
import Spinner from './Spinner';
import EmptyState from './EmptyState';
import { AlertIcon } from './icons';
import Chart, { TEAL, FLAME, WARN } from './Chart';
import { formatCurrency } from '../lib/format';

// The Delivery Report tab on Reports: who delivered what where, consignment vs
// direct, what sold, came back or was exchanged, what each store made and
// lost, every bill with its generated/edited time, and suggestions at the end.
// All the arithmetic is server-side (lib/storeSheet.js); this only draws it.

const SOURCES = [
  ['', 'All'],
  ['CONSIGNMENT', 'Settled consignment'],
  ['DIRECT', 'Direct sale'],
];
const pct = (n) => (n == null ? '—' : `${Math.round(n)}%`);
const when = (iso) =>
  new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function SourceBadge({ source }) {
  return <span className={`src-badge src-${source}`}>{source === 'DIRECT' ? 'Direct' : 'Consignment'}</span>;
}

function RateChip({ value }) {
  if (value == null) return '—';
  const cls = value >= 30 ? ' rate-high' : value <= 5 ? ' rate-low' : '';
  return <span className={`rate-chip${cls}`}>{pct(value)}</span>;
}

const legend = { plugins: { legend: { display: true, position: 'bottom' } } };

export default function DeliveryReport({ from, to, storeId, userId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [source, setSource] = useState('');
  const [editedOnly, setEditedOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError('');
    client
      .get('/reports/delivery', { params: { from, to, storeId: storeId || undefined, userId: userId || undefined } })
      .then((res) => !cancelled && setData(res.data))
      .catch((err) => !cancelled && setError(err.response?.data?.error || 'Failed to load the delivery report.'));
    return () => {
      cancelled = true;
    };
  }, [from, to, storeId, userId]);

  const rows = useMemo(() => (data ? data.rows.filter((r) => !source || r.source === source) : []), [data, source]);
  const bills = useMemo(
    () => (data ? data.bills.filter((b) => (!source || b.source === source) && (!editedOnly || b.editedAt)) : []),
    [data, source, editedOnly]
  );

  if (error) return <div className="form-error">{error}</div>;
  if (!data) return <Spinner label="Loading delivery report…" />;

  // The type chips narrow the sheet and bills; totals follow the visible rows.
  const sum = (f) => rows.reduce((s, r) => s + r[f], 0);
  const t = {
    revenue: sum('revenue'), cost: sum('cost'), loss: sum('loss'), sold: sum('sold'), returned: sum('returned'),
    exchanged: sum('exchanged'), pending: sum('pending'), delivered: sum('delivered'),
  };
  t.profit = t.revenue - t.cost - t.loss;
  t.rate = t.sold + t.returned ? (t.returned / (t.sold + t.returned)) * 100 : null;

  const products = data.products.filter((p) => rows.some((r) => r.cells[p.id]));
  const colTotal = (pid, f) => rows.reduce((s, r) => s + (r.cells[pid]?.[f] || 0), 0);
  const hasExch = (p) => colTotal(p.id, 'exchanged') > 0;
  const n = (v, cls) => <td className={v ? cls : 'sheet-zero'}>{v || 0}</td>;

  const topStores = data.stores.slice(0, 10);
  const rated = data.stores
    .filter((s) => s.sold + s.returned >= 5)
    .sort((a, b) => b.returnRatePct - a.returnRatePct)
    .slice(0, 12);

  return (
    <div className="delivery-report">
      <div className="delivery-toolbar">
      <div className="filter-group" role="group" aria-label="Bill type">
        {SOURCES.map(([key, label]) => (
          <button key={key} type="button" className={`filter-chip${source === key ? ' active' : ''}`} onClick={() => setSource(key)}>
            {label}
          </button>
        ))}
      </div>
      {/* Same filters as the screen, so the workbook is what is shown. */}
      <a
        className="btn-primary btn-sm"
        href={`/api/reports/delivery/excel?${new URLSearchParams({
          from,
          to,
          ...(storeId ? { storeId } : {}),
          ...(userId ? { userId } : {}),
        })}`}
        download
      >
        <Download size={15} /> Download Excel
      </a>
      </div>

      <div className="stat-grid">
        {[
          [formatCurrency(t.revenue), 'Money made', `${t.sold} units sold`],
          [formatCurrency(t.profit), 'Profit after losses', `cost of goods ${formatCurrency(t.cost)}`],
          [formatCurrency(t.loss), 'Loss', `${t.returned} returned, ${t.exchanged} exchanged`],
          [pct(t.rate), 'Return rate', 'of settled goods'],
          [`${t.pending} units`, 'Pending', 'delivered, not settled'],
        ].map(([v, l, h]) => (
          <div className="stat-card" key={l}>
            <div>
              <div className="stat-value">{v}</div>
              <div className="stat-label">{l}</div>
              <div className="cell-muted stat-hint">{h}</div>
            </div>
          </div>
        ))}
      </div>
      {data.totals.revenue > 0 && data.totals.cost === 0 && (
        <div className="card">
          <p className="chart-hint">
            Cost and loss show ₹0 because the products have no cost price. Set one on the Products page to see real profit and loss.
          </p>
        </div>
      )}

      <div className="card">
        <h2 className="card-title">Store sheet</h2>
        <p className="chart-hint">
          One row per store, per person, per type. Consignments are counted on the day they were delivered, with how they
          settled. Blank means zero. Made is the money taken. Loss is what came back, at cost price.
        </p>
        {rows.length === 0 ? (
          <EmptyState icon={AlertIcon} message="Nothing delivered or sold in this range." />
        ) : (
          <div className="table-scroll">
            <table className="sheet-table">
              <thead>
                <tr>
                  <th rowSpan={2}>Sl</th>
                  <th rowSpan={2} className="l">Store</th>
                  <th rowSpan={2} className="l">Person</th>
                  <th rowSpan={2} className="l">Type</th>
                  {products.map((p) => (
                    <th key={p.id} colSpan={hasExch(p) ? 3 : 2} className="sheet-product">{p.name}</th>
                  ))}
                  <th rowSpan={2}>Delivered</th>
                  <th rowSpan={2}>Made</th>
                  <th rowSpan={2}>Loss</th>
                </tr>
                <tr>
                  {products.map((p) => (
                    <React.Fragment key={p.id}>
                      <th>Sold</th>
                      <th>Ret</th>
                      {hasExch(p) && <th>Exch</th>}
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key}>
                    <td>{i + 1}</td>
                    <td className="l cell-strong">{r.store}</td>
                    <td className="l">{r.person}</td>
                    <td className="l"><SourceBadge source={r.source} /></td>
                    {products.map((p) => {
                      const c = r.cells[p.id] || {};
                      return (
                        <React.Fragment key={p.id}>
                          {n(c.sold)}
                          {n(c.returned, 'sheet-ret')}
                          {hasExch(p) && n(c.exchanged, 'sheet-exch')}
                        </React.Fragment>
                      );
                    })}
                    <td>{r.delivered}</td>
                    <td>{formatCurrency(r.revenue)}</td>
                    <td className={r.loss ? 'sheet-ret' : 'cell-muted'}>{r.loss ? formatCurrency(r.loss) : '—'}</td>
                  </tr>
                ))}
                <tr className="sheet-total">
                  <td />
                  <td className="l" colSpan={3}>TOTAL</td>
                  {products.map((p) => (
                    <React.Fragment key={p.id}>
                      <td>{colTotal(p.id, 'sold')}</td>
                      <td>{colTotal(p.id, 'returned')}</td>
                      {hasExch(p) && <td>{colTotal(p.id, 'exchanged')}</td>}
                    </React.Fragment>
                  ))}
                  <td>{t.delivered}</td>
                  <td>{formatCurrency(t.revenue)}</td>
                  <td>{formatCurrency(t.loss)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="card-title">Bills</h2>
        <p className="chart-hint">
          When each bill was generated and last edited. Edits made before 18/11/2026 were not recorded, so those bills show
          only when they were generated.
        </p>
        <div className="filter-group">
          <button type="button" className={`filter-chip${editedOnly ? ' active' : ''}`} onClick={() => setEditedOnly((v) => !v)}>
            Edited bills only
          </button>
        </div>
        {bills.length === 0 ? (
          <EmptyState icon={AlertIcon} message={editedOnly ? 'No edited bills in this range.' : 'No bills in this range.'} />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Store</th>
                  <th>Billed by</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Generated</th>
                  <th>Last edited</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={`${b.source}-${b.number}`}>
                    <td className="cell-mono">{b.number}</td>
                    <td className="cell-strong">{b.store}</td>
                    <td>{b.person}</td>
                    <td><SourceBadge source={b.source} /></td>
                    <td>{formatCurrency(b.amount)}</td>
                    <td className="cell-muted">{when(b.generatedAt)}</td>
                    <td>{b.editedAt ? <><span className="edited-badge">Edited</span> {when(b.editedAt)}</> : <span className="cell-muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(data.advice.grow.length > 0 || data.advice.cut.length > 0) && (
        <div className="chart-grid">
          <div className="card">
            <h2 className="card-title">Deliver more: sells out, almost nothing back</h2>
            <ul className="advice-list">
              {data.advice.grow.map((a) => (
                <li key={a.store}><span>{a.store}</span><span className="cell-muted">{pct(a.returnRatePct)} back · made {formatCurrency(a.revenue)}</span></li>
              ))}
              {data.advice.grow.length === 0 && <li className="cell-muted">None in this range.</li>}
            </ul>
          </div>
          <div className="card">
            <h2 className="card-title">Deliver less: 30% or more comes back</h2>
            <ul className="advice-list">
              {data.advice.cut.map((a) => (
                <li key={a.store}><span>{a.store}</span><span className="cell-muted">{pct(a.returnRatePct)} back · lost {formatCurrency(a.loss)}</span></li>
              ))}
              {data.advice.cut.length === 0 && <li className="cell-muted">None in this range.</li>}
            </ul>
          </div>
        </div>
      )}

      {data.stores.length > 0 && (
        <div className="chart-grid">
          <div className="card">
            <h2 className="card-title">Made and lost, by store</h2>
            <p className="chart-hint">The 10 stores that made the most.</p>
            <Chart
              type="bar"
              height={300}
              ariaLabel="Money made and lost by store"
              data={{
                labels: topStores.map((s) => s.label),
                datasets: [
                  { label: 'Made', data: topStores.map((s) => s.revenue), backgroundColor: TEAL, borderRadius: 4 },
                  { label: 'Lost', data: topStores.map((s) => s.loss), backgroundColor: FLAME, borderRadius: 4 },
                ],
              }}
              options={{ horizontal: true, chart: { indexAxis: 'y' }, ...legend }}
            />
          </div>
          <div className="card">
            <h2 className="card-title">Return rate, by store</h2>
            <p className="chart-hint">Share of settled goods that came back. Stores with fewer than 5 units are left out.</p>
            {rated.length === 0 ? (
              <EmptyState icon={AlertIcon} message="Not enough settled goods to compare." />
            ) : (
              <Chart
                type="bar"
                height={300}
                ariaLabel="Return rate by store"
                data={{
                  labels: rated.map((s) => s.label),
                  datasets: [{
                    label: 'Return rate %',
                    data: rated.map((s) => +s.returnRatePct.toFixed(1)),
                    backgroundColor: rated.map((s) => (s.returnRatePct >= 30 ? WARN : TEAL)),
                    borderRadius: 4,
                  }],
                }}
                options={{ horizontal: true, currency: false, chart: { indexAxis: 'y' } }}
              />
            )}
          </div>
          <div className="card">
            <h2 className="card-title">Sold and returned, by product</h2>
            <Chart
              type="bar"
              height={300}
              ariaLabel="Units sold, returned and exchanged by product"
              data={{
                labels: data.products.map((p) => p.name),
                datasets: [
                  { label: 'Sold', data: data.products.map((p) => p.sold), backgroundColor: TEAL, borderRadius: 4 },
                  { label: 'Returned', data: data.products.map((p) => p.returned), backgroundColor: FLAME, borderRadius: 4 },
                  { label: 'Exchanged', data: data.products.map((p) => p.exchanged), backgroundColor: WARN, borderRadius: 4 },
                ],
              }}
              options={{ currency: false, ...legend }}
            />
          </div>
          <div className="card">
            <h2 className="card-title">Each person's sales</h2>
            <Chart
              type="bar"
              height={300}
              ariaLabel="Money made by each person, consignment and direct"
              data={{
                labels: data.people.map((p) => p.label),
                datasets: [
                  { label: 'Consignment', data: data.people.map((p) => p.revenueConsignment), backgroundColor: TEAL, borderRadius: 4 },
                  { label: 'Direct', data: data.people.map((p) => p.revenueDirect), backgroundColor: FLAME, borderRadius: 4 },
                ],
              }}
              options={{ horizontal: true, chart: { indexAxis: 'y' }, ...legend }}
            />
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="card-title">Each store</h2>
        <p className="chart-hint">Pending is delivered but not settled yet. Profit is made, minus the cost of what sold, minus the loss.</p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Store</th><th>Delivered</th><th>Sold</th><th>Returned</th><th>Exchanged</th><th>Pending</th>
                <th>Made</th><th>Cost</th><th>Loss</th><th>Profit</th><th>Return rate</th>
              </tr>
            </thead>
            <tbody>
              {data.stores.map((s) => (
                <tr key={s.id}>
                  <td className="cell-strong">{s.label}</td>
                  <td>{s.delivered}</td><td>{s.sold}</td><td>{s.returned}</td><td>{s.exchanged}</td><td>{s.pending}</td>
                  <td>{formatCurrency(s.revenue)}</td><td>{formatCurrency(s.cost)}</td>
                  <td className={s.loss ? 'text-danger' : undefined}>{formatCurrency(s.loss)}</td>
                  <td className={s.profit < 0 ? 'text-danger' : undefined}>{formatCurrency(s.profit)}</td>
                  <td><RateChip value={s.returnRatePct} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Each person</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Person</th><th>Delivered</th><th>Sold</th><th>Returned</th><th>Exchanged</th>
                <th>Made (consignment)</th><th>Made (direct)</th><th>Loss</th><th>Profit</th><th>Return rate</th>
              </tr>
            </thead>
            <tbody>
              {data.people.map((p) => (
                <tr key={p.id}>
                  <td className="cell-strong">{p.label}</td>
                  <td>{p.delivered}</td><td>{p.sold}</td><td>{p.returned}</td><td>{p.exchanged}</td>
                  <td>{formatCurrency(p.revenueConsignment)}</td><td>{formatCurrency(p.revenueDirect)}</td>
                  <td className={p.loss ? 'text-danger' : undefined}>{formatCurrency(p.loss)}</td>
                  <td>{formatCurrency(p.profit)}</td>
                  <td><RateChip value={p.returnRatePct} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Suggestions</h2>
        <p className="chart-hint">Worked out from the numbers above, biggest money first. They follow the date, store and person filters.</p>
        {data.suggestions.length === 0 ? (
          <EmptyState icon={AlertIcon} message="Nothing stands out in this range. Try a wider date range." />
        ) : (
          <ol className="suggestion-list">
            {data.suggestions.map((s) => (
              <li key={s.title}>
                <div className="suggestion-head">
                  <span className="cell-strong">{s.title}</span>
                  {s.impact > 0 && <span className="suggestion-impact">≈ {formatCurrency(s.impact)}</span>}
                </div>
                <div className="cell-muted">{s.detail}</div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
