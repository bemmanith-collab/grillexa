import React, { useCallback, useEffect, useState } from 'react';
import { Flame, Plus, Trash2, Sparkles, Check } from 'lucide-react';
import client from '../api/client';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { AlertIcon } from '../components/icons';
import { formatDate, todayStr } from '../utils/date';

const AUDIENCES = [
  {
    value: 'STAFF',
    label: 'Sales people',
    hint: 'Shown on My Dashboard when they open the app.',
  },
  {
    value: 'CUSTOMER',
    label: 'Customers',
    hint: 'Printed on the footer of every sale bill, on screen and in the PDF.',
  },
];

const BLANK = { text: '', author: '', audience: 'STAFF', showOn: '' };

export default function WisdomPlanner() {
  const [messages, setMessages] = useState(null);
  const [audience, setAudience] = useState('STAFF');
  const [draft, setDraft] = useState(BLANK);
  const [today, setToday] = useState({});
  const [suggestions, setSuggestions] = useState(null);
  const [suggestError, setSuggestError] = useState('');
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      // Both previews come back with the list so this page can show what is
      // live right now — the whole point of a planner is seeing what today
      // actually says, not what you hope it says.
      const [list, staff, customer] = await Promise.all([
        client.get('/quotes'),
        client.get('/quotes/today', { params: { audience: 'STAFF' } }),
        client.get('/quotes/today', { params: { audience: 'CUSTOMER' } }),
      ]);
      setMessages(list.data.messages);
      setToday({ STAFF: staff.data.message, CUSTOMER: customer.data.message });
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load the planner.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(event) {
    event.preventDefault();
    if (!draft.text.trim()) return;
    setSaving(true);
    try {
      await client.post('/quotes', {
        text: draft.text.trim(),
        author: draft.author.trim() || undefined,
        audience: draft.audience,
        showOn: draft.showOn || undefined,
        source: draft.source,
      });
      setDraft({ ...BLANK, audience: draft.audience });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save that line.');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(message) {
    await client.patch(`/quotes/${message.id}`, { active: !message.active });
    load();
  }

  async function remove(message) {
    await client.delete(`/quotes/${message.id}`);
    load();
  }

  async function fetchSuggestions() {
    setLoadingSuggestions(true);
    setSuggestError('');
    try {
      const res = await client.get('/quotes/suggestions');
      setSuggestions(res.data.suggestions);
    } catch (err) {
      setSuggestError(err.response?.data?.error || 'Could not reach the quote service.');
    } finally {
      setLoadingSuggestions(false);
    }
  }

  // Approving a suggestion drops it into the form rather than straight into
  // the plan: almost every one of them wants a word changed before it is
  // something this business would say to a customer.
  function useSuggestion(suggestion) {
    setDraft({ text: suggestion.text, author: suggestion.author, audience, showOn: '', source: 'WEB' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (error && !messages) return <div className="page"><div className="form-error">{error}</div></div>;
  if (!messages) return <Spinner label="Loading the planner…" />;

  const shown = messages.filter((m) => m.audience === audience);
  const current = AUDIENCES.find((a) => a.value === audience);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Grilling Wisdom Planner</h1>
          <p className="page-subtitle">
            What the business says today — to the people selling, and to the people buying.
          </p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="wisdom-today-grid">
        {AUDIENCES.map((a) => (
          <div key={a.value} className="card wisdom-today">
            <div className="wisdom-today-head">
              <Flame size={16} strokeWidth={2} />
              <span>Today · {a.label}</span>
            </div>
            {today[a.value] ? (
              <>
                <p className="wisdom-quote">&ldquo;{today[a.value].text}&rdquo;</p>
                <p className="wisdom-author">— {today[a.value].author}</p>
              </>
            ) : (
              <p className="form-hint">Nothing active for this audience — nothing will be shown.</p>
            )}
            <p className="form-hint">{a.hint}</p>
          </div>
        ))}
      </div>

      <h2 className="section-title">Add a line</h2>
      <form className="card form-card" onSubmit={save}>
        <label>
          What should it say?
          <textarea
            rows={2}
            value={draft.text}
            maxLength={160}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            placeholder="Lead with the sprouts — more protein than an egg, and cheaper."
            required
          />
          <span className="form-hint">
            {draft.text.length}/160 — a customer line has to fit on one row of a bill.
          </span>
        </label>

        <div className="inline-form">
          <label>
            Audience
            <select
              value={draft.audience}
              onChange={(e) => setDraft({ ...draft, audience: e.target.value })}
            >
              {AUDIENCES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Signed
            <input
              value={draft.author}
              onChange={(e) => setDraft({ ...draft, author: e.target.value })}
              placeholder="The Grillexa Team"
            />
          </label>
          <label>
            On a specific day <span className="form-optional">optional</span>
            <input
              type="date"
              value={draft.showOn}
              min={todayStr()}
              onChange={(e) => setDraft({ ...draft, showOn: e.target.value })}
            />
            <span className="form-hint">Leave empty to join the daily rotation.</span>
          </label>
        </div>

        <button type="submit" className="btn-primary" disabled={saving || !draft.text.trim()}>
          <Plus size={16} /> Add to the plan
        </button>
      </form>

      <h2 className="section-title">The plan</h2>
      <div className="filter-bar">
        <div className="filter-group" role="group" aria-label="Audience">
          {AUDIENCES.map((a) => (
            <button
              key={a.value}
              type="button"
              className={`filter-chip${audience === a.value ? ' active' : ''}`}
              onClick={() => setAudience(a.value)}
            >
              {a.label} ({messages.filter((m) => m.audience === a.value).length})
            </button>
          ))}
        </div>
      </div>
      <p className="chart-hint">{current.hint}</p>

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Message</th>
                <th>Signed</th>
                <th>Day</th>
                <th>Live</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id}>
                  <td className="cell-strong">{m.text}</td>
                  <td className="cell-muted">{m.author}</td>
                  <td>{m.showOn ? formatDate(m.showOn) : <span className="cell-muted">rotation</span>}</td>
                  <td>
                    <button
                      type="button"
                      className={`badge ${m.active ? 'badge-ok' : 'badge-neutral'}`}
                      onClick={() => toggle(m)}
                      title={m.active ? 'Switch off' : 'Switch on'}
                    >
                      {m.active ? 'On' : 'Off'}
                    </button>
                  </td>
                  <td className="actions-cell">
                    <button
                      type="button"
                      className="btn-danger btn-sm"
                      onClick={() => remove(m)}
                      aria-label="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState icon={AlertIcon} message="Nothing planned for this audience yet." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="section-title">Ideas from the web</h2>
      <div className="card">
        <p className="chart-hint">
          Quotes pulled from ZenQuotes and filtered down to the ones about food, health or the body
          — no quote service has a category for this, so the filtering happens here. Nothing goes
          near a bill until you put it in the plan yourself.
        </p>
        <button type="button" className="btn-secondary" onClick={fetchSuggestions} disabled={loadingSuggestions}>
          <Sparkles size={15} /> {loadingSuggestions ? 'Looking…' : 'Suggest some lines'}
        </button>

        {suggestError && <p className="form-warning">{suggestError}</p>}

        {suggestions && suggestions.length === 0 && !suggestError && (
          <p className="form-hint">
            Nothing on topic came back this time. Try again tomorrow, or write your own — they are
            better anyway.
          </p>
        )}

        {suggestions && suggestions.length > 0 && (
          <ul className="suggestion-list">
            {suggestions.map((s) => (
              <li key={s.text}>
                <div>
                  <p className="wisdom-quote">&ldquo;{s.text}&rdquo;</p>
                  <p className="wisdom-author">— {s.author}</p>
                </div>
                <button type="button" className="btn-secondary btn-sm" onClick={() => useSuggestion(s)}>
                  <Check size={14} /> Use
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
