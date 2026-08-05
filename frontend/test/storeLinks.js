// The Directions and Call links. A wrong maps URL sends a delivery to the
// wrong end of the city, and neither failure shows up as an error — the link
// just opens somewhere plausible.
//
// Run: npm test (from frontend/).

import assert from 'node:assert/strict';
import { directionsUrl, telHref, hasPin, formatPin } from '../src/lib/storeLinks.js';

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
