import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Search, MapPin, Navigation, Phone, Map } from 'lucide-react';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
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

// Leaflet and its stylesheet are ~150KB that most visits to this page never
// need — the map only opens when someone asks for it. Lazily loaded so the
// Stores list itself stays as quick to reach as it was.
const MapPicker = lazy(() => import('../components/MapPicker'));

const EMPTY_FORM = { name: '', address: '', phone: '', lat: null, lng: null, accuracyM: null };

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
  const [geo, setGeo] = useState({ busy: false, error: '', note: '' });
  const [searchParams, setSearchParams] = useSearchParams();
  // Which form has its map open — 'new' for the add form, or a store id. Not a
  // boolean: the add form and a row editor can be open at once, and one shared
  // flag would open both maps and load two Leaflet instances.
  const [mapOpenFor, setMapOpenFor] = useState(null);

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

  const filteredStores = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter((s) => s.name.toLowerCase().includes(q) || (s.address || '').toLowerCase().includes(q));
  }, [stores, search]);

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
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        setGeo({ busy: true, error: '', note: `Locating… best so far ${formatAccuracy(best.coords.accuracy)}` });
        // Open sky: this is as good as the hardware gets, so stop asking.
        if (best.coords.accuracy <= ACCURACY_PERFECT_M) return finish();
        // Otherwise wait out a quiet spell — re-armed on each reading, so it
        // fires once the fix stops improving rather than once it first lands.
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
    function setPart(part, text) {
      const parsed = parseCoordInput(text);
      if (parsed && parsed.lng !== undefined) return apply({ lat: parsed.lat, lng: parsed.lng, accuracyM: null });
      apply({ [part]: parsed ? parsed.lat : null, accuracyM: null });
    }
    return (
      <div className="store-coords">
        <MapPin size={14} className="store-coords-icon" />
        <input
          className="line-input coord-input"
          inputMode="decimal"
          placeholder="Latitude"
          aria-label="Latitude"
          value={values.lat ?? ''}
          onChange={(e) => setPart('lat', e.target.value)}
        />
        <input
          className="line-input coord-input"
          inputMode="decimal"
          placeholder="Longitude"
          aria-label="Longitude"
          value={values.lng ?? ''}
          onChange={(e) => setPart('lng', e.target.value)}
        />
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
            <Map size={14} />
            Find it on Google Maps
          </a>
        )}
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => setMapOpenFor(mapOpen ? null : formKey)}
        >
          <Map size={14} />
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
          <div className="search-input">
            <Search size={16} />
            <input placeholder="Search stores…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
                      message={stores.length === 0 ? 'No stores yet.' : 'No stores match your search.'}
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
