import { useEffect, useState } from 'react';
import client from '../api/client';

// Who may write for the WhatsApp channel is decided by WHATSAPP_AUTHORS on the
// server, which the browser cannot see — so the only way to know whether to show
// the nav entry is to ask. GET /whatsapp/options answers with the content types
// for someone allowed, 403 for an Admin who is not on the list, and 503 when
// nobody is configured yet.
//
// The request is made once per page load and shared: the sidebar asks on every
// screen and the page asks again when it opens, and one answer serves both.

let pending;

export function loadChannelOptions() {
  pending ??= client
    .get('/whatsapp/options')
    .then((res) => ({ state: 'allowed', options: res.data }))
    .catch((err) => {
      const status = err.response?.status;
      if (status === 403 || status === 503) return { state: 'denied', options: null };
      // A real fault is not cached — a backend that was restarting should not
      // hide the section for the rest of the session.
      pending = undefined;
      return { state: 'error', options: null };
    });
  return pending;
}

/**
 * { state: 'loading' | 'allowed' | 'denied' | 'error', options }
 *
 * `enabled: false` skips the request and answers 'denied' straight away. The
 * sidebar renders on every screen, and a Sales account can never be on the
 * allowlist — asking anyway would put a request that is certain to be refused on
 * every page load, for most of the staff.
 */
export function useChannelAccess({ enabled = true } = {}) {
  const [result, setResult] = useState(
    enabled ? { state: 'loading', options: null } : { state: 'denied', options: null }
  );

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    loadChannelOptions().then((next) => {
      if (!cancelled) setResult(next);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return result;
}
