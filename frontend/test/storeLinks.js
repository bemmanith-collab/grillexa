// The Directions and Call links. A wrong maps URL sends a delivery to the
// wrong end of the city, and neither failure shows up as an error — the link
// just opens somewhere plausible.
//
// Run: npm test (from frontend/).

import assert from 'node:assert/strict';
import {
  directionsUrl,
  telHref,
  hasPin,
  formatPin,
  parseCoordInput,
  coordError,
  accuracyTier,
  formatAccuracy,
  accuracyLabel,
  accuracyBadge,
  mapsPickUrl,
} from '../src/lib/storeLinks.js';

function check(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}\n     ${err.message}`);
    process.exitCode = 1;
  }
}

const pinned = { name: 'Anna Nagar', address: '2nd Ave, Chennai', lat: 13.0878, lng: 80.2103 };

check('a pinned store navigates to the exact coordinates', () => {
  assert.equal(
    directionsUrl(pinned),
    'https://www.google.com/maps/dir/?api=1&destination=13.0878,80.2103'
  );
});

check('a store with no pin falls back to a name and address search', () => {
  assert.equal(
    directionsUrl({ name: 'Anna Nagar', address: '2nd Ave, Chennai' }),
    'https://www.google.com/maps/dir/?api=1&destination=Anna%20Nagar%202nd%20Ave%2C%20Chennai'
  );
  assert.equal(directionsUrl({ name: 'Adyar' }), 'https://www.google.com/maps/dir/?api=1&destination=Adyar');
});

check('half a pin is no pin — it must never be sent as a coordinate', () => {
  for (const half of [{ lat: 13.08 }, { lng: 80.21 }, { lat: 13.08, lng: null }, { lat: null, lng: 80.21 }]) {
    const store = { name: 'Adyar', ...half };
    assert.equal(hasPin(store), false);
    assert.ok(directionsUrl(store).endsWith('destination=Adyar'), JSON.stringify(half));
  }
});

check('zero is a real coordinate, not a missing one', () => {
  assert.equal(hasPin({ lat: 0, lng: 0 }), true);
  assert.equal(directionsUrl({ name: 'Null Island', lat: 0, lng: 0 }), 'https://www.google.com/maps/dir/?api=1&destination=0,0');
});

check('a store with neither pin nor name yields no link at all', () => {
  assert.equal(directionsUrl({}), '');
  assert.equal(directionsUrl(null), '');
});

check('the pin reads back to six places', () => {
  assert.equal(formatPin(pinned), '13.087800, 80.210300');
  assert.equal(formatPin({}), '');
});

check('phone numbers dial through punctuation, and keep a leading +', () => {
  assert.equal(telHref('+91 98765 43210'), 'tel:+919876543210');
  assert.equal(telHref('044-2345-6789'), 'tel:04423456789');
  assert.equal(telHref('(044) 2345 6789'), 'tel:04423456789');
});

check('nothing dialable means no Call button', () => {
  assert.equal(telHref(''), '');
  assert.equal(telHref(null), '');
  assert.equal(telHref('n/a'), '');
  assert.equal(telHref('12345'), '');
});

// --- Coordinates typed or pasted by hand, and how much to trust a fix ---

check('a pair pasted from Google Maps lands in both fields', () => {
  assert.deepEqual(parseCoordInput('13.0878, 80.2103'), { lat: 13.0878, lng: 80.2103 });
  assert.deepEqual(parseCoordInput('13.0878,80.2103'), { lat: 13.0878, lng: 80.2103 });
  assert.deepEqual(parseCoordInput('  13.0878 , 80.2103  '), { lat: 13.0878, lng: 80.2103 });
  assert.deepEqual(parseCoordInput('(13.0878, 80.2103)'), { lat: 13.0878, lng: 80.2103 });
});

check('southern and western hemispheres survive the paste', () => {
  assert.deepEqual(parseCoordInput('-33.8688, 151.2093'), { lat: -33.8688, lng: 151.2093 });
  assert.deepEqual(parseCoordInput('40.7128, -74.0060'), { lat: 40.7128, lng: -74.006 });
});

check('a lone number is just that field', () => {
  assert.deepEqual(parseCoordInput('13.0878'), { lat: 13.0878 });
  assert.deepEqual(parseCoordInput('-13'), { lat: -13 });
});

check('nothing usable parses to nothing', () => {
  for (const junk of ['', '   ', 'abc', null, undefined]) assert.equal(parseCoordInput(junk), null);
});

check('a transposed or out-of-range pair is caught at the keyboard', () => {
  assert.equal(coordError(13.0878, 80.2103), '');
  assert.equal(coordError(null, null), '');
  assert.match(coordError(80.2103, 200), /Longitude/);
  assert.match(coordError(91, 80), /Latitude/);
  assert.match(coordError(13.0878, null), /both/);
});

check('accuracy tiers separate a GPS fix from a wifi guess', () => {
  assert.equal(accuracyTier(8), 'good');
  assert.equal(accuracyTier(50), 'good');
  assert.equal(accuracyTier(51), 'fair');
  assert.equal(accuracyTier(500), 'fair');
  assert.equal(accuracyTier(3000), 'poor');
  assert.equal(accuracyTier(null), 'unknown');
  assert.equal(accuracyTier(0), 'unknown');
});

check('accuracy reads in the unit a person would say it in', () => {
  assert.equal(formatAccuracy(8.4), '±8m');
  assert.equal(formatAccuracy(950), '±950m');
  assert.equal(formatAccuracy(3200), '±3.2km');
  assert.equal(formatAccuracy(null), '');
});

check('the accuracy label names the tier and says what to do about it', () => {
  assert.equal(accuracyLabel(9), 'GPS accuracy: ±9m (good)');
  assert.equal(accuracyLabel(240), 'GPS accuracy: ±240m (fair — check the address)');
  assert.equal(accuracyLabel(2000), 'GPS accuracy: ±2.0km (poor — step outside)');
  assert.equal(accuracyLabel(null), '');
});

check('the row badge is the short form of the same thing', () => {
  assert.equal(accuracyBadge(9), '±9m good');
  assert.equal(accuracyBadge(2000), '±2.0km poor');
  assert.equal(accuracyBadge(null), '');
});

check('the Maps escape hatch centres on a rough pin, or searches the address', () => {
  assert.equal(mapsPickUrl({ lat: 13.05, lng: 80.19 }), 'https://www.google.com/maps/@13.05,80.19,19z');
  assert.equal(
    mapsPickUrl({ name: 'Adyar', address: 'LB Road, Chennai' }),
    'https://www.google.com/maps/search/?api=1&query=Adyar%20LB%20Road%2C%20Chennai'
  );
  assert.equal(mapsPickUrl({}), '');
});
