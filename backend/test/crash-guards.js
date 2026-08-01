// Regression check for the crash class fixed alongside this file: a request
// body with a non-string where a string was assumed used to throw inside
// Prisma/bcrypt, and Express 4 turns an unhandled rejection in an async
// handler into process exit — an unauthenticated DoS.
//
// Run: npm test (from backend/). No database needed: every case here must be
// rejected by validation before anything touches Prisma.
const assert = require('assert');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { normalizeDate, todayStr } = require('../src/lib/stock');
const app = require('../src/app');

function check(name, fn) {
  return fn().then(
    () => console.log(`ok   ${name}`),
    (err) => {
      console.error(`FAIL ${name}\n     ${err.message}`);
      process.exitCode = 1;
    }
  );
}

// normalizeDate is called with raw query/body values in several routes with no
// try/catch, so it must throw a 400-shaped error rather than a bare Error.
function testNormalizeDate() {
  for (const bad of ['', 'not-a-date', undefined, null, 5, {}]) {
    assert.throws(
      () => normalizeDate(bad),
      (err) => err.status === 400,
      `normalizeDate(${JSON.stringify(bad)}) should throw with status 400`
    );
  }
  assert.strictEqual(normalizeDate('2026-07-30').toISOString(), '2026-07-30T00:00:00.000Z');
}

// todayStr feeds normalizeDate directly wherever a route has no date in the
// request (the wastage endpoint, /reports/summary). It was briefly built on
// toLocaleDateString('en-CA'), which returns ISO on a full-ICU Node and
// US-style "7/30/2026" on the deployed image — 400ing those endpoints in
// production while every local test passed. Assert the shape, not the locale.
function testTodayStr() {
  const t = todayStr();
  assert.match(t, /^\d{4}-\d{2}-\d{2}$/, `todayStr() must be YYYY-MM-DD, got ${JSON.stringify(t)}`);
  assert.doesNotThrow(() => normalizeDate(t), 'todayStr() must be parseable by normalizeDate');
  // Within a day of the server's own UTC date — catches a wrong offset sign.
  const utcDay = new Date().toISOString().slice(0, 10);
  assert.ok(
    Math.abs(Date.parse(t) - Date.parse(utcDay)) <= 86400000,
    `todayStr() ${t} is more than a day from UTC ${utcDay}`
  );
}

async function main() {
  testNormalizeDate();
  console.log('ok   normalizeDate rejects bad input with status 400');
  testTodayStr();
  console.log('ok   todayStr is ISO and round-trips through normalizeDate');

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const post = (path, body) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  // Each of these previously reached Prisma or bcrypt with a non-string and
  // exited the process. A 400 proves validation caught it first; the run
  // reaching the end proves the server survived.
  const cases = [
    ['login with a numeric email', '/api/auth/login', { email: 5, password: 'x' }],
    ['login with an object password', '/api/auth/login', { email: 'a@b.c', password: {} }],
    ['login with a missing body', '/api/auth/login', {}],
    ['change-password with a null current', '/api/auth/change-password', { currentPassword: null, newPassword: 'abcdefgh' }],
  ];

  for (const [name, path, body] of cases) {
    await check(name, async () => {
      const res = await post(path, body);
      // change-password sits behind authenticate, so 401 (no token) is also a
      // pass there — the point is that it answered at all.
      assert.ok([400, 401].includes(res.status), `expected 400/401, got ${res.status}`);
      const json = await res.json();
      assert.ok(json.error, 'expected a JSON error body');
      assert.ok(
        !/prisma|invocation|Argument/i.test(json.error),
        `error leaks internals: ${json.error}`
      );
    });
  }

  // Public signup was removed — anyone who found the URL could mint a token.
  // Asserted here so a future refactor can't quietly restore it.
  await check('public signup is gone', async () => {
    const res = await post('/api/auth/signup', { name: 'A', email: 'a@b.c', password: 'abcdefgh' });
    assert.strictEqual(res.status, 404, 'signup must not exist');
  });

  // The session moved from localStorage to an httpOnly cookie. These two hold
  // that line: a readable token, or a logout the server does not honour, would
  // both quietly undo it.
  await check('logout clears the session cookie, httpOnly and server-side', async () => {
    const res = await post('/api/auth/logout', {});
    assert.strictEqual(res.status, 200);
    const setCookie = res.headers.get('set-cookie') || '';
    assert.match(setCookie, /grillexa_session=/, 'must clear the session cookie');
    assert.match(setCookie, /HttpOnly/i, 'the cookie must stay unreadable by scripts');
  });

  await check('an unauthenticated request is refused without a cookie', async () => {
    const res = await fetch(`${base}/api/auth/me`);
    assert.strictEqual(res.status, 401);
    const json = await res.json();
    assert.ok(json.error, 'expected a JSON error body');
    assert.ok(!/token|jwt|bearer/i.test(json.error), `must not hint at the mechanism: ${json.error}`);
  });

  await check('server is still alive after all of the above', async () => {
    const res = await fetch(`${base}/api/health`);
    assert.strictEqual(res.status, 200);
  });

  server.close();
}

main().then(() => {
  console.log(process.exitCode ? '\nFAILED' : '\nall checks passed');
});
