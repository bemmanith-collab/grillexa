import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Trophy,
  Store,
  Wallet,
  Handshake,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  MapPinOff,
  RefreshCw,
  Download,
  Trash2,
} from 'lucide-react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import Chart, { lineData, TEAL } from '../components/Chart';
import DailyWisdom from '../components/DailyWisdom';
import ShiftWastageModal from '../components/ShiftWastageModal';
import Toast from '../components/Toast';
import { formatCurrency } from '../lib/format';
import { daysAgoStr, todayStr } from '../utils/date';

// Long enough that the page is never the reason a phone's battery dies between
// two shops, short enough that the figure you glance at on the way out of one
// is this morning's, not last night's.
const REFRESH_MS = 5 * 60 * 1000;
// How far down the pull has to go before it counts. Below this it is a scroll
// that overshot, and reloading on those makes the page feel possessed.
const PULL_TRIGGER_PX = 70;

// The date is a calendar day from the server, so it is read in UTC — the same
// rule the rest of the app formats dates by (see utils/date.js).
const FULL_DATE = { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' };

export default function Dashboard() {
  const { user } = useAuth();
  const staff = user.role !== 'SALES';
  // Everyone lands on their own day, admins included — they sell too. The
  // picker is how they leave it.
  const [viewing, setViewing] = useState('me');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [pull, setPull] = useState(0);
  const [wastageOpen, setWastageOpen] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const params = viewing === 'me' ? {} : { userId: viewing };
      const res = await client.get('/dashboard/salesperson', { params });
      setData(res.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load your dashboard.');
    } finally {
      setRefreshing(false);
    }
  }, [viewing]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh, but only while the page is actually being looked at: the app
  // sits open in a pocket all day, and waking it every five minutes to refetch
  // a screen nobody is reading costs battery and mobile data for nothing.
  // Coming back to the foreground refreshes immediately, which is the moment
  // the number matters.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  // Pull-to-refresh. The browser's own is not available here: installed as an
  // app there is no chrome to pull against, and this is the gesture everyone
  // tries first. Only from the very top, and only downward, so it never fights
  // the scroll.
  const startY = useRef(null);
  useEffect(() => {
    function onStart(e) {
      startY.current = window.scrollY === 0 ? e.touches[0].clientY : null;
    }
    function onMove(e) {
      if (startY.current === null) return;
      const distance = e.touches[0].clientY - startY.current;
      // Damped: 200px of finger gives ~66px of indicator, so the pull feels
      // like it is resisting rather than sliding the page off the screen.
      setPull(distance > 0 ? Math.min(distance / 3, 90) : 0);
    }
    function onEnd() {
      if (pull >= PULL_TRIGGER_PX) load();
      startY.current = null;
      setPull(0);
    }
    // Passive: this only ever reads the touch, never calls preventDefault, so
    // it must not make the browser wait on it before scrolling.
    const opts = { passive: true };
    window.addEventListener('touchstart', onStart, opts);
    window.addEventListener('touchmove', onMove, opts);
    window.addEventListener('touchend', onEnd, opts);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [pull, load]);

  if (!data && !error) return <Spinner label="Loading your day…" />;

  const date = data ? new Date(`${data.date}T00:00:00.000Z`) : null;
  const company = data?.scope === 'company';
  const rank = data?.ranking;
  const trend = data?.sales.changePct;

  return (
    <div className="page dashboard">
      {(pull > 0 || refreshing) && (
        <div className="pull-indicator" style={{ height: refreshing ? 36 : pull }}>
          <RefreshCw
            size={18}
            className={refreshing ? 'icon-spin' : undefined}
            style={{ transform: refreshing ? undefined : `rotate(${pull * 4}deg)` }}
          />
          <span>{refreshing ? 'Refreshing…' : pull >= PULL_TRIGGER_PX ? 'Release to refresh' : 'Pull to refresh'}</span>
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      {data && (
        <>
          <div className="page-header">
            <div>
              <h1>
                {company ? "Today's Dashboard — Everyone" : `Today's Dashboard — ${data.person.name}`}
              </h1>
              <p className="page-subtitle">{date.toLocaleDateString('en-GB', FULL_DATE)}</p>
            </div>
            <div className="page-header-actions">
              {staff && (
                <select value={viewing} onChange={(e) => setViewing(e.target.value)} aria-label="Whose dashboard">
                  <option value="me">My metrics</option>
                  <option value="all">Everyone (company)</option>
                  {data.people
                    .filter((p) => p.id !== user.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              )}
              <button type="button" className="btn-secondary btn-sm" onClick={load} disabled={refreshing}>
                <RefreshCw size={15} className={refreshing ? 'icon-spin' : undefined} /> Refresh
              </button>
              {/* Everyone, including Sales — they are the ones counting at the
                  end of their own run. The count has no store on it, so
                  unlike Today's Stock there is nothing to scope it to. */}
              <button type="button" className="btn-secondary btn-sm" onClick={() => setWastageOpen(true)}>
                <Trash2 size={15} /> Record Wastage
              </button>
              {/* The workbook is company detail, so it follows the same rule
                  as Reports: staff only. Covers the last 30 days — the window
                  the trend below is drawn from, so the file matches the page. */}
              {staff && (
                <a
                  className="btn-primary btn-sm"
                  href={`/api/reports/excel?from=${daysAgoStr(29)}&to=${todayStr()}`}
                  download
                >
                  <Download size={15} /> Excel
                </a>
              )}
            </div>
          </div>

          {rank && rank.rank && (
            <div className={`rank-banner${rank.rank === 1 ? ' rank-banner-top' : ''}`}>
              <Trophy size={20} strokeWidth={1.8} />
              <span>
                {rank.leaderIsSelf ? (
                  <strong>{data.person.isSelf ? "You're #1 today!" : `${data.person.name} is #1 today!`}</strong>
                ) : (
                  <>
                    <strong>
                      {data.person.isSelf ? `You're #${rank.rank} today!` : `#${rank.rank} today`}
                    </strong>
                    {rank.leader && <span className="rank-leader"> ({rank.leader} is #1)</span>}
                  </>
                )}
                <span className="rank-of"> of {rank.of}</span>
              </span>
            </div>
          )}

          {/* Under the name and the ranking, above the numbers: this is the
              first page of the day now, which is the whole point of a daily
              quote. Sales accounts get the prominent card, as they did on
              Today's Stock. */}
          <DailyWisdom variant={user.role === 'SALES' ? 'prominent' : 'subtle'} />

          <div className="stat-grid">
            <div className={`stat-card${data.visits.missed.length ? ' stat-card-alert' : ''}`}>
              <div className="stat-icon stat-icon-blue">
                <Store size={20} strokeWidth={1.8} />
              </div>
              <div>
                <div className="stat-value">
                  {data.visits.visited}
                  {data.visits.assigned > 0 && <span className="stat-of">/{data.visits.assigned}</span>}
                </div>
                <div className="stat-label">Stores visited</div>
                {data.visits.missed.length > 0 && (
                  <div className="stat-trend stat-trend-bad">🔴 {data.visits.missed.length} missed</div>
                )}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon stat-icon-green">
                <Wallet size={20} strokeWidth={1.8} />
              </div>
              <div>
                <div className="stat-value">{formatCurrency(data.sales.today)}</div>
                <div className="stat-label">Sales today</div>
                {trend === null ? (
                  <div className="stat-trend stat-trend-neutral">no sales this day last week</div>
                ) : (
                  <div className={`stat-trend ${trend >= 0 ? 'stat-trend-good' : 'stat-trend-bad'}`}>
                    {trend >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                    {trend >= 0 ? '+' : ''}
                    {trend.toFixed(0)}% vs last {date.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })}
                  </div>
                )}
              </div>
            </div>

            <div className={`stat-card${data.settlements.pending ? ' stat-card-alert' : ''}`}>
              <div className="stat-icon stat-icon-indigo">
                <Handshake size={20} strokeWidth={1.8} />
              </div>
              <div>
                <div className="stat-value">{data.settlements.settledToday}</div>
                <div className="stat-label">Consignments settled</div>
                {data.settlements.pending > 0 && (
                  <div className="stat-trend stat-trend-bad">⏳ {data.settlements.pending} pending</div>
                )}
              </div>
            </div>
          </div>

          {data.trend?.length > 0 && (
            <>
              <h2 className="section-title">Last 30 days</h2>
              <div className="card">
                <Chart
                  type="line"
                  height={180}
                  ariaLabel={`Daily sales for the last 30 days${company ? '' : `, ${data.person.name}`}`}
                  data={lineData(data.trend, { label: 'Sales', color: TEAL })}
                />
              </div>
            </>
          )}

          <h2 className="section-title">Top products today</h2>
          <div className="card">
            {data.topProducts.length === 0 ? (
              <p className="form-hint">Nothing sold yet today.</p>
            ) : (
              <ul className="top-products">
                {data.topProducts.map((p) => (
                  <li key={p.productId}>
                    <div className="top-product-row">
                      <span className="top-product-name">{p.name}</span>
                      <span className="top-product-amount">{formatCurrency(p.amount)}</span>
                    </div>
                    <div className="top-product-bar" aria-hidden="true">
                      {/* Widths are relative to the day's best seller, so the
                          shape of the day reads at a glance on a small screen
                          without anyone doing division in their head. */}
                      <span style={{ width: `${(p.amount / data.topProducts[0].amount) * 100}%` }} />
                    </div>
                    <div className="top-product-qty">{p.quantity} units</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(data.settlements.overdue.length > 0 || data.visits.missed.length > 0) && (
            <>
              <h2 className="section-title">Needs attention</h2>
              <div className="card alerts">
                {data.settlements.overdue.map((c) => (
                  <div key={c.consignmentNo} className="alert-row alert-warn">
                    <AlertTriangle size={17} strokeWidth={1.9} />
                    <span>
                      <strong>{c.store}</strong> — {c.consignmentNo} unsettled for {c.daysOutstanding}{' '}
                      {c.daysOutstanding === 1 ? 'day' : 'days'}
                    </span>
                  </div>
                ))}
                {data.visits.missed.map((s) => (
                  <div key={s.id} className="alert-row alert-danger">
                    <MapPinOff size={17} strokeWidth={1.9} />
                    <span>
                      <strong>{s.name}</strong> — no visit recorded today
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {company && data.leaderboard.length > 0 && (
            <>
              <h2 className="section-title">Today's leaderboard</h2>
              <div className="card">
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Sales person</th>
                        <th>Sales today</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.leaderboard.map((row, i) => (
                        <tr key={row.userId}>
                          <td>{i + 1}</td>
                          <td className="cell-strong">{row.name}</td>
                          <td>{formatCurrency(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

        </>
      )}

      {wastageOpen && (
        <ShiftWastageModal onClose={() => setWastageOpen(false)} onSaved={setToast} />
      )}
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
