import React from 'react';
import { RefreshCw } from 'lucide-react';

const RELOAD_FLAG = 'grillexa_chunk_reload';

// Every deploy renames the content-hashed chunks. A tab still holding the
// previous index.html asks for files that no longer exist, the dynamic import
// rejects, and — with no boundary — React shows the Suspense fallback forever.
// That is a page stuck on "Loading…" with no way out but clearing browser data.
function isStaleChunk(error) {
  const message = String(error?.message || error || '');
  return (
    error?.name === 'ChunkLoadError' ||
    /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(message)
  );
}

export default class RouteErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    if (!isStaleChunk(error)) return;

    // A timestamp, not a boolean that gets cleared elsewhere. Clearing it on
    // mount looked right but componentDidMount runs on this boundary's own
    // mount whether or not the children threw — so it wiped the flag that had
    // just been set, and every reload re-armed the next one. That is an
    // endless reload loop, which on a phone looks like the app not opening.
    //
    // Refusing to retry within the window can't loop: the second failure in
    // that window falls through to the message below.
    const lastAttempt = Number(sessionStorage.getItem(RELOAD_FLAG)) || 0;
    if (Date.now() - lastAttempt < 30000) return;

    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
    window.location.reload();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const stale = isStaleChunk(error);
    return (
      <div className="page">
        <div className="card form-card">
          <h2 style={{ marginTop: 0 }}>{stale ? 'This page needs reloading' : "This page didn't load"}</h2>
          <p className="page-subtitle" style={{ color: 'var(--text-muted)' }}>
            {stale
              ? 'The app was updated while this tab was open, so part of it is out of date.'
              : 'Something went wrong opening this page. Your data is unaffected.'}
          </p>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            <RefreshCw size={16} strokeWidth={1.8} /> Reload
          </button>
        </div>
      </div>
    );
  }
}
