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
