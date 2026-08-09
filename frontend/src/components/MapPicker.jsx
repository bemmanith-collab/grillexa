import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import client from '../api/client';

// Picking a shop off a map, for when standing outside it with GPS is not on
// offer — a store added from the office, or one whose fix came back 2km wide.
//
// Chennai. Only used when there is no pin yet and nothing typed to search:
// a map that opens on the null island is a map everyone has to drag across the
// planet before it is any use.
const DEFAULT_CENTRE = [13.0827, 80.2707];
const DEFAULT_ZOOM = 12;
// Close enough to tell one shutter from the next, the same zoom the Google
// Maps escape hatch uses.
const PIN_ZOOM = 18;

// Leaflet's default marker is a PNG it locates by guessing a URL relative to
// its own stylesheet, which a bundler rewrites — the classic symptom is a
// broken-image icon, or no marker at all. A divIcon sidesteps the whole
// mechanism: this is markup, styled by CSS we already ship, with nothing to
// resolve and no extra request.
const pinIcon = L.divIcon({
  className: 'map-pin-icon',
  html: '<span class="map-pin-dot"></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// react-leaflet gives no prop for "handle a click", so this is the documented
// shape: a child component that subscribes to the map's own events.
function ClickToPlace({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Moves the map when the pin changes from *outside* it — the GPS button, a
// pasted coordinate pair, a search result. Deliberately not on every pin
// change: recentring while someone drags the marker fights their hand.
function Recentre({ centre, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (centre) map.setView(centre, zoom ?? map.getZoom());
  }, [centre?.[0], centre?.[1], zoom]);
  return null;
}

export default function MapPicker({ lat, lng, onPick, onSearchPick }) {
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng);
  const position = hasPin ? [lat, lng] : null;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState('');

  // Only what an external change should recentre on. Keeping this separate
  // from `position` is what stops a drag from yanking the map underneath.
  const [externalCentre, setExternalCentre] = useState(position);
  const draggingRef = useRef(false);
  useEffect(() => {
    if (!draggingRef.current && hasPin) setExternalCentre([lat, lng]);
  }, [lat, lng, hasPin]);

  const markerHandlers = useMemo(
    () => ({
      dragstart() {
        draggingRef.current = true;
      },
      dragend(e) {
        draggingRef.current = false;
        const { lat: dLat, lng: dLng } = e.target.getLatLng();
        onPick(dLat, dLng);
      },
    }),
    [onPick]
  );

  async function search() {
    const q = query.trim();
    // Matches the server's floor, so a short query is answered here rather
    // than spending a request from the shared Nominatim budget.
    if (q.length < 3) {
      setSearchNote('Type at least three characters.');
      return;
    }
    setSearching(true);
    setSearchNote('');
    setResults([]);
    try {
      const { data } = await client.get('/stores/geocode', { params: { q } });
      setResults(data.results);
      if (!data.results.length) setSearchNote('Nothing found. Try a landmark or a road name, or drop the pin by hand.');
    } catch (err) {
      setSearchNote(err.response?.data?.error || 'Search is unavailable — drop the pin by hand instead.');
    } finally {
      setSearching(false);
    }
  }

  function choose(result) {
    setResults([]);
    setQuery('');
    setExternalCentre([result.lat, result.lng]);
    // A search result is a rooftop guess, never the shutter. It is a way to
    // get the map to the right street — the pin still has to be placed, so
    // the address it came with is offered rather than written.
    onSearchPick?.(result);
    onPick(result.lat, result.lng);
  }

  return (
    <div className="map-picker">
      {/* A div, not a form, and every button is type="button". This sits inside
          the Add Store <form>, and a nested <form> is invalid HTML — the parser
          throws the inner one away, so onSubmit never fires and a submit button
          submits the OUTER form. Searching would have tried to save the store. */}
      <div className="map-search" role="search">
        <input
          type="search"
          className="line-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter in a text input submits the enclosing form. Intercepted for
            // the same reason as above: here it means "search", never "save".
            if (e.key === 'Enter') {
              e.preventDefault();
              search();
            }
          }}
          placeholder="Search a PIN code, road, landmark or area…"
          aria-label="Search for a place or PIN code"
        />
        <button type="button" className="btn-secondary btn-sm" onClick={search} disabled={searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>

      {results.length > 0 && (
        <ul className="map-results">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button type="button" onClick={() => choose(r)}>
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {searchNote && <p className="map-note">{searchNote}</p>}

      <MapContainer
        center={position || DEFAULT_CENTRE}
        zoom={position ? PIN_ZOOM : DEFAULT_ZOOM}
        scrollWheelZoom
        className="map-canvas"
      >
        {/* Attribution is a condition of using OpenStreetMap's tiles, not a
            decoration. Leaflet renders it into the corner of the map. */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />
        <ClickToPlace onPick={onPick} />
        <Recentre centre={externalCentre} zoom={PIN_ZOOM} />
        {position && (
          <Marker position={position} icon={pinIcon} draggable eventHandlers={markerHandlers} />
        )}
      </MapContainer>

      <p className="map-note">
        {hasPin
          ? 'Tap the map to move the pin, or drag it. Zoom in until you can see the shutter.'
          : 'Tap the map where the shop is. Search above to get to the right street first.'}
      </p>
    </div>
  );
}
