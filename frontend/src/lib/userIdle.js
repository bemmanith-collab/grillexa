// Is anybody actually there?
//
// Every poll in the app is already gated on document.visibilityState, which
// covers the phone in a pocket. It does not cover the other case: the app left
// open and forgotten on a counter tablet, foregrounded and untouched for hours.
// Those polls keep the database's compute awake, and Neon bills by the hour it
// is awake rather than by the query — so a forgotten tab on a 60-second timer
// costs a full day of compute to answer a question nobody asked.
//
// Five minutes because that is Neon's own scale-to-zero window: any shorter and
// the database never gets to sleep, any longer and we pay for the difference.
// The trade-off is that a thread stared at for five minutes without a touch
// stops updating until it is touched — which is what web push is for, and one
// scroll or tap brings it straight back.

const IDLE_AFTER_MS = 5 * 60 * 1000;

let lastSeen = Date.now();

function note() {
  lastSeen = Date.now();
}

// Registered at import, so this listener always runs before the pollers that
// import it register theirs — coming back to the app marks us active before
// anything checks.
if (typeof window !== 'undefined') {
  for (const event of ['pointerdown', 'keydown', 'scroll', 'focus', 'visibilitychange']) {
    window.addEventListener(event, note, { passive: true });
  }
}

/** True when nobody has touched the app for long enough that the database may
 *  as well go to sleep. `now` is injectable so this is testable. */
export function isIdle(now = Date.now()) {
  return now - lastSeen >= IDLE_AFTER_MS;
}

/** Only for the tests and for code that knows the user is present. */
export function markActive() {
  note();
}

export { IDLE_AFTER_MS };
