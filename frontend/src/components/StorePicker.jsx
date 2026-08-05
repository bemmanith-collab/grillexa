import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { matchParts, rankStores, readRecent, pushRecent } from '../lib/storePicker';

// A store picker that can be typed at. With fifty-odd stores a native <select>
// is a scroll marathon on a phone, so anything longer than a short list gets a
// search box instead. Short lists keep the native control — it's already
// touch-friendly and costs nothing.
//
// firstOption is a non-store row pinned to the top: "Select a store…" on the
// forms, "All Stores" on the filters. It never counts as a recent pick.
const SEARCHLESS_MAX = 5;

// Module-level so the identity is stable across renders — an inline object
// would re-run the filter on every keystroke of every other field.
export const SELECT_A_STORE = { id: '', name: 'Select a store…' };

export default function StorePicker({ stores, value, onChange, firstOption, placeholder = 'Search stores…' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState(readRecent);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const all = useMemo(() => (firstOption ? [firstOption, ...stores] : stores), [firstOption, stores]);
  const selected = all.find((s) => String(s.id) === String(value));

  const results = useMemo(() => {
    const ranked = rankStores(stores, query, recent);
    if (!firstOption) return ranked;
    const q = query.trim().toLowerCase();
    return !q || firstOption.name.toLowerCase().includes(q) ? [firstOption, ...ranked] : ranked;
  }, [stores, query, recent, firstOption]);

  // Arrow keys have to drag the list with them, or the highlight walks off
  // the bottom of a 45vh scroll box and the user is steering blind.
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function choose(item) {
    if (!item) return;
    onChange(item.id);
    if (stores.some((s) => String(s.id) === String(item.id))) setRecent(pushRecent(item.id));
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

  if (stores.length <= SEARCHLESS_MAX) {
    return (
      <select
        value={value ?? ''}
        onChange={(e) => onChange(all.find((o) => String(o.id) === e.target.value)?.id ?? '')}
      >
        {all.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="store-picker">
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
      {open && (
        // mousedown, not click: it fires before the input's blur closes the
        // list, and preventDefault keeps the keyboard up on a phone.
        <ul className="store-picker-results" ref={listRef} role="listbox" onMouseDown={(e) => e.preventDefault()}>
          {results.map((s, i) => (
            <li
              key={s.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={() => choose(s)}
              onMouseEnter={() => setActive(i)}
            >
              {/* One flex item, not one per run: as separate items the space
                  in "Anna Nagar" is a whitespace-only box and collapses. */}
              <span>
                {matchParts(s.name, query).map((part, j) =>
                  part.hit ? <mark key={j}>{part.text}</mark> : <React.Fragment key={j}>{part.text}</React.Fragment>
                )}
              </span>
            </li>
          ))}
          {results.length === 0 && <li className="store-picker-empty">No store matches “{query.trim()}”</li>}
        </ul>
      )}
    </div>
  );
}
