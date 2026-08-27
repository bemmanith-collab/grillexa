// An icon import must not shadow something the same file then calls with `new`.
//
// `import { Map } from 'lucide-react'` binds Map to a forwardRef object for the
// whole module, so a `new Map()` further down constructs an icon instead of a
// hash and throws "is not a constructor" — in production only, at render, and
// the whole page dies behind the route error boundary. It took the Stores page
// down: the icon had been imported for months and the `new Map()` arrived later,
// so neither change looked wrong on its own.
//
// Checked against the source rather than by rendering, because a lucide icon
// name colliding with a global is invisible until the two meet in one file.
//
// Run: npm test (from frontend/).

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function check(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}\n     ${err.message}`);
    process.exitCode = 1;
  }
}

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.jsx?$/.test(entry) ? [path] : [];
  });
}

// The names a file binds from lucide-react, after any `as` rename — `Map as
// MapIcon` binds MapIcon, which collides with nothing.
function lucideBindings(source) {
  const match = source.match(/import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"]/);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((part) => part.trim().split(/\s+as\s+/).pop().trim())
    .filter(Boolean);
}

check('no lucide icon is imported under a name the same file constructs', () => {
  const offenders = [];
  for (const file of sourceFiles(new URL('../src', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))) {
    const source = readFileSync(file, 'utf8');
    for (const name of lucideBindings(source)) {
      if (new RegExp(`\\bnew\\s+${name}\\s*\\(`).test(source)) {
        offenders.push(`${file}: imports ${name} from lucide-react and calls new ${name}()`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

check('the binding reader survives renames, newlines and no lucide import', () => {
  assert.deepEqual(lucideBindings("import { Map as MapIcon, Search } from 'lucide-react';"), [
    'MapIcon',
    'Search',
  ]);
  assert.deepEqual(lucideBindings("import {\n  Map,\n  Phone,\n} from 'lucide-react';"), ['Map', 'Phone']);
  assert.deepEqual(lucideBindings("import React from 'react';"), []);
});

// ---------------------------------------------------------------------------
// The opposite mistake: a name used and never imported.
//
// Sidebar.jsx listed `icon: MessagesSquare` in NAV without importing it. NAV is
// a module-level const, so the reference threw the moment the module loaded —
// before anything rendered, on every device, for everyone. The build does not
// resolve identifiers so it passed; the tests do not load the bundle so they
// passed; and the page it took down was the whole app.
//
// The import was lost to a find-and-replace whose search string ended in \n
// against a CRLF file: the single-line edits in that script landed and the
// multi-line ones silently did not.
// ---------------------------------------------------------------------------

/** Every name this file binds — imported, declared or destructured. */
function bindings(source) {
  const names = new Set();
  const add = (n) => n && names.add(n.trim());

  // import X, { a, b as c }, * as ns from '…'
  for (const [, clause] of source.matchAll(/import\s+([^'"]+?)\s+from\s*['"][^'"]+['"]/g)) {
    for (const [, ns] of clause.matchAll(/\*\s+as\s+([A-Za-z_$][\w$]*)/g)) add(ns);
    for (const [, inner] of clause.matchAll(/\{([^}]*)\}/g)) {
      for (const part of inner.split(',')) add(part.split(/\s+as\s+/).pop());
    }
    const dflt = clause.replace(/\{[^}]*\}/g, '').replace(/\*\s+as\s+[\w$]+/g, '').split(',')[0];
    if (/^[A-Za-z_$][\w$]*$/.test(dflt.trim())) add(dflt);
  }

  for (const [, n] of source.matchAll(/\b(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) add(n);
  for (const [, n] of source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) add(n);
  // const { A, B } = … and const [A, B] = …
  for (const [, inner] of source.matchAll(/\b(?:const|let|var)\s*[{[]([^}\]]*)[}\]]\s*=/g)) {
    for (const part of inner.split(',')) add(part.split(':').pop().replace(/=.*$/, ''));
  }

  // Destructured parameters: .map(({ to, icon: Icon }) => …) binds Icon.
  //
  // This is the same `key: Name` syntax as an object literal and means the
  // opposite — there it uses Name, here it declares it. Position is what tells
  // them apart, so only patterns wrapped in ( … ) count as bindings.
  for (const [, inner] of source.matchAll(/\(\s*\{([^}]*)\}\s*\)/g)) {
    for (const part of inner.split(',')) {
      const alias = part.includes(':') ? part.split(':').pop() : part;
      add(alias.replace(/=.*$/, ''));
    }
  }
  return names;
}

/** Component-shaped names this file references. */
function usedComponents(source) {
  const used = new Set();
  // <Foo …> and <Foo.Bar …> — the root name is what must be bound.
  for (const [, n] of source.matchAll(/<([A-Z][\w$]*)/g)) used.add(n);
  // icon: Foo — how the sidebar's NAV names its icons.
  for (const [, n] of source.matchAll(/\bicon:\s*([A-Z][\w$]*)/g)) used.add(n);
  return used;
}

check('every component a file uses is imported or declared in it', () => {
  const offenders = [];
  const root = new URL('../src', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
  for (const file of sourceFiles(root)) {
    const source = readFileSync(file, 'utf8');
    const bound = bindings(source);
    for (const name of usedComponents(source)) {
      if (!bound.has(name)) offenders.push(`${file.split(/[\\/]/).pop()}: uses ${name}, never imports it`);
    }
  }
  assert.deepEqual(offenders, []);
});

check('the unbound-name check would have caught the sidebar crash', () => {
  // Guards the guard. Without this the check could be loosened into silence and
  // the suite would still go green — which is how the bug shipped in the first
  // place: every signal we had said the file was fine.
  const broken = "import { Home } from 'lucide-react';\nconst NAV = [{ icon: Home }, { icon: MessagesSquare }];\n";
  const bound = bindings(broken);
  const missing = [...usedComponents(broken)].filter((n) => !bound.has(n));
  assert.deepEqual(missing, ['MessagesSquare']);

  const fixed = "import { Home, MessagesSquare } from 'lucide-react';\nconst NAV = [{ icon: MessagesSquare }];\n";
  assert.deepEqual([...usedComponents(fixed)].filter((n) => !bindings(fixed).has(n)), []);
});
