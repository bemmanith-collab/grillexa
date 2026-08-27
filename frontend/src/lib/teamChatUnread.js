import { useEffect, useState } from 'react';
import client from '../api/client';

// The unread count behind the sidebar badge.
//
// The sidebar renders on every screen, so this is one shared poll rather than a
// request per mounted component: subscribers share a single timer and a single
// answer. Two tabs open still means two polls, which is fine — this is about
// not firing five from one page.
//
// It deliberately asks a route that returns only a number. Polling the room
// itself would drag every message body along with it, from every page in the
// app, forever.

const INTERVAL = 60000;

let count = 0;
let isMember = true;
let timer = null;
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn({ unread: count, isMember });
}

async function fetchNow() {
  // Nothing to poll for while the tab is in the background — and on a phone
  // this is most of the day. The visibility listener below catches up the
  // moment it comes forward, so the badge is never stale when it is looked at.
  if (document.visibilityState !== 'visible') return;
  try {
    const res = await client.get('/team-chat/unread');
    count = res.data.unread ?? 0;
    isMember = res.data.member !== false;
    emit();
  } catch {
    // A failed poll leaves the last known number on screen. A badge that
    // blanks itself on every hiccup is worse than one that is a minute old.
  }
}

function start() {
  if (timer) return;
  fetchNow();
  timer = setInterval(fetchNow, INTERVAL);
  document.addEventListener('visibilitychange', fetchNow);
}

function stop() {
  clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', fetchNow);
}

/** Called by the chat page when it marks the room read, so the badge clears at
 *  once rather than at the next poll — a badge that lingers after you have read
 *  everything is the fastest way to teach people to ignore it. */
export function clearUnread() {
  count = 0;
  emit();
}

/** Called after sending, so the count stays honest without a round trip. */
export function refreshUnread() {
  fetchNow();
}

export function useTeamChatUnread() {
  const [state, setState] = useState({ unread: count, isMember });

  useEffect(() => {
    listeners.add(setState);
    start();
    return () => {
      listeners.delete(setState);
      if (listeners.size === 0) stop();
    };
  }, []);

  return state;
}
