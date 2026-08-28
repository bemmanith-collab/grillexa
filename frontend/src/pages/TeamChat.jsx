import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Users, Pin, PinOff, Trash2, ShieldCheck, Pencil } from 'lucide-react';
import client from '../api/client';
import Spinner from '../components/Spinner';
import TeamChatMembers from '../components/TeamChatMembers';
import { clearUnread, refreshUnread } from '../lib/teamChatUnread';

// One room, the whole staff in it. A WhatsApp group, not a support desk.
//
// Polled, not socketed. Fly runs more than one machine and auto_start_machines
// is on, so a socket opened against one of them would never see a message
// posted to the other — the same reason the WhatsApp reminder claims its day
// through a unique constraint rather than a flag in memory. Every few seconds
// with "anything after id N" is a cheap indexed lookup, and web push covers the
// case where the app is not open at all.
const POLL_MS = 5000;

const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dayOf = (iso) => new Date(iso).toDateString();

export default function TeamChat() {
  const [messages, setMessages] = useState(null);
  const [pinned, setPinned] = useState([]);
  const [moderator, setModerator] = useState(false);
  const [me, setMe] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [showMembers, setShowMembers] = useState(false);
  // The message whose action sheet is open, and the one being edited.
  const [sheetFor, setSheetFor] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editDraft, setEditDraft] = useState('');

  const threadRef = useRef(null);
  const lastId = useRef(0);
  // Only stick to the bottom if the reader is already there. Yanking somebody
  // back down while they are reading yesterday's messages is the thing that
  // makes a chat unusable.
  const pinnedToBottom = useRef(true);

  const scrollToBottom = useCallback((smooth) => {
    const el = threadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const load = useCallback(async ({ incremental } = {}) => {
    try {
      const after = incremental ? lastId.current : undefined;
      const res = await client.get('/team-chat', { params: after ? { after } : {} });
      setModerator(res.data.moderator);
      setMe(res.data.me);
      setPinned(res.data.pinned);
      setError(null);

      const incoming = res.data.messages;
      if (incoming.length) lastId.current = incoming[incoming.length - 1].id;

      setMessages((prev) => {
        if (!incremental || prev === null) return incoming;
        if (!incoming.length) return prev;
        // A poll can overlap a send, so the same message can arrive twice.
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...incoming.filter((m) => !seen.has(m.id))];
      });
    } catch (err) {
      if (err.response?.status === 403) {
        setError(err.response.data);
        setMessages([]);
      } else if (!incremental) {
        setError({ error: 'Could not open the chat.' });
      }
      // A failed background poll is left silent — the thread on screen is still
      // good, and an error banner every time the signal drops is noise.
    }
  }, []);

  // Opening the room marks it read.
  const markRead = useCallback(() => {
    client.post('/team-chat/read').then(clearUnread).catch(() => {});
  }, []);

  useEffect(() => {
    load().then(() => {
      scrollToBottom(false);
      markRead();
    });
  }, [load, scrollToBottom, markRead]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      load({ incremental: true }).then(markRead);
    };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load, markRead]);

  useEffect(() => {
    if (pinnedToBottom.current) scrollToBottom(true);
  }, [messages, scrollToBottom]);

  const onScroll = () => {
    const el = threadRef.current;
    if (!el) return;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const send = useCallback(async (e) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await client.post('/team-chat', { body: text });
      setDraft('');
      pinnedToBottom.current = true;
      setMessages((prev) => {
        const msg = res.data.message;
        lastId.current = Math.max(lastId.current, msg.id);
        return (prev ?? []).some((m) => m.id === msg.id) ? prev : [...(prev ?? []), msg];
      });
      refreshUnread();
    } catch (err) {
      setError(err.response?.data || { error: 'Could not send that.' });
    } finally {
      setSending(false);
    }
  }, [draft, sending]);

  // Enter sends, Shift+Enter makes a new line — what everyone expects from a
  // chat box. On a phone the on-screen keyboard has its own return key, so the
  // send button stays visible regardless.
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const remove = useCallback(async (id) => {
    try {
      await client.delete(`/team-chat/${id}`);
      setMessages((prev) => prev.map((m) => (m.id === id
        ? { ...m, deleted: true, body: null, isPinned: false, deletedBy: me?.name ?? null }
        : m)));
      setPinned((prev) => prev.filter((m) => m.id !== id));
    } catch {
      setError({ error: 'Could not delete that message.' });
    }
  }, [me]);

  // --- hold to act --------------------------------------------------------
  // 450ms matches what a phone user already expects from a chat app. Any
  // movement cancels it, so scrolling the thread never opens the sheet.
  const HOLD_MS = 450;
  const holdTimer = useRef(null);
  const holdFrom = useRef(null);

  const hasActions = useCallback(
    (m) => !m.deleted && !m.isSystem && (m.canDelete || m.canPin || m.canEdit),
    []
  );

  const holdStart = useCallback((e, m) => {
    if (!hasActions(m)) return;
    holdFrom.current = { x: e.clientX, y: e.clientY };
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => setSheetFor(m), HOLD_MS);
  }, [hasActions]);

  const holdEnd = useCallback(() => {
    clearTimeout(holdTimer.current);
    holdFrom.current = null;
  }, []);

  // A drag is a scroll, not a hold.
  useEffect(() => {
    const onMove = (e) => {
      const from = holdFrom.current;
      if (!from) return;
      if (Math.abs(e.clientX - from.x) + Math.abs(e.clientY - from.y) > 10) holdEnd();
    };
    document.addEventListener('pointermove', onMove);
    return () => document.removeEventListener('pointermove', onMove);
  }, [holdEnd]);

  useEffect(() => () => clearTimeout(holdTimer.current), []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setSheetFor(null);
      setEditing(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const saveEdit = useCallback(async () => {
    const text = editDraft.trim();
    const target = editing;
    if (!text || !target) return;
    if (text === target.body) { setEditing(null); return; }
    try {
      const res = await client.patch(`/team-chat/${target.id}`, { body: text });
      const updated = res.data.message;
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
      setPinned((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
      setEditing(null);
    } catch (err) {
      setError(err.response?.data || { error: 'Could not save that edit.' });
    }
  }, [editDraft, editing]);

  const togglePin = useCallback(async (msg) => {
    try {
      const res = await client.post(`/team-chat/${msg.id}/pin`, { isPinned: !msg.isPinned });
      const updated = res.data.message;
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, isPinned: updated.isPinned } : m)));
      setPinned((prev) => (updated.isPinned
        ? [updated, ...prev.filter((m) => m.id !== updated.id)]
        : prev.filter((m) => m.id !== updated.id)));
    } catch {
      setError({ error: 'Could not pin that message.' });
    }
  }, []);

  if (messages === null) return <Spinner label="Opening the chat…" />;

  // Removed from the room, or never added.
  if (error && !messages.length && error.hint) {
    return (
      <div className="page">
        <div className="page-header"><div><h1>Team Chat</h1></div></div>
        <div className="card">
          <div className="form-error">
            {error.error}
            <div className="form-hint">{error.hint}</div>
          </div>
        </div>
      </div>
    );
  }

  let lastDay = null;

  return (
    <div className="page chat-page">
      <div className="page-header">
        <div>
          <h1>Team Chat</h1>
          <p className="page-subtitle">
            Everyone at Grillexa is in here.
            {moderator && <> You can pin, delete and manage members.</>}
          </p>
        </div>
        <div className="page-header-actions">
          <button type="button" className="btn-secondary btn-sm" onClick={() => setShowMembers(true)}>
            <Users size={15} /> Members
          </button>
        </div>
      </div>

      {pinned.length > 0 && (
        <div className="chat-pinned">
          {pinned.map((m) => (
            <div className="chat-pinned-row" key={m.id}>
              <Pin size={14} strokeWidth={2} />
              <span><strong>{m.senderName}</strong> {m.body}</span>
              {moderator && !m.isSystem && (
                <button
                  type="button"
                  className="chat-icon-btn"
                  onClick={() => togglePin(m)}
                  aria-label="Unpin this message"
                  title="Unpin"
                >
                  <PinOff size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="chat-thread" ref={threadRef} onScroll={onScroll}>
        {messages.length === 0 && (
          <p className="chat-empty">No messages yet. Say something.</p>
        )}
        {messages.map((m) => {
          const day = dayOf(m.createdAt);
          const newDay = day !== lastDay;
          lastDay = day;
          return (
            <React.Fragment key={m.id}>
              {newDay && <div className="chat-day">{day}</div>}
              {m.isSystem ? (
                <div className="chat-system">
                  <pre>{m.body}</pre>
                  <span className="chat-system-foot">{timeOf(m.createdAt)}</span>
                </div>
              ) : (
              <div
                className={`chat-msg${m.mine ? ' mine' : ''}${m.deleted ? ' gone' : ''}${sheetFor?.id === m.id ? ' held' : ''}`}
                // Hold to open the actions, the way every chat app does. A row
                // of buttons on every message turned the thread into a wall of
                // icons on a phone, where hover does not exist to hide them.
                onPointerDown={(e) => holdStart(e, m)}
                onPointerUp={holdEnd}
                onPointerLeave={holdEnd}
                onPointerCancel={holdEnd}
                // Long-press on iOS otherwise raises the system text-selection
                // menu on top of ours.
                onContextMenu={(e) => { if (hasActions(m)) e.preventDefault(); }}
                {...(hasActions(m) ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-haspopup': 'menu',
                  // Hold is unreachable from a keyboard, so Enter opens the
                  // same sheet.
                  onKeyDown: (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSheetFor(m); }
                  },
                } : {})}
              >
                {!m.mine && !m.deleted && (
                  <span className="chat-sender">
                    {m.senderName}
                    {m.senderRole === 'ADMIN' && (
                      <ShieldCheck size={12} aria-label="Admin" className="chat-badge-admin" />
                    )}
                  </span>
                )}
                {m.deleted ? (
                  <span className="chat-body">
                    This message was deleted{m.deletedBy ? ` by ${m.deletedBy}` : ''}.
                  </span>
                ) : (
                  <span className="chat-body">{m.body}</span>
                )}
                <span className="chat-meta">
                  {m.isPinned && !m.deleted && <Pin size={11} />}
                  {m.edited && !m.deleted && <span className="chat-edited">edited</span>}
                  {timeOf(m.createdAt)}
                </span>
              </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {error && !error.hint && <div className="form-error chat-error">{error.error}</div>}

      <form className="chat-compose" onSubmit={send}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message the team…"
          rows={1}
          maxLength={4000}
          aria-label="Message"
        />
        <button type="submit" className="btn-primary chat-send" disabled={sending || !draft.trim()}>
          <Send size={16} />
          <span className="sr-only">Send</span>
        </button>
      </form>

      {showMembers && (
        <TeamChatMembers moderator={moderator} onClose={() => setShowMembers(false)} />
      )}

      {/* Held-message actions. A sheet rather than buttons on every row: the
          thread stays readable, and each action gets a full-width tap target
          instead of a 26px icon. */}
      {sheetFor && (
        <div
          className="msg-sheet-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setSheetFor(null); }}
        >
          <div className="msg-sheet" role="menu" aria-label="Message actions">
            <p className="msg-sheet-preview">{sheetFor.body}</p>
            {sheetFor.canEdit && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { setEditing(sheetFor); setEditDraft(sheetFor.body); setSheetFor(null); }}
              >
                <Pencil size={17} /> Edit
              </button>
            )}
            {sheetFor.canPin && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { togglePin(sheetFor); setSheetFor(null); }}
              >
                {sheetFor.isPinned ? <PinOff size={17} /> : <Pin size={17} />}
                {sheetFor.isPinned ? 'Unpin' : 'Pin'}
              </button>
            )}
            {sheetFor.canDelete && (
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => { remove(sheetFor.id); setSheetFor(null); }}
              >
                <Trash2 size={17} /> Delete
              </button>
            )}
            <button type="button" className="msg-sheet-cancel" onClick={() => setSheetFor(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {editing && (
        <div
          className="msg-sheet-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}
        >
          <div className="msg-edit" role="dialog" aria-modal="true" aria-label="Edit message">
            <h2>Edit message</h2>
            <textarea
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                if (e.key === 'Escape') setEditing(null);
              }}
              rows={3}
              maxLength={4000}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              aria-label="Message text"
            />
            <p className="form-hint">Everyone will see this was edited.</p>
            <div className="msg-edit-actions">
              <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={saveEdit}
                disabled={!editDraft.trim() || editDraft.trim() === editing.body}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
