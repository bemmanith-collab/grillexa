import React, { useEffect, useMemo, useState } from 'react';
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
} from '../lib/storeLinks';

const EMPTY_FORM = { name: '', address: '', phone: '', lat: null, lng: null, accuracyM: null };

// How long to keep watching for a better fix before settling for the best one
// seen. Long enough for a cold GNSS start, short enough that nobody standing
// on a footpath gives up on it.
const WATCH_MS = 12000;

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
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        setGeo({ busy: true, error: '', note: `Locating… best so far ${formatAccuracy(best.coords.accuracy)}` });
        if (best.coords.accuracy <= ACCURACY_GOOD_M) finish();
      },
      (err) => {
        if (done) return;
        // A later error after a good reading isn't a failure — keep what we have.
        if (best) return finish();
        done = true;
        navigator.geolocation.clearWatch(watchId);
        setGeo({ busy: false, error: geoMessage(err), note: '' });
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
    // Don't watch forever: a phone that never gets a clean fix must still hand
    // back the best it managed rather than spinning.
    const timer = setTimeout(() => finish(), WATCH_MS);

    async function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      navigator.geolocation.clearWatch(watchId);
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
      if (tier === 'poor') {
        setGeo({
          busy: false,
          note: '',
          error: `📍 ${accuracyLabel(accuracy)}. Your phone used wifi or the mobile network, not GPS — that happens indoors and between tall buildings. Step outside and try again, or open Google Maps below and paste the exact coordinates.`,
        });
        return;
      }

      setGeo({ busy: true, error: '', note: `📍 ${accuracyLabel(accuracy)} — looking up the address…` });
      try {
        const res = await client.get('/stores/reverse-geocode', { params: { lat, lng } });
        if (res.data.address) apply({ address: res.data.address });
        const caveat =
          tier === 'fair'
            ? ' Step outside and try again if you want a tighter pin.'
            : '';
        setGeo({
          busy: false,
          error: '',
          note: res.data.address
            ? `📍 ${accuracyLabel(accuracy)}. Address filled in — correct it if it looks wrong.${caveat}`
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
      await client.post('/stores', form);
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
  function coordFields(values, apply) {
    const tier = accuracyTier(values.accuracyM);
    const err = coordError(values.lat, values.lng);
    // Only when the pin is doubtful or missing — a good fix needs no escape
    // hatch, and offering one there just invites second-guessing.
    const mapsPick = tier === 'good' ? '' : mapsPickUrl(values);
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
        <span className="form-hint coord-hint">
          {mapsPick
            ? 'On Google Maps, long-press the shop → copy the coordinates → paste them into the Latitude box.'
            : 'Paste a “lat, lng” pair from Google Maps into either box.'}
        </span>
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
        {isAdmin && (
          <button className="btn-primary" onClick={() => setFormOpen((v) => !v)}>
            {formOpen ? 'Cancel' : '+ Add Store'}
          </button>
        )}
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
            {coordFields(form, applyToForm)}
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
                  <tr key={s.id}>
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
                          {coordFields(editForm, applyToEdit)}
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
