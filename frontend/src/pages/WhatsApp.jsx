import React from 'react';
import { Navigate } from 'react-router-dom';
import Spinner from '../components/Spinner';
import WhatsAppGenerator from '../components/WhatsAppGenerator';
import { useChannelAccess } from '../lib/channelAccess';

// Its own page rather than a card on the dashboard: this is opened every day to
// do one job, and on a phone the dashboard is a long scroll of numbers that has
// nothing to do with writing a post.
export default function WhatsAppPage() {
  const { state, options } = useChannelAccess();

  if (state === 'loading') return <Spinner />;

  // Not one of the channel's writers. Typing the URL in by hand lands back on
  // the dashboard — the server would refuse anyway, so this only avoids showing
  // an empty page. Being ADMIN is not enough.
  if (state === 'denied') return <Navigate to="/" replace />;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>WhatsApp Content</h1>
          <p className="page-subtitle">
            Write a post for the Grillo channel, then copy it across.
          </p>
        </div>
      </div>

      {state === 'error' ? (
        <div className="card">
          <div className="form-error">
            The content generator is not responding. Try again in a moment.
          </div>
        </div>
      ) : (
        <WhatsAppGenerator options={options} />
      )}
    </div>
  );
}
