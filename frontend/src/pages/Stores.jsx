import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
// MapIcon, not Map: the bare name would shadow the Map constructor for this
// whole module, and `new Map()` below would build an icon and throw.
import { Search, MapPin, Navigation, Phone, Map as MapIcon } from 'lucide-react';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import SearchSelect from '../components/SearchSelect';
import { StoreIcon } from '../components/icons';
import {
  directionsUrl,
  telHref,
  hasPin,
  formatPin,
  accuracyTier,
  formatAccuracy,
  accuracyLabel,
  accuracyBadge,
  mapsPickUrl,
  parseCoordInput,
  coordError,
  ACCURACY_GOOD_M,
  ACCURACY_PERFECT_M,
} from '../lib/storeLinks';

// Mapbox GL and its stylesheet are ~1.9MB that most visits to this page never
// need — the map only opens when someone asks for it. Lazily loaded so the
// Stores list itself stays as quick to reach as it was, which matters more now
// than it did under Leaflet: this bundle is twelve times the size.
const MapPicker = lazy(() => import('../components/MapPicker'));

const EMPTY_FORM = { name: '', address: '', phone: '', lat: null, lng: null, accuracyM: null };

// Empty id, like the filters on Reports — '' reads as "no filter" everywhere.
const ALL_PEOPLE = { id: '', name: 'All sales people' };

// How long to keep watching for a better fix before settling for the best one
// seen. Long enough for a cold GNSS start on a street where the sky is a strip
// between two buildings — which is most of them here.
const WATCH_MS = 25000;

// The watch rarely runs the full 25s, because readings stop improving long
// before they stop arriving. These settle it once that happens: a short pause
// after a usable fix in case a better one is right behind it, and a longer one
// for a fix still too coarse to keep. The second doubles as the stall guard —
// a phone on a weak network goes quiet without ever calling the error handler,
// and a silent watch would otherwise spin to the full WATCH_MS.
const SETTLE_MS = 2500;
const STALL_MS = 8000;

// A coordinate box. It holds the TEXT that was typed, and that is the entire
// reason it is a component rather than an <input> inline in coordFields.
//
// It used to be controlled by the parsed number, which cannot be typed into:
// press "." after "17" and the box contains "17.", the parse re-renders it from
// the number, and the dot is gone before the next digit lands. Typing
// "17.4400" by hand came out as 4400, and backspacing through the dot of a
// saved pin wiped the pin. Pasting a pair always worked — a paste is one change
// event — which is exactly why this survived: the README tells people to paste.
//
// The parsed number still goes up to the form on every keystroke, so nothing
// downstream ever sees a string, and a fix from GPS or the map still lands in
// the box: onType returns true when one paste filled both fields, and blur
// settles the box back on the form's canonical number.
function CoordInput({ value, label, onType }) {
  const [draft, setDraft] = useState(null);
  return (
    <input
      className="line-input coord-input"
      inputMode="decimal"
      placeholder={label}
      aria-label={label}
      // ?? not ||: an emptied box is '' and must stay empty, and 0 is a real
      // coordinate rather than a missing one.
      value={draft ?? value ?? ''}
      onChange={(e) => setDraft(onType(e.target.value) ? null : e.target.value)}
      onBlur={() => setDraft(null)}
    />
  );
}

// getCurrentPosition's error codes, in the words of someone holding the phone.
// A denial is the common one and is not a failure — the address can always be
// typed, so it reads as a redirection rather than an error.
function geoMessage(err) {
  if (err.code === 1) return 'Location permission was denied. Allow it in your browser settings, or type the address below.';
  if (err.code === 2) return "Couldn't get a fix — try stepping outside, or type the address below.";
  if (err.code === 3) return 'Locating timed out. Try again, or type the address below.';
  return 'Location is unavailable. Type the address below.';
}

