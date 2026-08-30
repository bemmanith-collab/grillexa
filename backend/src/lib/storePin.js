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

// The widest reading still allowed to become a pin.
//
// WAS 65m, mirroring ACCURACY_GOOD_M in frontend/src/lib/storeLinks.js — the
// threshold that separates a genuine GNSS fix from a guess off wifi or a cell
// tower. That is the right question for "is this reading real", and the wrong
// one for "is this reading precise enough to pin a shutter". A 65m pin lands
// anywhere on the block.
//
// Now 5m, because that is the bar the pins are actually held to. Be aware what
// it costs: on this network the best captures ever recorded are 20-23m, so at
// 5m nothing captured so far would have qualified, and a phone billing INSIDE a
// shop will very rarely clear it — indoor multipath is the worst case for GNSS.
// A store pinned to 5m in practice gets there from somebody standing outside at
// the shutter, or from a pin placed by hand on satellite imagery, which beats
// consumer GNSS outright.
//
// Tunable, so the bar can be relaxed without a deploy if it turns out to be
// starving the map rather than protecting it.
const ACCEPT_ACCURACY_M =
  Number(process.env.STORE_PIN_MAX_ACCURACY_M) > 0 ? Number(process.env.STORE_PIN_MAX_ACCURACY_M) : 5;

// At or under this, stop asking a phone for another reading. Equal to the
// accept bar: anything coarser is not kept, so there is nothing to improve on
// by settling earlier.
const PERFECT_ACCURACY_M = ACCEPT_ACCURACY_M;

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

// ---------------------------------------------------------------------------
// Is a geocoded point plausible at all?
//
// WHY THIS EXISTS: without it, 13 of 13 pins written from addresses were wrong
// — median 8.5km from where the shops actually are, worst 14.1km, not one
// within 2km. Three different stores whose address read "Sbi colony" all
// resolved to the same arbitrary point, and two reading "Ntr nagar" to another.
//
// The addresses here are landmark micro-strings — "Varalakshmi tiffin line",
// "Gowtam model school Line", "Opp to max vision". No geocoder holds these.
// What a geocoder does instead is return its most confident match for the
// fragment it *can* parse, somewhere in a 650km² city, and that answer looks
// exactly like a correct one once written to the row.
//
// So this does not try to make the lookup smarter. It checks the answer against
// the one thing we actually know: where staff phones have stood inside these
// shops. A result far from every such pin is thrown away, and the store is left
// unpinned for the GPS path to fill properly.

const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// How good a reading has to be to ANCHOR the plausibility test below — a much
// looser question than whether it is precise enough to be a pin, and the two
// must not share a number. A 20m fix is nowhere near the 5m bar for storing a
// pin, but it says which part of the city these shops are in to well inside a
// metre of what a 2km test needs. Tying anchoring to ACCEPT_ACCURACY_M instead
// threw away all five real pins on this network the moment the bar moved to 5m,
// which would have disabled the check entirely and silently.
//
// 65m is the old ACCURACY_GOOD_M line: below it a reading is a genuine GNSS
// fix, above it a guess off wifi or a cell tower. That is exactly the right
// question here.
const ANCHOR_ACCURACY_M = 65;

/**
 * The pins worth measuring against: a phone that reported a believable accuracy
 * while standing in the shop, or a point a person placed by hand.
 *
 * Deliberately excludes GEOCODED — judging a guess against other guesses is how
 * one bad pin recruits the next. It also excludes the coarse GPS rows written
 * before any gate existed (two of them sit at ±2000m), because a 2km-wide
 * reading cannot anchor a 2km test.
 */
function trustedPins(stores) {
  return stores.filter(
    (s) =>
      s.lat != null &&
      s.lng != null &&
      (s.pinSource === 'MANUAL' ||
        (s.pinSource === 'GPS' && s.accuracyM != null && s.accuracyM <= ANCHOR_ACCURACY_M))
  );
}

// How far a geocoded point may sit from the nearest trusted pin. Two kilometres
// because the trusted pins on this network span 1.4km end to end, so 2km covers
// the trading area with margin while still rejecting every one of the 13 wrong
// pins that prompted this. Tunable, because a network spread across a district
// rather than a few adjoining colonies needs a wider figure — and a number that
// cannot be raised is one somebody works around by turning the check off.
const DEFAULT_MAX_KM = 2;

/**
 * Whether to write this geocoder hit. Pure — see test/storePin.js.
 *
 * FAILS CLOSED with no trusted pin to judge against. That direction is the
 * whole point: the ungated version had nothing to compare with either, and it
 * wrote thirteen confident wrong answers. Somebody placing one pin by hand, or
 * one bill rung up inside a shop with location on, is what opens this.
 */
function acceptGeocode(hit, trusted, maxKm = DEFAULT_MAX_KM) {
  if (!hit || !Number.isFinite(hit.lat) || !Number.isFinite(hit.lng)) {
    return { accept: false, reason: 'no-coordinates', km: null };
  }
  if (!trusted.length) {
    return { accept: false, reason: 'nothing-to-check-against', km: null };
  }
  const km = Math.min(...trusted.map((p) => haversineKm(hit, p)));
  if (km > maxKm) return { accept: false, reason: 'too-far', km };
  return { accept: true, reason: 'plausible', km };
}

module.exports = {
  wantsPin,
  shouldSavePin,
  sourceFor,
  haversineKm,
  trustedPins,
  acceptGeocode,
  ACCEPT_ACCURACY_M,
  PERFECT_ACCURACY_M,
  DEFAULT_MAX_KM,
  ANCHOR_ACCURACY_M,
};
