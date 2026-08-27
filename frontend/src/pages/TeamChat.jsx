import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Users, Pin, PinOff, Trash2, ShieldCheck } from 'lucide-react';
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
              <div className={`chat-msg${m.mine ? ' mine' : ''}${m.deleted ? ' gone' : ''}`}>
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
                  {timeOf(m.createdAt)}
                </span>
                {moderator && !m.deleted && !m.isSystem && (
                  <span className="chat-actions">
                    <button type="button" className="chat-icon-btn" onClick={() => togglePin(m)}
                      aria-label={m.isPinned ? 'Unpin' : 'Pin'} title={m.isPinned ? 'Unpin' : 'Pin'}>
                      {m.isPinned ? <PinOff size={13} /> : <Pin size={13} />}
                    </button>
                    <button type="button" className="chat-icon-btn danger" onClick={() => remove(m.id)}
                      aria-label="Delete" title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </span>
                )}
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
    </div>
  );
}
