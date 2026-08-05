import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { matchParts, rankOptions, readRecent, pushRecent } from '../lib/searchSelect';

// A dropdown that can be typed at, for the lists too long to scroll on a
// phone — fifty-odd stores, and the product catalogue as it grows. Short
// lists keep the native <select>: it's already touch-friendly and costs
// nothing.
//
// firstOption is a non-option row pinned to the top: "Select a store…" on the
// forms, "All Stores" on the filters. It never counts as a recent pick.
//
// recentKey turns on per-device recents under that localStorage key. Leave it
// off where the caller's order is already deliberate — the product catalogue
// is sorted for someone loading a van, and this device's habits shouldn't
// reshuffle it.
const SEARCHLESS_MAX = 5;
const GAP = 4;
// Three rows. With less room than this below the field, the list opens upward
// instead — a line near the bottom of the form, or a phone keyboard taking
// half the screen, otherwise gets a dropdown it can't read.
const MIN_ROOM = 132;

export const SELECT_A_STORE = { id: '', name: 'Select a store…' };
// One key for every store picker, so a store picked on Deliver to Store is
// near the top on Direct Sale too — same van, same round.
export const RECENT_STORES = 'grillexa.recentStores';

export default function SearchSelect({ options, value, onChange, firstOption, recentKey, placeholder = 'Search…' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState(() => readRecent(recentKey));
  const [box, setBox] = useState(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  const all = useMemo(() => (firstOption ? [firstOption, ...options] : options), [firstOption, options]);
  const selected = all.find((o) => String(o.id) === String(value));

  const results = useMemo(() => {
    const ranked = rankOptions(options, query, recent);
    if (!firstOption) return ranked;
    const q = query.trim().toLowerCase();
    return !q || firstOption.name.toLowerCase().includes(q) ? [firstOption, ...ranked] : ranked;
  }, [options, query, recent, firstOption]);

  // The list is fixed-positioned, not absolute, so that it escapes every
  // clipping ancestor — the line-items table scrolls horizontally, and an
  // absolute list inside it opened *inside* that scroll box. The price is
  // having to place it by hand, and to follow the field when anything scrolls.
  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const r = wrapRef.current.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - GAP - 8;
      const above = r.top - GAP - 8;
      const up = below < MIN_ROOM && above > below;
      setBox({
        left: r.left,
        width: r.width,
        maxHeight: Math.min(Math.round(window.innerHeight * 0.45), Math.max(up ? above : below, MIN_ROOM)),
        ...(up ? { bottom: window.innerHeight - r.top + GAP } : { top: r.bottom + GAP }),
      });
    };
    place();
    // Capture phase: catches scrolling in any ancestor, not just the window.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  // Arrow keys have to drag the list with them, or the highlight walks off
  // the bottom of the scroll box and the user is steering blind.
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function choose(item) {
    if (!item) return;
    onChange(item.id);
    if (recentKey && options.some((o) => String(o.id) === String(item.id))) {
      setRecent(pushRecent(recentKey, item.id));
    }
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return setOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (results.length ? (i + step + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      // Only swallow Enter when it's picking something — otherwise it's the
      // user submitting the form, which is what they meant.
      if (open && results.length) {
        e.preventDefault();
        choose(results[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  if (options.length <= SEARCHLESS_MAX) {
    return (
      <select
        value={value ?? ''}
        onChange={(e) => onChange(all.find((o) => String(o.id) === e.target.value)?.id ?? '')}
      >
        {all.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="search-select" ref={wrapRef}>
      <div className="search-input">
        <Search size={16} />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          value={open ? query : selected?.name || ''}
          placeholder={selected?.name || placeholder}
          onFocus={() => {
            setOpen(true);
            setQuery('');
            setActive(0);
          }}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={handleKeyDown}
        />
      </div>
      {open && box && (
        // mousedown, not click: it fires before the input's blur closes the
        // list, and preventDefault keeps the keyboard up on a phone.
        <ul
          className="search-select-results"
          ref={listRef}
          role="listbox"
          style={box}
          onMouseDown={(e) => e.preventDefault()}
        >
          {results.map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={() => choose(o)}
              onMouseEnter={() => setActive(i)}
            >
              {/* One flex item, not one per run: as separate items the space
                  in "Anna Nagar" is a whitespace-only box and collapses. */}
              <span>
                {matchParts(o.name, query).map((part, j) =>
                  part.hit ? <mark key={j}>{part.text}</mark> : <React.Fragment key={j}>{part.text}</React.Fragment>
                )}
              </span>
            </li>
          ))}
          {results.length === 0 && <li className="search-select-empty">No match for “{query.trim()}”</li>}
        </ul>
      )}
    </div>
  );
}
