// A CSS custom property that is never defined resolves to nothing, and the rule
// it was in silently does nothing.
//
// The pinned-message bar shipped with `background: var(--gold-soft)`. That token
// exists in an unreleased palette but not in the one on main, so in production
// the bar had no background at all — dark page showing through dark text, with
// the launch announcement sitting in it unreadable. Nothing failed: the build
// does not resolve custom properties, and a browser check passed because it ran
// against a working copy where the token did exist.
//
// Same shape as the transparent chat panel before it, which used --surface from
// outside the element that defined it.
//
// Run: npm test (from frontend/).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = new URL('../src/index.css', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const css = readFileSync(CSS, 'utf8');

function check(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}\n     ${err.message}`);
    process.exitCode = 1;
  }
}

/** Every `--name:` declaration — wherever it is declared. */
function declared(source) {
  return new Set([...source.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
}

/** Every `var(--name)` reference, ignoring any that supply a fallback. */
function used(source) {
  const out = new Map();
  // var(--x) with no comma: no fallback, so an undefined token means nothing
  // renders. var(--x, something) is fine by construction.
  for (const m of source.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
    const line = source.slice(0, m.index).split('\n').length;
    if (!out.has(m[1])) out.set(m[1], line);
  }
  return out;
}

check('every custom property used without a fallback is defined', () => {
  const have = declared(css);
  const missing = [...used(css)].filter(([name]) => !have.has(name));
  assert.deepEqual(
    missing.map(([name, line]) => `index.css:${line} uses ${name}, which is never defined`),
    []
  );
});

check('the checker spots a missing token and ignores a fallback', () => {
  // Guards the guard: the first two attempts at this kind of check in this repo
  // both passed on the very file that was broken.
  const broken = ':root { --a: red; }\n.x { background: var(--b); }';
  assert.deepEqual([...used(broken)].map(([n]) => n), ['--b']);
  assert.equal(declared(broken).has('--b'), false, 'so it would be reported');

  const withFallback = ':root { --a: red; }\n.x { background: var(--b, pink); }';
  assert.deepEqual([...used(withFallback)].map(([n]) => n), [], 'a fallback is not a failure');

  const fine = ':root { --a: red; }\n.x { color: var(--a); }';
  const have = declared(fine);
  assert.deepEqual([...used(fine)].filter(([n]) => !have.has(n)), []);
});
