// The suggestion engine decides what the channel writes next. It is worth
// testing because its failure mode is silent and slow: it quietly stops
// mentioning a content type, that type stops going out, and the channel gets
// samey over weeks without anyone being able to point at a bug.
//
// Run: npm test (from backend/). No database, no network.
const assert = require('assert');
const { buildSuggestions, summarise } = require('../src/lib/whatsappSuggestions');

const TYPES = {
  myth: { label: 'Myth vs Fact' },
  evening: { label: 'Evening Wind-Down' },
  habit: { label: 'Healthy Habit Challenge' },
  product: { label: 'Product Highlight' },
  customer: { label: 'Customer Story' },
};
const TODAY = '2026-08-21';
const due = { day: 'Friday', type: 'evening' };
const run = (posts, dueToday = due) =>
  buildSuggestions({ posts, types: TYPES, dueToday, today: TODAY });

const tests = {
  "today's rota post comes first, and it is the one that matters": () => {
    const out = run([]);
    assert.strictEqual(out[0].type, 'evening');
    assert.strictEqual(out[0].priority, 'today');
  },

  "today's post is not suggested once it has been written": () => {
    const out = run([{ type: 'evening', postDate: TODAY, used: false }]);
    assert.ok(!out.some((s) => s.priority === 'today'), 'still nagging about a post that exists');
  },

  'a type nobody has ever posted outranks one that is merely overdue': () => {
    const out = run([
      { type: 'myth', postDate: '2026-08-01', used: true },
      { type: 'habit', postDate: '2026-08-14', used: true },
    ]);
    const stale = out.filter((s) => s.priority === 'stale').map((s) => s.type);
    assert.ok(
      stale.indexOf('product') < stale.indexOf('myth'),
      'never-posted should come before twenty-days-ago'
    );
  },

  'the most overdue comes before the merely late': () => {
    const posts = Object.keys(TYPES).map((type) => ({
      type,
      postDate: type === 'myth' ? '2026-07-01' : '2026-08-13',
      used: true,
    }));
    const stale = run(posts).filter((s) => s.priority === 'stale').map((s) => s.type);
    assert.strictEqual(stale[0], 'myth');
  },

  'selling types are chased on a longer leash than the weekly rota': () => {
    // Eight days: everything weekly is overdue, product and customer are not.
    const posts = Object.keys(TYPES).map((type) => ({
      type, postDate: '2026-08-13', used: true,
    }));
    const stale = run(posts).map((s) => s.type);
    assert.ok(stale.includes('myth'), 'a weekly type should be overdue after 8 days');
    assert.ok(!stale.includes('product'), 'product should not be chased weekly');
    assert.ok(!stale.includes('customer'), 'customer should not be chased weekly');
  },

  'a post that was written but never sent does not count as posted': () => {
    const posts = [
      { type: 'evening', postDate: '2026-08-20', used: false },
      { type: 'myth', postDate: '2026-08-19', used: true },
    ];
    const summary = summarise(posts, TODAY);
    assert.strictEqual(summary.generatedThisWeek, 2);
    assert.strictEqual(summary.usedThisWeek, 1, 'a draft is not something readers saw');
    assert.strictEqual(summary.lastPostedOn, '2026-08-19');
  },

  'the reasons read like a person wrote them': () => {
    const out = run([]);
    assert.ok(/^Friday is usually an Evening Wind-Down post/.test(out[0].reason), out[0].reason);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  ${name}\n      ${err.message}`);
  }
}
console.log(failed ? `\n${failed} failing` : `\n${Object.keys(tests).length} passing`);
process.exit(failed ? 1 : 0);