export default function Stores() {
  const { user } = useAuth();
  const isAdmin = user.role === 'ADMIN';
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [search, setSearch] = useState('');
  // Admin only, and a string: SearchSelect hands back the option's own id.
  const [salesId, setSalesId] = useState('');
  const [geo, setGeo] = useState({ busy: false, error: '', note: '' });
  const [searchParams, setSearchParams] = useSearchParams();
  // Which form has its map open — 'new' for the add form, or a store id. Not a
  // boolean: the add form and a row editor can be open at once, and one shared
  // flag would open both maps — and bill for two map loads instead of one.
  const [mapOpenFor, setMapOpenFor] = useState(null);
  // The public Mapbox token and this month's map-load count, in one request.
  // Fetched for everyone because the picker cannot draw without the token; the
  // meter built from it is shown to Admin only, below — a salesperson adding a
  // shop has no use for the billing line.
  const [mapConfig, setMapConfig] = useState(null);
  // Every response that spends Mapbox quota carries the month's fresh figures
  // back, so the meter follows the request that moved it instead of being
  // re-fetched afterwards.
  const setUsage = (usage) => setMapConfig((c) => ({ ...c, usage }));

  // Where to open the map for a store that has no pin. The most recently added
  // store that does have one, because someone adding shops today is working one
  // area — and because a hardcoded city is wrong the moment the business opens
  // in another. Not an average of every pin: across two cities that lands the
  // map in the countryside between them, which is nowhere at all.
  const nearbyPin = useMemo(() => {
    const pinned = stores.filter(hasPin);
    if (!pinned.length) return null;
    const latest = pinned.reduce((a, b) => (a.id > b.id ? a : b));
    return [latest.lat, latest.lng];
  }, [stores]);

  // The people to offer, taken from the assignments already on the response —
  // a salesperson covering no store would only ever filter the list to empty,
  // so there is nothing to fetch. Sales accounts get no salesUsers at all, and
  // land here with an empty list and no dropdown.
  const salespeople = useMemo(() => {
    const byId = new Map();
    for (const s of stores) for (const u of s.salesUsers || []) byId.set(u.id, u);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [stores]);

  const filteredStores = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stores.filter(
      (s) =>
        (!q || s.name.toLowerCase().includes(q) || (s.address || '').toLowerCase().includes(q)) &&
        (!salesId || (s.salesUsers || []).some((u) => String(u.id) === salesId))
    );
  }, [stores, search, salesId]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/stores');
      setStores(res.data.stores);
    } catch (err) {
      setError('Failed to load stores.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Its own request, not part of load(): a failure here must not take the
    // store list down with it, and the list is the reason the page exists.
    client.get('/stores/map-config').then(
      (res) => setMapConfig(res.data),
      () => setMapConfig({ token: '', usage: null })
    );
  }, []);

  // Where a tapped notification lands. There is no store detail page — the row
  // already shows everything one would hold, so the notification scrolls to it
  // and highlights it rather than opening a page built only to be linked to.
  //
  // The id is copied into state before the URL parameter is dropped, because
  // the two have different lifetimes: the parameter must go immediately so a
  // refresh doesn't re-trigger the highlight, while the highlight itself has
  // to outlive it long enough to be seen. It fades on a CSS animation rather
  // than a timer, so nothing has to be cleaned up.
  const focusParam = Number(searchParams.get('focus')) || null;
  const [highlightId, setHighlightId] = useState(null);
  const focusedRef = useRef(null);

  useEffect(() => {
    // Waits for `stores`: opening from a cold tap renders before the list
    // loads, and there is no row to scroll to yet.
    if (!focusParam || !stores.length) return;
    setHighlightId(focusParam);
    const next = new URLSearchParams(searchParams);
    next.delete('focus');
    setSearchParams(next, { replace: true });
  }, [focusParam, stores.length]);

  useEffect(() => {
    if (highlightId) focusedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightId]);

  // Shared by the add form and the row editor: a store added before pins
  // existed can only get one here, and there are fifty of those.
  //
  // The pin is applied the moment it arrives, before the address lookup is
  // even attempted. Nominatim being slow or down must not cost the fix — that
  // is the part that can't be typed back in later.
  function locate(apply) {
    if (!navigator.geolocation) {
      setGeo({ busy: false, error: 'This browser cannot report a location. Type the address or coordinates below.', note: '' });
      return;
    }
    setGeo({ busy: true, error: '', note: 'Locating… hold still for a few seconds.' });

    // watchPosition, not getCurrentPosition. The FIRST fix a phone returns is
    // usually the cheap one — wifi or cell, hundreds of metres out, sometimes
    // kilometres — and the true GNSS fix arrives seconds later. Taking the
    // first reading is what puts a store on the wrong road. So: watch, keep
    // the most accurate reading seen, and stop early once it is good enough.
    let best = null;
    let done = false;
    let settle = null;

    // Don't watch forever: a phone that never gets a clean fix must still hand
    // back the best it managed rather than spinning.
    const maxTimer = setTimeout(() => finish(), WATCH_MS);

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const improved = !best || pos.coords.accuracy < best.coords.accuracy;
        if (improved) best = pos;
        setGeo({ busy: true, error: '', note: `Locating… best so far ${formatAccuracy(best.coords.accuracy)}` });
        // Open sky: this is as good as the hardware gets, so stop asking.
        if (best.coords.accuracy <= ACCURACY_PERFECT_M) return finish();
        // Wait out a quiet spell, re-armed only when the fix actually got
        // BETTER. Re-arming on every reading instead meant it never fired: a
        // phone delivers a fix about once a second and almost all of them are
        // no improvement on the best, so the timer was pushed back before it
        // could ever expire and every capture ran the full 25s with someone
        // stood in the street holding a phone. Armed on the first reading, so
        // it is still the stall guard for a watch that goes quiet without ever
        // calling the error handler.
        if (!improved) return;
        clearTimeout(settle);
        settle = setTimeout(finish, best.coords.accuracy <= ACCURACY_GOOD_M ? SETTLE_MS : STALL_MS);
      },
      (err) => {
        if (done) return;
        // A later error after a good reading isn't a failure — keep what we have.
        if (best) return finish();
        done = true;
        stop();
        setGeo({ busy: false, error: geoMessage(err), note: '' });
      },
      { enableHighAccuracy: true, timeout: WATCH_MS, maximumAge: 0 }
    );

    function stop() {
      clearTimeout(maxTimer);
      clearTimeout(settle);
      navigator.geolocation.clearWatch(watchId);
    }

    async function finish() {
      if (done) return;
      done = true;
      stop();
      if (!best) {
        setGeo({ busy: false, error: "Couldn't get a fix — type the address or coordinates below.", note: '' });
        return;
      }
      const { latitude: lat, longitude: lng, accuracy } = best.coords;
      const tier = accuracyTier(accuracy);
      // The pin lands first, always — it is the part that cannot be typed back
      // in later, and the address lookup may fail or be slow.
      apply({ lat, lng, accuracyM: Math.round(accuracy) });

      // A fix this coarse would reverse-geocode to a confidently wrong street.
      // Filling that in is worse than leaving it blank: it looks authoritative
      // and someone has to notice it is wrong. Keep the pin, skip the address.
      //
      // Only perfect and good earn the lookup. A fair fix usually does land on
      // the right road — but "usually" is the problem: nobody can tell the
      // times it didn't from the times it did, and an address nobody checks is
      // an address nobody trusts.
      if (tier === 'fair' || tier === 'poor') {
        setGeo({
          busy: false,
          note: '',
          error:
            tier === 'poor'
              ? `📍 ${accuracyLabel(accuracy)}. Your phone used wifi or the mobile network, not GPS — that happens indoors and between tall buildings. Step outside and try again, or open Google Maps below and paste the exact coordinates.`
              : `📍 ${accuracyLabel(accuracy)}. Close, but not close enough to name the street — type the address below, or step outside and try again for a tighter pin.`,
        });
        return;
      }

      setGeo({ busy: true, error: '', note: `📍 ${accuracyLabel(accuracy)} — looking up the address…` });
      try {
        const res = await client.get('/stores/reverse-geocode', { params: { lat, lng } });
        if (res.data.address) apply({ address: res.data.address });
        if (res.data.usage) setUsage(res.data.usage);
        setGeo({
          busy: false,
          error: '',
          note: res.data.address
            ? `📍 ${accuracyLabel(accuracy)}. Address filled in — correct it if it looks wrong.`
            : `📍 ${accuracyLabel(accuracy)}. No address found for this point, so type it below.`,
        });
      } catch (err) {
        setGeo({
          busy: false,
          error: err.response?.data?.error || 'Address lookup failed — the location is saved, type the address below.',
          note: '',
        });
      }
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const res = await client.post('/stores', form);
      // The person who added it gets the toast; everyone else gets the push.
      // Notifying yourself of your own action is noise, and this is the one
      // notification guaranteed to arrive with the app already open.
      toast.success(`🏪 ${res.data.store.name} added`, { icon: '🏪' });
      setForm(EMPTY_FORM);
      setFormOpen(false);
      setGeo({ busy: false, error: '', note: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add store.');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(s) {
    setGeo({ busy: false, error: '', note: '' });
    setEditingId(s.id);
    setEditForm({ name: s.name, address: s.address || '', phone: s.phone || '', lat: s.lat, lng: s.lng, accuracyM: s.accuracyM });
  }

  async function handleSaveEdit(id) {
    setError('');
    try {
      await client.patch(`/stores/${id}`, editForm);
      setEditingId(null);
      setGeo({ busy: false, error: '', note: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update store.');
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setError('');
    try {
      await client.delete(`/stores/${id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete store.');
    }
  }

  // The coordinates, always editable and always visible. GPS is a suggestion
  // like the address is: where the fix is wrong — and in a dense Indian
  // street it often is — the fastest repair is pasting the pair straight out
  // of Google Maps, so the lat box takes "13.0878, 80.2103" as one paste and
  // splits it. Typing here clears the accuracy reading: it described the
  // sensor's guess, not this hand-entered pin.
  function coordFields(values, apply, formKey) {
    const tier = accuracyTier(values.accuracyM);
    const err = coordError(values.lat, values.lng);
    const mapOpen = mapOpenFor === formKey;
    // A pin dropped on a map has no sensor estimate, exactly like one typed by
    // hand — so accuracyM is cleared rather than invented. That is what makes
    // it read as 'unknown' in the badge instead of claiming a precision no
    // instrument measured.
    function pickFromMap(lat, lng) {
      apply({ lat, lng, accuracyM: null });
    }
    // Only when the pin is doubtful or missing — a good fix needs no escape
    // hatch, and offering one there just invites second-guessing.
    const mapsPick = tier === 'good' || tier === 'perfect' ? '' : mapsPickUrl(values);
    // Returns whether one paste filled both fields, which is the box's cue to
    // stop showing the raw text and let the split values through.
    function setPart(part, text) {
      const parsed = parseCoordInput(text);
      if (parsed && parsed.lng !== undefined) {
        apply({ lat: parsed.lat, lng: parsed.lng, accuracyM: null });
        return true;
      }
      apply({ [part]: parsed ? parsed.lat : null, accuracyM: null });
      return false;
    }
    return (
      <div className="store-coords">
        <MapPin size={14} className="store-coords-icon" />
        <CoordInput label="Latitude" value={values.lat} onType={(t) => setPart('lat', t)} />
        <CoordInput label="Longitude" value={values.lng} onType={(t) => setPart('lng', t)} />
        {values.accuracyM != null && (
          <span className={`accuracy-badge accuracy-${tier}`} title="How far off this pin could be">
            {accuracyLabel(values.accuracyM)}
          </span>
        )}
        {hasPin(values) && (
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => apply({ lat: null, lng: null, accuracyM: null })}
          >
            Clear
          </button>
        )}
        {err && <div className="form-warning coord-error">{err}</div>}
        {/* The dependable path where GPS isn't: find the shutter by eye on the
            map, long-press it, and paste the pair back. Offered whenever the
            fix is worth doubting — or when there is no fix at all. */}
        {mapsPick && (
          <a
            className="btn-secondary btn-sm coord-maps-link"
            href={mapsPick}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MapIcon size={14} />
            Find it on Google Maps
          </a>
        )}
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => setMapOpenFor(mapOpen ? null : formKey)}
        >
          <MapIcon size={14} />
          {mapOpen ? 'Hide map' : 'Pick on map'}
        </button>
        <span className="form-hint coord-hint">
          {mapsPick
            ? 'On Google Maps, long-press the shop → copy the coordinates → paste them into the Latitude box.'
            : 'Paste a “lat, lng” pair from Google Maps into either box.'}
        </span>
        {mapOpen && (
          <Suspense fallback={<div className="map-loading">Loading map…</div>}>
            <MapPicker
              lat={values.lat}
              lng={values.lng}
              nearby={nearbyPin}
              token={mapConfig?.token || ''}
              onUsage={setUsage}
              onPick={pickFromMap}
              // A search result carries an address, but it names the building
              // the geocoder matched, not the shop. Offered only into an empty
              // field: overwriting something already typed would lose the one
              // version a person actually checked.
              onSearchPick={(r) => {
                if (!values.address && r.address) apply({ address: r.address });
              }}
            />
          </Suspense>
        )}
      </div>
    );
  }

  // One button, not two. It always retried — tapping it again is what a retry
  // is — but after a doubtful fix it has to SAY so, and say what to do
  // differently, or the reasonable reading is that GPS simply failed.
  function locateButton(values, apply, label) {
    const tier = accuracyTier(values.accuracyM);
    const retryLabel =
      tier === 'poor' ? '📍 Try again — step outside' : tier === 'fair' ? '📍 Try again' : label;
    return (
      <button type="button" className="btn-secondary btn-locate" onClick={() => locate(apply)} disabled={geo.busy}>
        {geo.busy ? '⏳ Locating…' : retryLabel}
      </button>
    );
  }

  const applyToForm = (patch) => setForm((f) => ({ ...f, ...patch }));
  const applyToEdit = (patch) => setEditForm((f) => ({ ...f, ...patch }));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Stores</h1>
          <p className="page-subtitle">{stores.length} retail stores</p>
        </div>
        {/* Adding is open to every role — see the note on POST /stores. Editing
            and deleting stay Admin-only, further down the table. */}
        <button className="btn-primary" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? 'Cancel' : '+ Add Store'}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {/* What the maps have cost so far this month. Admin only: it is a billing
          figure, and a salesperson standing outside a shop can do nothing with
          it but worry. Grouped in thousands rather than lakhs because these are
          Mapbox's own published limits, quoted the way Mapbox quotes them.

          <meter> rather than a div and a width: the browser already draws a
          gauge against a limit, announces it to a screen reader as one, and
          turns it amber past `high` without any of that being this app's code
          to keep working. */}
      {isAdmin && mapConfig?.usage && (
        <div className="card map-usage">
          <span className="map-usage-title">Mapbox tier · {mapConfig.usage.month}</span>
          {[
            ['Map loads', mapConfig.usage.loads],
            ['Geocoding', mapConfig.usage.geocodes],
          ].map(([label, m]) => (
            <div className="map-usage-row" key={label}>
              <span className="map-usage-label">{label}</span>
              <meter
                value={m.used}
                max={m.limit}
                high={m.limit * 0.8}
                optimum={0}
                aria-label={`${label} used this month`}
              />
              <span className="map-usage-count">
                {m.used.toLocaleString('en-US')} / {m.limit.toLocaleString('en-US')} (
                {((m.used / m.limit) * 100).toFixed(1)}%)
              </span>
            </div>
          ))}
          {/* The two tokens are independent, and a drawn map is no evidence
              that geocoding is on. With only the public one set, every search
              and every address lookup goes to Nominatim while this meter reads
              a confident Mapbox zero — and the symptom people report is that
              the map gives wrong locations, with nothing naming the cause. */}
          {mapConfig.geocoding === 'nominatim' && (
            <p className="map-note map-note-warn">
              Geocoding is running on Nominatim, not Mapbox. Either{' '}
              <code>MAPBOX_ACCESS_TOKEN</code> is not set on the server, or it is set and Mapbox
              refused it — most often a token carrying a URL restriction, which the server cannot
              use because it sends no <code>Referer</code>. The server log names the status. Place
              search and the address filled in after a GPS capture are much weaker in India this
              way. The pin itself is unaffected.
            </p>
          )}
        </div>
      )}

      {formOpen && (
        <div className="card form-card">
          <form onSubmit={handleCreate}>
            <div className="store-form-locate">
              {locateButton(form, applyToForm, '📍 Get Current Location')}
              <span className="form-hint">Stand at the store and tap this — it fills the address and saves the exact spot.</span>
            </div>
            {geo.note && <div className="form-success">{geo.note}</div>}
            {geo.error && <div className="form-warning">{geo.error}</div>}
            {coordFields(form, applyToForm, 'new')}
            <div className="inline-form">
              <input
                placeholder="Store name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <input
                placeholder="Address (optional)"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
              <input
                type="tel"
                placeholder="Phone (optional)"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <button type="submit" className="btn-primary" disabled={creating}>
                {creating ? 'Adding…' : 'Add Store'}
              </button>
            </div>
          </form>
        </div>
      )}

      {!loading && (
        <div className="card form-card">
          <div className="filter-group">
            <div className="search-input">
              <Search size={16} />
              <input placeholder="Search stores…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {/* Eighty stores in one flat list is only readable to the
                salesperson who sees six of them. SearchSelect drops back to a
                native <select> for five people or fewer on its own. */}
            {isAdmin && salespeople.length > 0 && (
              <SearchSelect
                options={salespeople}
                value={salesId}
                firstOption={ALL_PEOPLE}
                onChange={(id) => setSalesId(String(id))}
                placeholder="Filter by salesperson"
              />
            )}
          </div>
        </div>
      )}

      {loading ? (
        <Spinner label="Loading stores…" />
      ) : (
        <div className="card">
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Address</th>
                {/* One actions column, not two: .actions-cell is display:flex,
                    and two of those in a row stop being table cells and break
                    the row across two lines. */}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredStores.map((s) => {
                const isEditing = editingId === s.id;
                const tel = telHref(s.phone);
                return (
                  <tr
                    key={s.id}
                    ref={s.id === highlightId ? focusedRef : null}
                    className={s.id === highlightId ? 'row-focused' : undefined}
                  >
                    {isEditing ? (
                      <>
                        <td>
                          <input
                            className="line-input"
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="line-input"
                            value={editForm.address}
                            onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                          />
                          <input
                            className="line-input"
                            type="tel"
                            placeholder="Phone"
                            value={editForm.phone}
                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                          />
                          {geo.error && <div className="form-warning">{geo.error}</div>}
                          {coordFields(editForm, applyToEdit, s.id)}
                        </td>
                        <td className="actions-cell">
                          {locateButton(editForm, applyToEdit, hasPin(editForm) ? '📍 Re-capture' : '📍 Capture GPS')}
                          <button className="btn-secondary btn-sm" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                          <button className="btn-primary btn-sm" onClick={() => handleSaveEdit(s.id)}>
                            Save
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="cell-strong">{s.name}</td>
                        <td>
                          {s.address || '—'}
                          {s.phone && <div className="cell-muted">{s.phone}</div>}
                          {/* The pin, in the open. A store whose fix was taken
                              indoors can be kilometres out, and until it is
                              shown here the only symptom is a driver ending up
                              on the wrong road. */}
                          {hasPin(s) ? (
                            <div className="cell-muted store-pin-readout">
                              <MapPin size={12} />
                              <span className="cell-mono">{formatPin(s)}</span>
                              {s.accuracyM != null && (
                                <span
                                  className={`accuracy-badge accuracy-${accuracyTier(s.accuracyM)}`}
                                  title={accuracyLabel(s.accuracyM)}
                                >
                                  {accuracyBadge(s.accuracyM)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="cell-muted store-pin-readout">No GPS pin — directions are approximate</div>
                          )}
                        </td>
                        {/* Directions and Call are for everyone, not just an
                            admin: the people who drive to these shops are the
                            ones who can't edit them. */}
                        <td className="actions-cell">
                          <a
                            data-testid="directions"
                            className="btn-secondary btn-sm"
                            href={directionsUrl(s)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={hasPin(s) ? `Navigate to ${formatPin(s)}` : 'No saved pin — searches Maps for the name and address'}
                          >
                            <Navigation size={14} />
                            Directions
                            {!hasPin(s) && <span className="cell-muted"> (approx.)</span>}
                          </a>
                          {tel && (
                            <a className="btn-secondary btn-sm" href={tel}>
                              <Phone size={14} />
                              Call
                            </a>
                          )}
                          {isAdmin && (
                            <>
                              <button className="btn-secondary btn-sm" onClick={() => startEdit(s)}>
                                Edit
                              </button>
                              <button className="btn-danger btn-sm" onClick={() => handleDelete(s.id, s.name)}>
                                Delete
                              </button>
                            </>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
              {filteredStores.length === 0 && (
                <tr>
                  <td colSpan={3}>
                    <EmptyState
                      icon={StoreIcon}
                      message={stores.length === 0 ? 'No stores yet.' : 'No stores match your filters.'}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
