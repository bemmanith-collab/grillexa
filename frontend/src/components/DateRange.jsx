import React from 'react';
import { PROJECT_START, todayStr } from '../utils/date';

// From/To on a list's own date, sent to the server rather than applied to the
// rows already on screen. That distinction is the whole point: the rows
// outside the window are precisely the ones that were never fetched, because
// every one of these lists returns only its newest few hundred. Filtering
// client-side would narrow a list that was already truncated, which looks
// identical to working and is how this bug survived twice.
//
// Native <input type="date"> deliberately, over any picker library. It opens
// the platform's own calendar — month and year navigation, a keyboard path,
// and the phone's date wheel on Android and iOS — with nothing to ship, style
// or keep accessible. min/max bound it to the project's own history, so the
// calendar opens somewhere useful instead of on the year 1900, and a bill
// cannot be filtered to a day that has not happened.
export default function DateRange({ from, to, onFrom, onTo, onClear, label = 'From' }) {
  const today = todayStr();
  return (
    <div className="date-range">
      <label>
        <span>{label}</span>
        <input
          type="date"
          value={from}
          min={PROJECT_START}
          max={to || today}
          onChange={(e) => onFrom(e.target.value)}
        />
      </label>
      <label>
        <span>To</span>
        <input
          type="date"
          value={to}
          min={from || PROJECT_START}
          max={today}
          onChange={(e) => onTo(e.target.value)}
        />
      </label>
      {(from || to) && (
        <button type="button" className="btn-secondary btn-sm" onClick={onClear}>
          Clear dates
        </button>
      )}
    </div>
  );
}
