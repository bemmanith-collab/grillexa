// Getting a trustworthy position out of a phone.
//
// Extracted from the Stores page so the automatic capture on billing uses the
// same watcher rather than a second, worse one. The tuning below was worked out
// against real captures on real streets; a plain getCurrentPosition somewhere
// else in the app would quietly undo all of it.

import { ACCURACY_GOOD_M, ACCURACY_PERFECT_M } from './storeLinks';

// How long to keep watching for a better fix before settling for the best one
// seen. Long enough for a cold GNSS start on a street where the sky is a strip
// between two buildings — which is most of them here.
export const WATCH_MS = 25000;

// The watch rarely runs the full 25s, because readings stop improving long
// before they stop arriving. These settle it once that happens: a short pause
// after a usable fix in case a better one is right behind it, and a longer one
// for a fix still too coarse to keep. The second doubles as the stall guard —
// a phone on a weak network goes quiet without ever calling the error handler,
// and a silent watch would otherwise spin to the full WATCH_MS.
export const SETTLE_MS = 2500;
export const STALL_MS = 8000;

// getCurrentPosition's error codes, in the words of someone holding the phone.
// A denial is the common one and is not a failure — the address can always be
// typed, so it reads as a redirection rather than an error.
export function geoMessage(err) {
  if (err.code === 1) return 'Location permission was denied. Allow it in your browser settings, or type the address below.';
  if (err.code === 2) return "Couldn't get a fix — try stepping outside, or type the address below.";
  if (err.code === 3) return 'Locating timed out. Try again, or type the address below.';
  return 'Location is unavailable. Type the address below.';
}

/**
 * Watch until the fix stops improving, then resolve {lat, lng, accuracyM}.
 * Rejects with an Error whose message is already a sentence for a person.
 *
 * watchPosition, not getCurrentPosition. The FIRST fix a phone returns is
 * usually the cheap one — wifi or cell, hundreds of metres out, sometimes
 * kilometres — and the true GNSS fix arrives seconds later. Taking the first
 * reading is what puts a store on the wrong road. So: watch, keep the most
 * accurate reading seen, and stop early once it is good enough.
 *
 * onProgress is optional and receives the best accuracy so far, for a caller
 * with somewhere to show it. The automatic capture on billing passes nothing.
 */
export function captureFix({ onProgress } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This browser cannot report a location. Type the address or coordinates below.'));
      return;
    }

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
        onProgress?.(best.coords.accuracy);
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
        reject(new Error(geoMessage(err)));
      },
      { enableHighAccuracy: true, timeout: WATCH_MS, maximumAge: 0 }
    );

    function stop() {
      clearTimeout(maxTimer);
      clearTimeout(settle);
      navigator.geolocation.clearWatch(watchId);
    }

    function finish() {
      if (done) return;
      done = true;
      stop();
      if (!best) {
        reject(new Error("Couldn't get a fix — type the address or coordinates below."));
        return;
      }
      const { latitude: lat, longitude: lng, accuracy } = best.coords;
      resolve({ lat, lng, accuracyM: Math.round(accuracy) });
    }
  });
}
