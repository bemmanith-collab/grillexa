// Turning browser notifications on and off for this device.
//
// Three separate things have to be true before a notification can arrive, and
// they fail in different ways: the browser must support push at all, the user
// must grant permission, and the device must be registered with our server.
// pushSupport() reports the first, so the UI can explain rather than show a
// button that does nothing.

// The VAPID public key travels as base64url in JSON, and the browser wants a
// Uint8Array. base64url swaps + / for - _ and drops the padding, so all three
// have to be put back before atob will accept it.
//
// Getting this wrong does not throw — it produces a key of the wrong bytes,
// the subscribe call fails with an opaque InvalidAccessError, and there is
// nothing on screen to say why. Hence the test.
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

// iOS is the reason this is not a one-liner: Safari only exposes PushManager
// when the app has been installed to the home screen (16.4+), so on an iPhone
// browsing the site normally, notifications are genuinely unavailable and the
// honest answer is to say so rather than offer a button that cannot work.
export function pushSupport() {
  if (!('serviceWorker' in navigator)) return { ok: false, reason: 'This browser does not support notifications.' };
  if (!('PushManager' in window)) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    return {
      ok: false,
      reason: isIOS
        ? 'On iPhone, notifications work only once Grillexa is added to the Home Screen: tap Share, then "Add to Home Screen", and open it from there.'
        : 'This browser does not support notifications.',
    };
  }
  if (!('Notification' in window)) return { ok: false, reason: 'This browser does not support notifications.' };
  return { ok: true, reason: '' };
}

export function permissionState() {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}
