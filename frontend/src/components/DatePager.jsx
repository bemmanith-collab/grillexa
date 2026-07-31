import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDate } from '../utils/date';

// Breaks a list into one page per date, newest first. A day is the unit these
// lists are actually worked in — a shift's deliveries, a day's bills — so
// paging by date beats scrolling 40 records or an arbitrary "20 per page"
// that splits one day across two screens.
//
// Only dates that have records become pages, so there are no empty days to
// click past.
export function useDatePages(items, getDate) {
  const dates = useMemo(
    () => [...new Set(items.map(getDate).filter(Boolean))].sort().reverse(),
    [items, getDate]
  );

  const [date, setDate] = useState(null);

  // Land on the newest day, and follow it when the data reloads. If the day
  // being viewed disappears (its last record was deleted or edited to another
  // date), fall back to the newest rather than showing an empty page.
  useEffect(() => {
    if (!dates.length) setDate(null);
    else if (!date || !dates.includes(date)) setDate(dates[0]);
  }, [dates, date]);

  const index = dates.indexOf(date);
  const visible = useMemo(
    () => (date ? items.filter((i) => getDate(i) === date) : items),
    [items, date, getDate]
  );

  return {
    dates,
    date,
    index,
    visible,
    // dates are newest-first, so "older" moves forward through the array.
    older: index >= 0 && index < dates.length - 1 ? () => setDate(dates[index + 1]) : null,
    newer: index > 0 ? () => setDate(dates[index - 1]) : null,
    goTo: setDate,
  };
}

export default function DatePager({ pager, noun = 'record' }) {
  const { dates, date, index, visible, older, newer, goTo } = pager;
  if (!date || dates.length <= 1) return null;

  const count = visible.length;
  return (
    <div className="date-pager">
      <button type="button" className="btn-secondary" onClick={older || undefined} disabled={!older}>
        <ChevronLeft size={16} strokeWidth={2} /> Older
      </button>

      <div className="date-pager-current">
        <label className="date-pager-date">
          <span className="sr-only">Jump to a date</span>
          <select value={date} onChange={(e) => goTo(e.target.value)}>
            {dates.map((d) => (
              <option key={d} value={d}>
                {formatDate(d)}
              </option>
            ))}
          </select>
        </label>
        <span className="date-pager-count">
          {count} {noun}
          {count === 1 ? '' : 's'} · day {index + 1} of {dates.length}
        </span>
      </div>

      <button type="button" className="btn-secondary" onClick={newer || undefined} disabled={!newer}>
        Newer <ChevronRight size={16} strokeWidth={2} />
      </button>
    </div>
  );
}
