import React, { useCallback, useEffect, useState } from 'react';
import { Flame } from 'lucide-react';
import client from '../api/client';
import { todayStr } from '../utils/date';

const STORAGE_KEY = 'grillexa_daily_quote';

// variant: 'prominent' (Sales — they need the motivation) or 'subtle' (Admin/Manager).
export default function DailyWisdom({ variant = 'subtle' }) {
  const [quote, setQuote] = useState(null);

  // The line comes from the Wisdom Planner and is the same for everyone all
  // day. There is no shuffle button any more: it used to ask for a *random*
  // quote, which changed on every page load — and this card now sits on a
  // dashboard that refreshes itself every five minutes, so the quote would
  // have moved under the reader several times an hour.
  const fetchQuote = useCallback(async () => {
    try {
      const res = await client.get('/quotes/today', { params: { audience: 'STAFF' } });
      if (!res.data.message) return;
      const entry = { quote: res.data.message.text, author: res.data.message.author, date: todayStr() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
      setQuote(entry);
    } catch (err) {
      // Purely decorative widget — a failed fetch just means no quote today.
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
        </div>
        <p className="wisdom-quote">&ldquo;{quote.quote}&rdquo;</p>
        <p className="wisdom-author">— {quote.author}</p>
      </div>
    </div>
  );
}
