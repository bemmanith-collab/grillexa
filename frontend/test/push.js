import assert from 'node:assert/strict';
import { urlBase64ToUint8Array } from '../src/lib/push.js';

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log('ok  ', name);
  } catch (err) {
    failures += 1;
    console.error('FAIL', name, '\n     ', err.message);
  }
}

check('a real VAPID key decodes to the 65 bytes the browser expects', () => {
  // An uncompressed P-256 public key: 0x04 followed by two 32-byte coordinates.
  // Every VAPID public key is this shape, so the length is the whole assertion —
  // a wrong conversion yields a differently sized array, never an exception.
  const key = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
  const bytes = urlBase64ToUint8Array(key);
  assert.equal(bytes.length, 65);
  assert.equal(bytes[0], 0x04);
});

check('base64url characters are translated, not passed through', () => {
  // '-' and '_' are base64url's stand-ins for '+' and '/'. Left untranslated
  // they decode to different bytes — which is the silent failure this guards:
  // the subscribe call fails with an opaque InvalidAccessError and nothing
  // on screen says why.
  assert.deepEqual(
    Array.from(urlBase64ToUint8Array('-_-_')),
    Array.from(urlBase64ToUint8Array('+/+/'))
  );
});

check('missing padding is restored for every remainder', () => {
  // A length that is 2 or 3 past a multiple of 4 needs padding put back before
  // atob will accept it. A key that happens to land on one of those lengths is
  // the one that breaks in production.
  assert.equal(urlBase64ToUint8Array('QQ').length, 1);
  assert.equal(urlBase64ToUint8Array('QUI').length, 2);
  assert.equal(urlBase64ToUint8Array('QUJD').length, 3);
});

process.exit(failures === 0 ? 0 : 1);
