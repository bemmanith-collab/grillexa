import React, { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import client from '../api/client';
import { urlBase64ToUint8Array, pushSupport, permissionState } from '../lib/push';

// Turning notifications on for this device.
//
// Per device, not per account: the same person on a phone and a laptop is two
// subscriptions, and the phone is the one that matters when a shop is added.
// So the state here is read from the browser's own registration rather than
// from the user record — signing in elsewhere must not make this button claim
// notifications are on when this device has never asked.
//
// The permission prompt has to be raised from a user gesture. Asking on page
// load is both blocked by browsers and the fastest way to get denied
// permanently, and "denied" cannot be undone from script — only in browser
// settings. Hence a button, and hence the explanation when it is refused.
export default function NotificationsButton({ className = 'btn-secondary' }) {
  const support = pushSupport();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  // Reflect what this browser already has, so the button is honest after a
  // reload or on a device that subscribed weeks ago.
  useEffect(() => {
    if (!support.ok) return;
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) setEnabled(Boolean(sub) && permissionState() === 'granted');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [support.ok]);

  async function enable() {
    setBusy(true);
    setNote('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        // 'denied' is sticky and script cannot re-ask, so the only honest next
        // step is the browser's own settings.
        setNote(
          permission === 'denied'
            ? 'Notifications are blocked for this site. Turn them back on in your browser settings for this page, then try again.'
            : 'Notifications were not enabled.'
        );
        return;
      }

      const { data } = await client.get('/push/key');
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        // Required to be true by every browser that implements this: a push
        // must result in a visible notification, not silent background work.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      });

      // toJSON() is what exposes the keys — they are getters on the object
      // itself and would serialise to {} if the subscription were posted raw.
      const body = subscription.toJSON();
      await client.post('/push/subscribe', { endpoint: body.endpoint, keys: body.keys });
      setEnabled(true);
      setNote('Notifications are on for this device.');
    } catch (err) {
      setNote(
        err.response?.status === 503
          ? 'Notifications are not set up on the server yet.'
          : 'Could not turn notifications on. Try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setNote('');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        // Server first: if unsubscribing locally succeeded and the server call
        // then failed, we would keep pushing to an endpoint nobody can receive.
        await client.delete('/push/subscribe', { data: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setEnabled(false);
      setNote('Notifications are off for this device.');
    } catch (err) {
      setNote('Could not turn notifications off. Try again.');
    } finally {
      setBusy(false);
    }
  }

  // On an iPhone that has not been added to the Home Screen there is nothing
  // to offer, so say what to do rather than show a button that cannot work.
  if (!support.ok) return <p className="install-hint">{support.reason}</p>;

  return (
    <>
      <button type="button" className={className} onClick={enabled ? disable : enable} disabled={busy}>
        {enabled ? <BellOff size={16} strokeWidth={1.8} /> : <Bell size={16} strokeWidth={1.8} />}
        {busy ? 'Working…' : enabled ? 'Turn off notifications' : 'Notifications'}
      </button>
      {note && <p className="install-hint">{note}</p>}
    </>
  );
}
