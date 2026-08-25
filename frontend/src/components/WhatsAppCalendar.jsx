import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, RefreshCw, Send, ChevronDown } from 'lucide-react';
import client from '../api/client';
import Spinner from './Spinner';

// The 30-day plan, thirty rows of three. Seeded from
// whatsapp/strategy/30-day.json — nothing here invents content, it only shows
// what the seed put there and hands a cell to the generator when asked.
//
// The whole grid arrives in one request, generated posts included, so opening a
// cell is instant and the month can be read end to end without the page filling
// in around you.

const SLOT_LABELS = {
  morning: { label: 'Morning', time: '7:30 AM', brief: 'Habit & Energy' },
  afternoon: { label: 'Afternoon', time: '1:00 PM', brief: 'Food & Productivity' },
  night: { label: 'Night', time: '8:30 PM', brief: 'Community & Mission' },
};

// Week 1 is days 1-7 and so on. Days 29 and 30 fall in week 4 with the rest of
// the tail, which is what the strategy file does too.
const weekOf = (day) => Math.min(4, Math.ceil(day / 7));

export default function WhatsAppCalendar() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [cellError, setCellError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [filter, setFilter] = useState('all');

  const copiedTimer = useRef(null);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const load = useCallback(() => {
    client.get('/whatsapp/calendar')
      .then((res) => setData(res.data))
      .catch(() => setError('Could not load the calendar.'));
  }, []);

  useEffect(load, [load]);

  // One cell changed; patch it in place rather than refetching ninety rows to
  // learn one boolean.
  const replaceCell = useCallback((id, patch) => {
    setData((prev) => {
      if (!prev) return prev;
      const cells = prev.cells.map((c) => (c.id === id ? { ...c, ...patch } : c));
      return {
        ...prev,
        cells,
        summary: {
          total: cells.length,
          sent: cells.filter((c) => c.sent).length,
          generated: cells.filter((c) => c.fullPost).length,
        },
      };
    });
  }, []);

  const generate = useCallback(async (cell) => {
    setBusyId(cell.id);
    setCellError(null);
    try {
      const res = await client.post(`/whatsapp/calendar/${cell.id}/generate`);
      replaceCell(cell.id, { fullPost: res.data.fullPost });
      setOpenId(cell.id);
    } catch (err) {
      setCellError({ id: cell.id, ...(err.response?.data || { error: 'Could not write that post.' }) });
    } finally {
      setBusyId(null);
    }
  }, [replaceCell]);

  const toggleSent = useCallback(async (cell) => {
    const sent = !cell.sent;
    // Moved straight away — a tick that waits for the network feels broken, and
    // it is put back below if the request is refused.
    replaceCell(cell.id, { sent, sentAt: sent ? new Date().toISOString() : null });
    try {
      const res = await client.patch(`/whatsapp/calendar/${cell.id}`, { sent });
      replaceCell(cell.id, { sent: res.data.sent, sentAt: res.data.sentAt });
    } catch {
      replaceCell(cell.id, { sent: cell.sent, sentAt: cell.sentAt });
      setCellError({ id: cell.id, error: 'Could not save that.' });
    }
  }, [replaceCell]);

  const copy = useCallback(async (cell) => {
    const text = cell.fullPost || cell.draft;
    if (!text) return;
    try {
      // Same fallback as the generator panel: navigator.clipboard is undefined
      // over plain http, which is exactly how this gets opened on a phone on the
      // office LAN.
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const box = document.createElement('textarea');
        box.value = text;
        box.style.position = 'fixed';
        box.style.opacity = '0';
        document.body.appendChild(box);
        box.select();
        document.execCommand('copy');
        document.body.removeChild(box);
      }
      setCopiedId(cell.id);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* the text is on screen and selectable; a failed copy is not worth an alert */
    }
  }, []);

  const days = useMemo(() => {
    if (!data) return [];
    const byDay = new Map();
    for (const cell of data.cells) {
      if (!byDay.has(cell.day)) byDay.set(cell.day, {});
      byDay.get(cell.day)[cell.timeSlot] = cell;
    }
    return [...byDay.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([day, posts]) => ({ day, posts }));
  }, [data]);

  const visible = useCallback((cell) => {
    if (!cell) return false;
    if (filter === 'unsent') return !cell.sent;
    if (filter === 'ungenerated') return !cell.fullPost;
    return true;
  }, [filter]);

  if (error) return <div className="card"><div className="form-error">{error}</div></div>;
  if (!data) return <Spinner />;

  const { summary } = data;

  return (
    <div className="card wa-calendar">
      <div className="wa-cal-head">
        <div>
          <strong>{summary.sent}</strong> of {summary.total} posted
          <span className="form-hint"> · {summary.generated} written in full</span>
        </div>
        <div className="wa-cal-filters">
          {[
            ['all', 'All'],
            ['unsent', 'Not yet posted'],
            ['ungenerated', 'Not yet written'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`btn-secondary btn-sm${filter === value ? ' is-active' : ''}`}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="wa-cal-legend">
        {Object.entries(SLOT_LABELS).map(([slot, meta]) => (
          <span key={slot}>
            <strong>{meta.label}</strong> {meta.time} — {meta.brief}
          </span>
        ))}
      </div>

      {days.map(({ day, posts }) => {
        const row = Object.values(SLOT_LABELS).length;
        const anyVisible = Object.keys(SLOT_LABELS).some((slot) => visible(posts[slot]));
        if (!anyVisible) return null;

        return (
          <section key={day} className="wa-cal-day">
            <h3 className="wa-cal-daynum">
              Day {day}
              <span className="form-hint"> · week {weekOf(day)}</span>
            </h3>

            <div className="wa-cal-row" style={{ '--slots': row }}>
              {Object.keys(SLOT_LABELS).map((slot) => {
                const cell = posts[slot];
                if (!cell) return <div key={slot} className="wa-cell wa-cell-empty" />;
                if (!visible(cell)) return <div key={slot} className="wa-cell wa-cell-empty" />;

                const open = openId === cell.id;
                const busy = busyId === cell.id;
                const err = cellError?.id === cell.id ? cellError : null;

                return (
                  <article key={slot} className={`wa-cell${cell.sent ? ' is-sent' : ''}`}>
                    <header className="wa-cell-head">
                      <span className="wa-cell-slot">
                        {SLOT_LABELS[slot].label}
                        <span className="form-hint"> {SLOT_LABELS[slot].time}</span>
                      </span>
                      <label className="wa-cell-sent" title="Mark this one as posted">
                        <input
                          type="checkbox"
                          checked={cell.sent}
                          onChange={() => toggleSent(cell)}
                        />
                        <span>{cell.sent ? 'Posted' : 'Post'}</span>
                      </label>
                    </header>

                    <h4 className="wa-cell-theme">{cell.theme}</h4>

                    {cell.engagementQuestion && (
                      <p className="wa-cell-q">💬 {cell.engagementQuestion}</p>
                    )}
                    {cell.imageIdea && (
                      <p className="wa-cell-img">📷 {cell.imageIdea}</p>
                    )}

                    <div className="wa-cell-actions">
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        onClick={() => generate(cell)}
                        disabled={busy}
                      >
                        <RefreshCw size={13} className={busy ? 'icon-spin' : undefined} />
                        {busy ? 'Writing…' : cell.fullPost ? 'Write again' : 'Generate Full Post'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => setOpenId(open ? null : cell.id)}
                      >
                        <ChevronDown size={13} className={open ? 'wa-cell-chev-open' : undefined} />
                        {open ? 'Hide' : cell.fullPost ? 'Read post' : 'Draft'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => copy(cell)}
                        title={cell.fullPost ? 'Copy the full post' : 'Copy the draft'}
                      >
                        {copiedId === cell.id ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </div>

                    {err && (
                      <div className="form-error">
                        {err.error}
                        {err.hint && <div className="form-hint">{err.hint}</div>}
                      </div>
                    )}

                    {open && (
                      <div className="wa-cell-body">
                        {/* pre, not a paragraph: the blank lines and emoji
                            markers are the post format, so anything that
                            reflows the text changes what gets posted. */}
                        <pre className="wa-post">{cell.fullPost || cell.draft}</pre>
                        {!cell.fullPost && (
                          <p className="form-hint">
                            This is the seeded draft. Press Generate Full Post to write it out
                            in the channel's voice.
                          </p>
                        )}
                        {cell.sentAt && (
                          <p className="form-hint">
                            <Send size={12} /> Posted {new Date(cell.sentAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
