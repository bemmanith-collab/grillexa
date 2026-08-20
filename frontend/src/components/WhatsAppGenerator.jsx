import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Copy, Check, RefreshCw } from 'lucide-react';
import client from '../api/client';

// Writes a post for the Grillo WhatsApp channel and hands it over ready to
// paste. Admin and Manager only — the backend enforces that too, since hiding a
// panel is not access control.
//
// The dropdowns are built from GET /whatsapp/options rather than a list kept
// here, so a content type added to the generator appears in this panel with no
// frontend change and can never be offered but unsupported.
export default function WhatsAppGenerator() {
  const [options, setOptions] = useState(null);
  const [denied, setDenied] = useState(false);
  const [type, setType] = useState('');
  const [audience, setAudience] = useState('general');
  const [slot, setSlot] = useState('');
  const [topic, setTopic] = useState('');

  const [post, setPost] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const outputRef = useRef(null);
  const copiedTimer = useRef(null);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  // Opens on the post today is due, so daily posting is one click. Everything
  // stays editable — the rota is a suggestion, not a schedule.
  useEffect(() => {
    let cancelled = false;
    client
      .get('/whatsapp/options')
      .then((res) => {
        if (cancelled) return;
        setOptions(res.data);
        setType(res.data.today?.type || res.data.types[0]?.value || '');
        setSlot(res.data.today?.slot || '');
      })
      .catch((err) => {
        if (cancelled) return;
        // 403 means this account is not one of the channel's writers, and 503
        // that none are configured yet. Neither is an error for the person
        // looking at the dashboard — the panel simply is not theirs, so it stays
        // invisible rather than showing them a failure they cannot act on.
        // Anything else is a real fault, and hiding that would leave whoever
        // does write the posts staring at a dashboard with no panel and no clue.
        const status = err.response?.status;
        if (status === 403 || status === 503) setDenied(true);
        else setError({ error: 'The content generator is not responding.' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const slotted = options?.slottedTypes?.includes(type);

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await client.post('/whatsapp/generate', {
        type,
        audience,
        topic: topic.trim() || undefined,
        slot: slotted ? slot || undefined : undefined,
      });
      setPost(res.data);
      // A generated post is long; drop the reader at the top of it rather than
      // leaving them wherever the page happened to be.
      requestAnimationFrame(() => outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    } catch (err) {
      setError(err.response?.data || { error: 'Could not generate the post.' });
    } finally {
      setBusy(false);
    }
  }, [type, audience, topic, slot, slotted]);

  // navigator.clipboard needs a secure context, and this app gets opened over a
  // plain-http LAN address during testing — where it is undefined and the copy
  // silently does nothing. The textarea fallback is what makes the button work
  // there, which is exactly where it gets tried first.
  const copy = useCallback(async () => {
    if (!post?.text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(post.text);
      } else {
        const scratch = document.createElement('textarea');
        scratch.value = post.text;
        scratch.setAttribute('readonly', '');
        scratch.style.position = 'fixed';
        scratch.style.opacity = '0';
        document.body.appendChild(scratch);
        scratch.select();
        document.execCommand('copy');
        document.body.removeChild(scratch);
      }
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setError({
        error: 'Could not copy automatically.',
        hint: 'Select the text above and copy it by hand.',
      });
    }
  }, [post]);

  // Not one of the channel's writers: the panel does not exist for them.
  if (denied) return null;

  // Still loading, or loaded but broken — say so rather than vanishing, since
  // this only reaches someone who is supposed to have the panel.
  if (!options) {
    return error ? (
      <div className="card wa-card">
        <div className="wa-header">
          <MessageCircle size={18} strokeWidth={1.8} />
          <h3 className="card-title">WhatsApp Content Generator</h3>
        </div>
        <div className="form-error">{error.error}</div>
      </div>
    ) : null;
  }

  return (
    <div className="card wa-card">
      <div className="wa-header">
        <MessageCircle size={18} strokeWidth={1.8} />
        <h3 className="card-title">WhatsApp Content Generator</h3>
      </div>

      {options.today && (
        <p className="form-hint wa-today">
          {options.today.day} — usually a{' '}
          <strong>{options.types.find((t) => t.value === options.today.type)?.label}</strong> post.
        </p>
      )}

      <div className="wa-controls">
        <label>
          Content type
          <select value={type} onChange={(e) => setType(e.target.value)} disabled={busy}>
            {options.types.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>

        <label>
          Audience
          <select value={audience} onChange={(e) => setAudience(e.target.value)} disabled={busy}>
            {options.audiences.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </label>

        {slotted && (
          <label>
            Meal
            <select value={slot} onChange={(e) => setSlot(e.target.value)} disabled={busy}>
              <option value="">Whatever suits the time</option>
              {options.slots.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
        )}

        <label className="wa-topic">
          Topic <span className="form-optional">optional</span>
          <input
            type="text"
            value={topic}
            maxLength={300}
            placeholder="eating after 8 PM"
            onChange={(e) => setTopic(e.target.value)}
            disabled={busy}
          />
        </label>
      </div>

      <div className="wa-actions">
        <button type="button" className="btn-primary" onClick={generate} disabled={busy || !type}>
          <RefreshCw size={15} className={busy ? 'icon-spin' : undefined} />
          {busy ? 'Writing…' : post ? 'Generate again' : 'Generate'}
        </button>
        {busy && <span className="form-hint">Takes a few seconds.</span>}
      </div>

      {error && (
        <div className="form-error">
          {error.error}
          {error.hint && <div className="form-hint">{error.hint}</div>}
        </div>
      )}

      {post && (
        <div className="wa-output" ref={outputRef}>
          <div className="wa-output-bar">
            <span className="form-hint">
              {post.meta.day}
              {post.meta.ingredient && ` · built around ${post.meta.ingredient}`}
              {post.meta.quoteLanguage === 'telugu' && ' · Telugu sign-off'}
            </span>
            <button type="button" className="btn-secondary btn-sm" onClick={copy}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          {/* Rendered as-is in a pre: emoji, blank lines and the — dividers are
              the format, so anything that reflows the text changes the post. */}
          <pre className="wa-post">{post.text}</pre>
        </div>
      )}
    </div>
  );
}
