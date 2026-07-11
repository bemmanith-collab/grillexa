import React, { useCallback, useEffect, useState } from 'react';
import { Flame, RefreshCw } from 'lucide-react';
import client from '../api/client';

const STORAGE_KEY = 'grillexa_daily_quote';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// variant: 'prominent' (Sales — they need the motivation) or 'subtle' (Admin/Manager).
export default function DailyWisdom({ variant = 'subtle' }) {
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchQuote = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get('/quotes/random');
      const entry = { quote: res.data.quote, author: res.data.author, date: todayStr() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
      setQuote(entry);
    } catch (err) {
      // Purely decorative widget — a failed fetch just means no quote today.
    } finally {
      setLoading(false);
    }
  }, []);

  // Runs once on mount: use today's cached quote if we have one, otherwise fetch.
  useEffect(() => {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed?.date === todayStr() && parsed?.quote) {
          setQuote(parsed);
          return;
        }
      } catch (err) {
        // Ignore malformed cache and fall through to a fresh fetch.
      }
    }
    fetchQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!quote) return null;

  const iconSize = variant === 'prominent' ? 22 : 18;

  return (
    <div className={`wisdom-card wisdom-${variant}`}>
      <div className="wisdom-icon">
        <Flame size={iconSize} strokeWidth={2} />
      </div>
      <div className="wisdom-body">
        <div className="wisdom-header">
          <span className="wisdom-title">Daily Grilling Wisdom</span>
          <button
            type="button"
            className="wisdom-refresh"
            onClick={fetchQuote}
            disabled={loading}
            aria-label="Get a new quote"
            title="Get a new quote"
          >
            <RefreshCw size={14} className={loading ? 'wisdom-spin' : ''} />
          </button>
        </div>
        <p className="wisdom-quote">&ldquo;{quote.quote}&rdquo;</p>
        <p className="wisdom-author">— {quote.author}</p>
      </div>
    </div>
  );
}
