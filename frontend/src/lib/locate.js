// Getting a trustworthy position out of a phone.
//
// Extracted from the Stores page so the automatic capture on billing uses the
// same watcher rather than a second, worse one. The tuning below was worked out
// against real captures on real streets; a plain getCurrentPosition somewhere
// else in the app would quietly undo all of it.

import { ACCURACY_PERFECT_M } from './storeLinks.js';

// How long to keep hunting for a perfect fix before settling for the best one
// seen. Long enough for a cold GNSS start on a street where the sky is a strip
// between two buildings — which is most of them here.
export const WATCH_MS = 25000;

// The stall guard. A phone on a weak network goes quiet without ever calling
// the error handler, and a silent watch would otherwise spin to the full
// WATCH_MS. Re-armed on EVERY reading — it detects silence, not a plateau: a
// stream that keeps delivering 20m readings keeps hunting for 5m until
// WATCH_MS, which is the whole point of the loop.
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
 * Watch until the fix is perfect (≤ ACCURACY_PERFECT_M) or the clock runs out,
 * then resolve {lat, lng, accuracyM, locked}. `locked` is true for a perfect
 * fix and false when the watch timed out and this is merely the best seen —
 * the caller uses it to decide whether the point is good enough to name a
 * street from. Rejects with an Error whose message is already a sentence for a
 * person, or with an Error named 'AbortError' if `signal` fired.
 *
 * watchPosition, not getCurrentPosition. The FIRST fix a phone returns is
 * usually the cheap one — wifi or cell, hundreds of metres out, sometimes
 * kilometres — and the true GNSS fix arrives seconds later. Taking the first
 * reading is what puts a store on the wrong road. So: watch, keep the most
 * accurate reading seen, and clear the watch the instant it is perfect.
 *
 * The loop never settles early on a "good" 20m or 65m reading. A capture that
 * did so returned a fix the server rejects as too coarse for a billing pin,
 * and the person had already walked off. It keeps listening until the hardware
 * produces 5m, the stream goes quiet, or WATCH_MS passes — whichever is first.
 *
 * onProgress is optional and receives the best accuracy so far, for a caller
 * with somewhere to show it. signal is optional: the page passes one so an
 * unmount, or a second tap, stops the GPS chip instead of leaving it running
 * for a promise nobody is waiting on. The automatic capture on billing passes
 * neither. maxMs/stallMs exist for the test; callers take the defaults.
 */
export function captureFix({ onProgress, signal, maxMs = WATCH_MS, stallMs = STALL_MS } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This browser cannot report a location. Type the address or coordinates below.'));
      return;
    }
    if (signal?.aborted) return reject(abortError());

    let best = null;
    let done = false;
    let stall = null;

    // The ceiling: a phone that never gets a clean fix — deep indoors, where 5m
    // is physically impossible — still hands back the best it managed rather
    // than spinning, and the UI never hangs on the promise.
    const maxTimer = setTimeout(finish, maxMs);
    signal?.addEventListener('abort', onAbort, { once: true });

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (done) return;
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        onProgress?.(best.coords.accuracy);
        // Open sky: this is as good as the hardware gets. Clear the watch now,
        // not after a settle pause — every extra second is the GPS chip on.
        if (best.coords.accuracy <= ACCURACY_PERFECT_M) return finish();
        clearTimeout(stall);
        stall = setTimeout(finish, stallMs);
      },
      (err) => {
        if (done) return;
        // Permission revoked or the fix lost mid-stream after a usable
        // reading: that is the timeout fallback arriving early, not a
        // failure — keep what we have.
        if (best) return finish();
        done = true;
        stop();
        reject(new Error(geoMessage(err)));
      },
      { enableHighAccuracy: true, timeout: maxMs, maximumAge: 0 }
    );

    // Everything the loop holds, released in one place: both timers, the
    // abort listener and the watch itself, which is what actually powers the
    // chip down. Idempotent, because finish and onAbort can race.
    function stop() {
      clearTimeout(maxTimer);
      clearTimeout(stall);
      signal?.removeEventListener('abort', onAbort);
      navigator.geolocation.clearWatch(watchId);
    }

    function onAbort() {
      if (done) return;
      done = true;
      stop();
      reject(abortError());
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
      resolve({ lat, lng, accuracyM: Math.round(accuracy), locked: accuracy <= ACCURACY_PERFECT_M });
    }
  });
}

function abortError() {
  const err = new Error('Location capture was cancelled.');
  err.name = 'AbortError';
  return err;
}
