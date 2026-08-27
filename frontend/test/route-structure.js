// A <Route> that is not a direct child of <Routes> never mounts.
//
// This shipped. The /team-chat route was added inside the /users element rather
// than beside it; React rendered it without complaint, the build passed, every
// test passed, and grepping the deployed bundle for "/team-chat" returned true —
// but the path fell through to the catch-all and redirected to "/". The sidebar
// link went nowhere for an hour.
//
// A line-based scan cannot catch it: the misplaced <Route> sat at the start of
// its own line and looked exactly like a correct one. Indentation was the only
// visible difference, and indentation is not structure.
//
// Brace depth is. A route's children live inside element={ … }, so a <Route>
// written at brace depth 0 is a sibling of the others, and one at depth 1 or
// more is buried inside another route's element.
//
// Run: npm test (from frontend/). No browser, no DOM, no dependencies.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(dir, '../src/App.jsx');
const SIDEBAR = path.resolve(dir, '../src/components/Sidebar.jsx');

const BACKSLASH = String.fromCharCode(92);

/** Drops JSX comments so a commented-out tag is never counted. */
function stripJsxComments(src) {
  return src.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');
}

/**
 * Every <Route> inside <Routes>, with the brace depth it sits at.
 *
 * An earlier attempt counted open and closing tags instead. It found nothing,
 * because to locate a tag's closing ">" it skipped over brace contents — and
 * brace contents are where every child lives, including the buried route. The
 * "catches a buried route" test at the bottom exists because of that: it is the
 * check on the check.
 */
function routesInside(src) {
  const clean = stripJsxComments(src);
  const start = clean.indexOf('<Routes');
  if (start < 0) return [];
  const open = clean.indexOf('>', start);
  const end = clean.indexOf('</Routes>', open);
  if (open < 0 || end < 0) return [];

  const span = clean.slice(open + 1, end);
  const before = clean.slice(0, open + 1).split('\n').length;
  const found = [];
  let depth = 0;
  let quote = null;

  for (let i = 0; i < span.length; i += 1) {
    const c = span[i];

    // A brace inside a string is text, not structure.
    if (quote) {
      if (c === quote && span[i - 1] !== BACKSLASH) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }

    if (c === '{') { depth += 1; continue; }
    if (c === '}') { depth -= 1; continue; }

    // "<Route" followed by whitespace or > — never "<Routes".
    if (c === '<' && /^<Route[\s>]/.test(span.slice(i, i + 8))) {
      found.push({ depth, line: before + span.slice(0, i).split('\n').length - 1 });
    }
  }
  return found;
}

const pathsOf = (src) =>
  [...src.matchAll(/<Route\b[^>]*?\bpath=["']([^"']+)["']/gs)].map((m) => m[1]);

/** Nav entries are objects in Sidebar.jsx, not JSX in App.jsx. */
const navTargets = (src) =>
  [...src.matchAll(/\bto:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);

const app = fs.readFileSync(APP, 'utf8');
const sidebar = fs.readFileSync(SIDEBAR, 'utf8');

const tests = {
  'every route is a direct child of <Routes>': () => {
    const routes = routesInside(app);
    if (routes.length === 0) {
      throw new Error('no routes found at all — the scanner is broken, not App.jsx');
    }
    const buried = routes.filter((r) => r.depth > 0);
    if (buried.length) {
      const detail = buried
        .map((r) => `    App.jsx:${r.line} — ${r.depth} brace level(s) inside another element`)
        .join('\n');
      throw new Error(
        `${buried.length} route(s) never mount, being nested in another element:\n${detail}`
      );
    }
  },

  'every sidebar link points at a route that exists': () => {
    // A nav entry with no matching route lands on the catch-all — the same
    // silent redirect the nesting bug caused, from the other direction.
    const declared = new Set(pathsOf(app));
    const missing = navTargets(sidebar).filter(
      (to) => to.startsWith('/') && !to.includes(':') && !declared.has(to)
    );
    if (missing.length) {
      throw new Error(`sidebar links with no <Route>: ${missing.join(', ')}`);
    }
  },

  'the nav is actually being read': () => {
    // The first draft of this looked for nav entries in App.jsx, where there
    // are none — so the cross-check passed on everything and tested nothing.
    const found = navTargets(sidebar).length;
    if (found < 5) {
      throw new Error(`only ${found} nav entries found in Sidebar.jsx; the pattern has drifted`);
    }
  },

  'the scanner catches a buried route': () => {
    const sample = [
      '<Routes>',
      '  <Route path="/ok" element={<A />} />',
      '  <Route',
      '    path="/users"',
      '    element={',
      '      <Guard>',
      '        <Users />',
      '<Route path="/buried" element={<B />} />',
      '      </Guard>',
      '    }',
      '  />',
      '</Routes>',
    ].join('\n');

    const found = routesInside(sample);
    if (found.length !== 3) {
      throw new Error(`expected to see 3 routes in the sample, saw ${found.length}`);
    }
    const buried = found.filter((r) => r.depth > 0);
    if (buried.length !== 1) {
      throw new Error(`expected exactly 1 buried route, caught ${buried.length}`);
    }
  },

  'the scanner does not cry wolf on a healthy file': () => {
    const sample = [
      '<Routes>',
      '  <Route path="/" element={<Home />} />',
      '  <Route',
      '    path="/users"',
      '    element={',
      '      <Guard roles={[\'ADMIN\']}>',
      '        <Users />',
      '      </Guard>',
      '    }',
      '  />',
      '  <Route path="*" element={<Navigate to="/" replace />} />',
      '</Routes>',
    ].join('\n');

    const buried = routesInside(sample).filter((r) => r.depth > 0);
    if (buried.length !== 0) {
      throw new Error(`flagged ${buried.length} route(s) in a correct file`);
    }
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL  ${name}\n        ${err.message}`);
  }
}
console.log(`\n${Object.keys(tests).length - failed} passing${failed ? `, ${failed} failing` : ''}`);
if (failed) process.exitCode = 1;
