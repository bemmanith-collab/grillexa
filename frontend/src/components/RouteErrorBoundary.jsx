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
    // Reloading fetches the current index.html and the chunks it names, which
    // resolves it. Once only: the flag stops a genuine, repeatable failure
    // turning into a reload loop.
    if (isStaleChunk(error) && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
    }
  }

  componentDidMount() {
    // Got here without erroring, so any earlier reload did its job.
    sessionStorage.removeItem(RELOAD_FLAG);
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
