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
export default function InstallAppButton({ className = 'btn-secondary' }) {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches
  );

  useEffect(() => {
    function onAvailable(e) {
      // Chrome shows its own bar unless the default is prevented; we want the
      // install to happen on our button instead.
      e.preventDefault();
      setPrompt(e);
    }
    function onInstalled() {
      setInstalled(true);
      setPrompt(null);
    }
    window.addEventListener('beforeinstallprompt', onAvailable);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onAvailable);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || !prompt) return null;

  async function install() {
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    // The event is single-use — Chrome fires a fresh one if they decline and
    // become eligible again.
    setPrompt(null);
    if (outcome === 'accepted') setInstalled(true);
  }

  return (
    <button type="button" className={className} onClick={install}>
      <Download size={16} strokeWidth={1.8} /> Install app
    </button>
  );
}
