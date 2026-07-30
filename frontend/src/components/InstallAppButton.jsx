import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

// Chrome's own "Install app" entry is buried in the browser's ⋮ menu, which
// is easy to miss and moves between Chrome versions. Chrome fires
// beforeinstallprompt when it considers the site installable; capturing it
// lets the app offer the install itself, from a button people can actually
// find.
//
// Renders nothing when there's nothing to offer: already installed, or a
// browser that doesn't support this (iOS Safari, where the route is
// Share → Add to Home Screen).
// iPadOS reports itself as MacIntel, so the touch-point check is what catches
// an iPad rather than a Mac.
function isIos() {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export default function InstallAppButton({ className = 'btn-secondary' }) {
  // Seeded from the event index.html already caught — by the time React
  // mounts, Chrome has usually fired it and moved on.
  const [prompt, setPrompt] = useState(() => (typeof window === 'undefined' ? null : window.__installPrompt));
  const [installed, setInstalled] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches
  );

  useEffect(() => {
    // installpromptready covers the event arriving after mount; the raw event
    // is still listened for in case this ever runs without the head script.
    function onReady() {
      setPrompt(window.__installPrompt);
    }
    function onAvailable(e) {
      e.preventDefault();
      window.__installPrompt = e;
      setPrompt(e);
    }
    function onInstalled() {
      setInstalled(true);
      window.__installPrompt = null;
      setPrompt(null);
    }
    window.addEventListener('installpromptready', onReady);
    window.addEventListener('beforeinstallprompt', onAvailable);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('installpromptready', onReady);
      window.removeEventListener('beforeinstallprompt', onAvailable);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  // iOS has no beforeinstallprompt in any browser — every one of them is
  // WebKit underneath — so there is no prompt to offer and the button would
  // simply never appear. Safari can still add to the home screen; it just
  // has to be done by hand, so say how instead of showing nothing.
  if (!prompt) {
    return isIos() ? (
      <p className="install-hint">
        To install: open this page in <strong>Safari</strong>, tap Share, then{' '}
        <strong>Add to Home Screen</strong>.
      </p>
    ) : null;
  }

  async function install() {
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    // The event is single-use — Chrome fires a fresh one if they decline and
    // become eligible again.
    window.__installPrompt = null;
    setPrompt(null);
    if (outcome === 'accepted') setInstalled(true);
  }

  return (
    <button type="button" className={className} onClick={install}>
      <Download size={16} strokeWidth={1.8} /> Install app
    </button>
  );
}
