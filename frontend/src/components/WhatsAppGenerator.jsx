import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Check, RefreshCw } from 'lucide-react';
import client from '../api/client';

// Writes a post for the Grillo WhatsApp channel and hands it over ready to
// paste. Whoever is in WHATSAPP_AUTHORS, and only them — the backend enforces
// that on every call, since a page that hides itself is not access control.
//
// `options` comes from GET /whatsapp/options via the page, so the dropdowns are
// built from the generator's own registry rather than a list kept here: a
// content type added to the subproject appears here with no frontend change,
// and this can never offer something the generator does not have.
export default function WhatsAppGenerator({ options }) {
  const [type, setType] = useState(options.today?.type || options.types[0]?.value || '');
  const [slot, setSlot] = useState(options.today?.slot || '');
  const [audience, setAudience] = useState('general');
  const [topic, setTopic] = useState('');

  const [post, setPost] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const outputRef = useRef(null);
  const copiedTimer = useRef(null);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  // The type and meal open on whatever the rota says today is due, so posting
  // daily is one click. Both stay editable — the rota is a suggestion.
  const slotted = options.slottedTypes?.includes(type);

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

  return (
    <div className="card wa-card">
      {options.today && (
        <p className="form-hint wa-today">
          {options.today.day} — usually a{' '}
          <strong>{options.types.find((t) => t.value === options.today.type)?.label}</strong> post.
          {/* Which service is writing. The three differ enough in quality that
              "why does this read badly today" should be answerable here rather
              than by opening a terminal. */}
          {options.provider?.label && ` Written by ${options.provider.label}.`}
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
