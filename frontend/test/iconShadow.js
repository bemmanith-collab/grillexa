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
