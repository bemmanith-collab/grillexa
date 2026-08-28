import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, X, Send, Maximize2 } from 'lucide-react';
import client from '../api/client';
import { useTeamChatUnread, clearUnread, refreshUnread } from '../lib/teamChatUnread';

// The chat, reachable from the dashboard without leaving it.
//
// Draggable on purpose. A launcher welded to the bottom-right corner eventually
// sits on top of the one control somebody needs — and this dashboard puts cards
// and buttons exactly there. It snaps to the nearer side on release rather than
// staying wherever it was dropped, so it can never be left over the middle of
// the screen.
//
// Rendered only on "/" (see App.jsx). Everywhere else the chat is the sidebar
// entry and its own page.

const SIZE = 56;
const PAD = 16;
// Movement under this is a tap. Without a threshold, every attempt to move the
// bubble opens the panel instead.
const TAP_SLOP = 6;
const POLL_MS = 5000;
const STORE_KEY = 'grillexa-chat-bubble';

const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function TeamChatBubble() {
  const navigate = useNavigate();
  const { unread, isMember } = useTeamChatUnread();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const fabRef = useRef(null);
  const bodyRef = useRef(null);
  const lastId = useRef(0);
  const drag = useRef({ on: false, moved: 0, offX: 0, offY: 0 });

  // --- position ------------------------------------------------------------
  const clamp = useCallback((x, y) => ({
    x: Math.min(Math.max(x, PAD), window.innerWidth - SIZE - PAD),
    y: Math.min(Math.max(y, PAD), window.innerHeight - SIZE - PAD),
  }), []);

  const place = useCallback((x, y, animate) => {
    const el = fabRef.current;
    if (!el) return null;
    const at = clamp(x, y);
    el.classList.toggle('snapping', Boolean(animate));
    el.style.left = `${at.x}px`;
    el.style.top = `${at.y}px`;
    return at;
  }, [clamp]);

  // Restore where this person left it, or start bottom-right.
  useEffect(() => {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { /* private window */ }
    place(
      saved ? saved.x : window.innerWidth - SIZE - PAD,
      saved ? saved.y : window.innerHeight - SIZE - PAD - 56,
      false
    );
  }, [place]);

  // A resized window — or a phone rotating — can leave it off screen.
  useEffect(() => {
    const onResize = () => {
      const el = fabRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      place(r.left, r.top, false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [place]);

  // While the panel is open: freeze the page behind it, and keep the panel's
  // height matched to the part of the screen that is actually visible.
  //
  // On iOS the on-screen keyboard shrinks the visual viewport but not the
  // layout viewport, so a full-height fixed panel keeps its size and pushes the
  // compose field down behind the keyboard. visualViewport is the only thing
  // that reports the real number.
  useEffect(() => {
    if (!open) return undefined;

    const doc = document.documentElement;
    // Pin the body at its current offset. Restoring it on close is the whole
    // reason the offset is recorded — without that the page jumps to the top
    // the moment the chat closes.
    const scrollY = window.scrollY;
    document.body.style.top = `${-scrollY}px`;
    document.body.classList.add('chat-open');

    const vv = window.visualViewport;
    const sync = () => {
      doc.style.setProperty('--chat-vh', `${vv ? vv.height : window.innerHeight}px`);
    };
    sync();
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);

    return () => {
      document.body.classList.remove('chat-open');
      document.body.style.top = '';
      window.scrollTo(0, scrollY);
      doc.style.removeProperty('--chat-vh');
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
    };
  }, [open]);

  // --- messages ------------------------------------------------------------
  const load = useCallback(async (incremental) => {
    try {
      const after = incremental ? lastId.current : undefined;
      const res = await client.get('/team-chat', { params: after ? { after, limit: 30 } : { limit: 30 } });
      const incoming = res.data.messages;
      if (incoming.length) lastId.current = incoming[incoming.length - 1].id;
      setMessages((prev) => {
        if (!incremental || prev === null) return incoming;
        if (!incoming.length) return prev;
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...incoming.filter((m) => !seen.has(m.id))];
      });
      client.post('/team-chat/read').then(clearUnread).catch(() => {});
    } catch {
      // Silent. The dashboard behind this is the point of the screen; a chat
      // that cannot load must not put an error banner over it.
      if (!incremental) setMessages([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    load(false);
    const tick = () => { if (document.visibilityState === 'visible') load(true); };
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  const send = useCallback(async (e) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await client.post('/team-chat', { body: text });
      setDraft('');
      setMessages((prev) => {
        const msg = res.data.message;
        lastId.current = Math.max(lastId.current, msg.id);
        return (prev ?? []).some((m) => m.id === msg.id) ? prev : [...(prev ?? []), msg];
      });
      refreshUnread();
    } catch {
      /* the draft is still in the box; the person can press send again */
    } finally {
      setSending(false);
    }
  }, [draft, sending]);

  // --- drag ----------------------------------------------------------------
  const onPointerDown = (e) => {
    const el = fabRef.current;
    // Capture, so the drag survives the finger sliding off the bubble — without
    // it the first fast flick drops it.
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    drag.current = { on: true, moved: 0, offX: e.clientX - r.left, offY: e.clientY - r.top };
    el.classList.add('dragging');
    el.classList.remove('snapping');
  };

  const onPointerMove = (e) => {
    if (!drag.current.on) return;
    drag.current.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    place(e.clientX - drag.current.offX, e.clientY - drag.current.offY, false);
  };

  const onPointerUp = () => {
    if (!drag.current.on) return;
    drag.current.on = false;
    const el = fabRef.current;
    el.classList.remove('dragging');

    if (drag.current.moved < TAP_SLOP) {
      setOpen((v) => !v);
      return;
    }
    // Snap to the nearer side. This is the rule that stops it being left over a
    // form, and it is why the bubble is safe to make draggable at all.
    const r = el.getBoundingClientRect();
    const left = r.left + SIZE / 2 < window.innerWidth / 2;
    const at = place(left ? PAD : window.innerWidth - SIZE - PAD, r.top, true);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(at)); } catch { /* private window */ }
  };

  // Somebody an admin has removed has no room to open.
  if (!isMember) return null;

  return (
    <>
      <button
        type="button"
        ref={fabRef}
        className="chat-fab"
        aria-label={unread > 0 ? `Team chat, ${unread} unread` : 'Team chat'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <MessageCircle size={24} strokeWidth={1.9} />
        {unread > 0 && !open && (
          <span className="chat-fab-count">{unread > 99 ? '99+' : unread}</span>
        )}
      </button>

      {open && (
        <div className="chat-pop" role="dialog" aria-label="Team chat">
          <div className="chat-pop-head">
            <span>
              <strong>Team Chat</strong>
              <small>Everyone at Grillexa</small>
            </span>
            <span className="chat-pop-acts">
              <button
                type="button"
                onClick={() => { setOpen(false); navigate('/team-chat'); }}
                aria-label="Open the full chat"
                title="Open full chat"
              >
                <Maximize2 size={15} />
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </span>
          </div>

          <div className="chat-pop-body" ref={bodyRef}>
            {messages === null && <p className="chat-pop-note">Loading…</p>}
            {messages?.length === 0 && <p className="chat-pop-note">No messages yet.</p>}
            {messages?.map((m) => (
              m.isSystem ? (
                <div className="chat-pop-system" key={m.id}>
                  <pre>{m.body}</pre>
                </div>
              ) : (
                <div className={`chat-pop-msg${m.mine ? ' mine' : ''}${m.deleted ? ' gone' : ''}`} key={m.id}>
                  {!m.mine && !m.deleted && <span className="who">{m.senderName}</span>}
                  <span className="txt">
                    {m.deleted ? 'This message was deleted.' : m.body}
                  </span>
                  <span className="tm">{timeOf(m.createdAt)}</span>
                </div>
              )
            ))}
          </div>

          <form className="chat-pop-foot" onSubmit={send}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message the team…"
              aria-label="Message"
              maxLength={4000}
            />
            <button type="submit" disabled={sending || !draft.trim()} aria-label="Send">
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
