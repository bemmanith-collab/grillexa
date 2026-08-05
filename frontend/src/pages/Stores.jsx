import React, { useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Search, MapPin, Navigation, Phone } from 'lucide-react';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { StoreIcon } from '../components/icons';
import { directionsUrl, telHref, hasPin, formatPin } from '../lib/storeLinks';

const EMPTY_FORM = { name: '', address: '', phone: '', lat: null, lng: null };

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
      setGeo({ busy: false, error: 'This browser cannot report a location. Type the address below.', note: '' });
      return;
    }
    setGeo({ busy: true, error: '', note: '' });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        apply({ lat, lng });
        setGeo({ busy: true, error: '', note: 'Got the location — looking up the address…' });
        try {
          const res = await client.get('/stores/reverse-geocode', { params: { lat, lng } });
          if (res.data.address) apply({ address: res.data.address });
          setGeo({
            busy: false,
            error: '',
            note: res.data.address ? 'Address filled in — correct it if it looks wrong.' : 'Location saved. No address found for this point, so type it below.',
          });
        } catch (err) {
          setGeo({
            busy: false,
            error: err.response?.data?.error || 'Address lookup failed — the location is saved, type the address below.',
            note: '',
          });
        }
      },
      (err) => setGeo({ busy: false, error: geoMessage(err), note: '' }),
      // High accuracy is the point of standing outside the shop. 15s is long
      // enough for a cold GPS start on a phone that just came out of a pocket.
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
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
    setEditForm({ name: s.name, address: s.address || '', phone: s.phone || '', lat: s.lat, lng: s.lng });
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

  // The captured pin, with a way to drop it — a fix taken in the wrong car
  // park is worse than none, because Directions trusts it over the address.
  function pinRow(values, apply) {
    if (!hasPin(values)) return null;
    return (
      <div className="store-pin">
        <MapPin size={14} />
        <span className="cell-mono">{formatPin(values)}</span>
        <button type="button" className="btn-secondary btn-sm" onClick={() => apply({ lat: null, lng: null })}>
          Remove pin
        </button>
      </div>
    );
  }

  function locateButton(apply, label) {
    return (
      <button type="button" className="btn-secondary btn-locate" onClick={() => locate(apply)} disabled={geo.busy}>
        {geo.busy ? '⏳ Locating…' : label}
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
              {locateButton(applyToForm, '📍 Get Current Location')}
              <span className="form-hint">Stand at the store and tap this — it fills the address and saves the exact spot.</span>
            </div>
            {geo.note && <div className="form-success">{geo.note}</div>}
            {geo.error && <div className="form-warning">{geo.error}</div>}
            {pinRow(form, applyToForm)}
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
                          {pinRow(editForm, applyToEdit)}
                        </td>
                        <td className="actions-cell">
                          {locateButton(applyToEdit, hasPin(editForm) ? '📍 Re-locate' : '📍 Locate')}
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
