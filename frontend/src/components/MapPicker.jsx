import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import client from '../api/client';
import { parseCoordInput, coordError } from '../lib/storeLinks';

// Picking a shop off a map, for when standing outside it with GPS is not on
// offer — a store added from the office, or one whose fix came back 2km wide.
//
// Where the map opens when the store has no pin yet. The caller passes the
// last store that *does* have one, which is the best available guess at where
// the next shop is — someone adding stores today is working one area.
//
// This constant is only reached before any store anywhere has a pin, i.e. once
// in the life of the database. Hyderabad because that is where the business
// is; do not hardcode a city anywhere else, it will be wrong within a year.
const LAST_RESORT_CENTRE = [17.385, 78.4867];
const DEFAULT_ZOOM = 12;
// Close enough to tell one shutter from the next, the same zoom the Google
// Maps escape hatch uses.
const PIN_ZOOM = 18;

const STYLE = 'mapbox://styles/mapbox/streets-v12';

// The marker is our own element rather than Mapbox's default SVG pin, so it
// keeps the dot the app already styles and stays the same shape it was under
// Leaflet. Mapbox positions whatever element it is handed.
function pinElement() {
  const el = document.createElement('div');
  el.className = 'map-pin-icon';
  el.innerHTML = '<span class="map-pin-dot"></span>';
  return el;
}

// onUsage is handed the month's Mapbox figures every time this component spends
// some of them — a map load, a search — so the meter on the page moves while
// the picker is open rather than only on the next page load.
export default function MapPicker({ lat, lng, onPick, onSearchPick, nearby, token, onUsage }) {
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng);
  const openAt = hasPin ? [lat, lng] : nearby || LAST_RESORT_CENTRE;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState('');

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const draggingRef = useRef(false);
  // The click handler is read through a ref so the map never has to be rebuilt
  // when the parent re-renders — rebuilding it would count a second map load
  // and bill for it.
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  // Built once. Mapbox counts a map load per initialisation, so anything that
  // tears this down and remakes it costs money as well as the flash.
  useEffect(() => {
    if (!token || mapRef.current) return undefined;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLE,
      // Mapbox takes lng,lat — the opposite order to everything else in this
      // app, and getting it backwards puts a Hyderabad shop in the Indian
      // Ocean with nothing on screen to say it is wrong.
      center: [openAt[1], openAt[0]],
      zoom: hasPin ? PIN_ZOOM : DEFAULT_ZOOM,
      // Nothing here is worth a second request on a phone over mobile data.
      attributionControl: true,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('click', (e) => pickRef.current(e.lngLat.lat, e.lngLat.lng));
    // Counted on 'load' rather than on construction: a map that never finished
    // loading — offline, refused token — is not one Mapbox billed for.
    map.once('load', () => {
      client.post('/stores/map-load').then(
        (res) => onUsage?.(res.data),
        () => {}
      );
    });
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Deliberately empty: openAt/hasPin are the *opening* view, and re-running
    // this on a pin change would rebuild the map under the user's hand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // The marker follows the pin, and the map follows it only when the change
  // came from outside — the GPS button, a pasted pair, a search result.
  // Recentring while someone drags fights their hand.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!hasPin) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      markerRef.current = new mapboxgl.Marker({ element: pinElement(), draggable: true })
        .setLngLat([lng, lat])
        .addTo(map);
      markerRef.current.on('dragstart', () => {
        draggingRef.current = true;
      });
      markerRef.current.on('dragend', () => {
        draggingRef.current = false;
        const { lat: dLat, lng: dLng } = markerRef.current.getLngLat();
        pickRef.current(dLat, dLng);
      });
    } else {
      markerRef.current.setLngLat([lng, lat]);
    }
    if (!draggingRef.current) map.easeTo({ center: [lng, lat], zoom: PIN_ZOOM });
  }, [lat, lng, hasPin]);

  async function search() {
    const q = query.trim();

    // A pasted "17.3779, 78.5174" is already the answer. No lookup, no network,
    // no geocoding request spent, and exact — which is more than any search can
    // promise. This is the reliable route out of Google Maps: long-press the
    // shop, copy the numbers it shows, paste them here.
    const pasted = parseCoordInput(q);
    if (pasted && pasted.lng !== undefined && !coordError(pasted.lat, pasted.lng)) {
      setResults([]);
      setQuery('');
      setSearchNote('');
      onPick(pasted.lat, pasted.lng);
      return;
    }
    // Matches the server's floor, so a short query is answered here rather than
    // spending a geocoding request on noise.
    if (q.length < 3) {
      setSearchNote('Type at least three characters.');
      return;
    }
    setSearching(true);
    setSearchNote('');
    setResults([]);
    try {
      const { data } = await client.get('/stores/geocode', {
        // Rank results near the shops we already have. A colony name typed on
        // its own otherwise matches whichever city the geocoder knows best.
        params: { q, ...(nearby ? { near: `${nearby[0]},${nearby[1]}` } : {}) },
      });
      setResults(data.results);
      // Absent when Nominatim answered — that path spends no Mapbox quota, so
      // the meter is left alone rather than shown a zero.
      if (data.usage) onUsage?.(data.usage);
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
    // A search result is a rooftop guess, never the shutter. It is a way to get
    // the map to the right street — the pin still has to be placed, so the
    // address it came with is offered rather than written.
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
          placeholder="Paste coordinates, or search a PIN code, road or landmark…"
          aria-label="Paste coordinates, or search for a place or PIN code"
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

      {/* No token means the map cannot draw, but the search box and the
          coordinate fields above it still work — so this says which part is
          missing rather than showing an empty grey rectangle. */}
      {token ? (
        <div ref={containerRef} className="map-canvas" />
      ) : (
        <p className="map-note map-note-warn">
          The map is unavailable — MAPBOX_PUBLIC_TOKEN is not set on the server. Search above, or
          paste coordinates from Google Maps.
        </p>
      )}

      <p className="map-note">
        {hasPin
          ? 'Tap the map to move the pin, or drag it. Zoom in until you can see the shutter.'
          : 'Tap the map where the shop is. Search above to get to the right street first.'}
        {' '}
        Have it in Google Maps? Press and hold the shop there until a pin drops, copy the numbers it
        shows, and paste them into the box above.
      </p>
    </div>
  );
}
