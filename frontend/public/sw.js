// Deliberately network-only. This app writes bills and settlements, and a
// cached page showing yesterday's consignments as if they were current is
// worse than a plain "no connection" error — the staff member would settle
// against stale numbers and never know.
//
// It exists so Chrome treats the site as installable and generates a real
// WebAPK on the device. Do not add a cache here without deciding, per route,
// what a stale copy would cost.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// No respondWith: every request falls through to the network exactly as it
// would without a service worker. Chrome only needs the handler to be present.
self.addEventListener('fetch', () => {});

// Push notifications. These cache nothing, so the network-only rule above
// still holds — a notification is a message, not a stored copy of a page.
//
// The payload is JSON sent by backend/src/lib/push.js. It is wrapped in
// try/catch because a push with no body, or a malformed one, must still show
// *something*: a notification that fails to render is a silent lost message,
// and the browser will eventually stop honouring pushes we never display.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = {};
  }
  const title = data.title || 'Grillexa';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Same tag collapses repeats of the same event into one notification
      // rather than stacking them on the lock screen.
      tag: data.tag || 'grillexa',
      data: { url: data.url || '/' },
    })
  );
});

// Focus an open tab rather than opening a second one. Someone with Grillexa
// already open should be taken to the store, not handed a duplicate app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          // navigate() can reject on a cross-origin client; focusing is the
          // part that matters, so never let the navigation failure swallow it.
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
