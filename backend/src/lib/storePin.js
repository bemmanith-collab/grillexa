// Whether a location reading taken while somebody was billing is worth keeping
// as a store's pin.
//
// Billing is the one moment we know a phone is physically inside the shop, so
// it is the best free source of coordinates we have — six stores have sales and
// no pin at all, and every location question the growth tools ask is answered
// from that gap. But a reading taken indoors is exactly the reading most likely
// to be wifi-derived and kilometres out, and a wrong pin is worse than no pin:
// it looks identical to a real one once saved and sends drivers to the wrong
// road forever. So the rules below are deliberately stingy. Rejecting a fix
// costs nothing — there is another bill along in an hour.
//
// Pure, and separate from the route, so the rule can be checked without a
// database or a browser. See test/storePin.js.

// Mirrors ACCURACY_GOOD_M in frontend/src/lib/storeLinks.js. Duplicated rather
// than shared because the two run in different processes with no build step
// between them; if you move one, move the other. Below this is a genuine GNSS
// fix. Above it, on a dense street, is a guess off wifi or a cell tower.
const ACCEPT_ACCURACY_M = 65;

// Mirrors ACCURACY_PERFECT_M. At or under this the hardware has nothing left to
// give, so there is no reason to ask a phone for another reading.
const PERFECT_ACCURACY_M = 15;

/**
 * Should we ask this store's next bill for a location fix?
 *
 * Answering false is what keeps this invisible: the browser only prompts for
 * permission on a page that actually calls for a position, so a store with a
 * pin we cannot beat never triggers one.
 */
function wantsPin(store) {
  // Never located. This is the case that matters — it is every store the
  // growth tools currently cannot see.
  if (store.lat == null || store.lng == null) return true;
  // A person put this here on purpose, possibly to correct a bad guess.
  if (store.pinSource === 'MANUAL') return false;
  // Guessed from an address string. It may be the middle of a neighbourhood
  // rather than the shutter, and nothing measured how far off it is — so any
  // fix good enough to pass the gate is worth more than this.
  if (store.pinSource === 'GEOCODED') return true;
  // Legacy rows carry no source, so accuracy decides as it always did: a null
  // there was only ever written by the hand-placed path.
  if (store.accuracyM == null) return false;
  // A measured pin that could still get tighter.
  return store.accuracyM > PERFECT_ACCURACY_M;
}

/**
 * Given the store as it stands and a fix off a phone, decide whether to write.
 * Returns { save, reason } — reason is for the server log, so a pin that never
 * appears can be explained without guessing.
 */
function shouldSavePin(store, fix) {
  // No accuracy figure at all: this did not come from a sensor, or came from
  // one that would not say how sure it was. Either way it is unverifiable.
  if (!Number.isFinite(fix.accuracyM) || fix.accuracyM <= 0) {
    return { save: false, reason: 'no-accuracy' };
  }
  // The whole point of the gate. Fair and poor tiers are dropped on the floor.
  if (fix.accuracyM > ACCEPT_ACCURACY_M) {
    return { save: false, reason: 'too-coarse' };
  }
  if (store.lat == null || store.lng == null) {
    return { save: true, reason: 'first-pin' };
  }
  if (store.pinSource === 'MANUAL') {
    return { save: false, reason: 'hand-placed' };
  }
  // A measured fix beats an address guess outright — there is no accuracy on
  // the guess to compare against, and standing in the shop beats a rooftop.
  if (store.pinSource === 'GEOCODED') {
    return { save: true, reason: 'replaces-geocoded' };
  }
  if (store.accuracyM == null) {
    return { save: false, reason: 'hand-placed' };
  }
  // Strictly better, so an equal reading does not churn the row on every bill.
  if (fix.accuracyM < store.accuracyM) {
    return { save: true, reason: 'improved' };
  }
  return { save: false, reason: 'not-better' };
}

/**
 * What to record as the source for a pin arriving through the Stores page,
 * where the same fields carry both a GPS capture and a pin someone dropped on
 * the map or typed in. The presence of a sensor's accuracy figure is what
 * separates them, and it is the only thing that ever has.
 *
 * Returns null when the request carried no pin at all, so a PATCH that only
 * renames a store leaves the existing source alone.
 */
function sourceFor(coords) {
  if (coords.lat == null || coords.lng == null) return null;
  return coords.accuracyM == null ? 'MANUAL' : 'GPS';
}

module.exports = { wantsPin, shouldSavePin, sourceFor, ACCEPT_ACCURACY_M, PERFECT_ACCURACY_M };
