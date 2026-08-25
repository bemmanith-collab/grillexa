// Seeds the 30-day channel calendar from whatsapp/strategy/30-day.json.
//
//   npm run seed:calendar
//
// Safe to run repeatedly, and meant to be: the strategy file is edited by hand
// and this is how an edit reaches the database. Rows are upserted on
// (day, timeSlot), so a changed theme updates that one cell in place instead of
// adding a ninety-first.
//
// What it will not touch is the point. `sent`, `sentAt` and `fullPost` are
// written by whoever is running the channel — a month of ticked-off posts and
// generated prose has to survive a typo fix in the strategy file, or nobody
// will ever dare run this again.

const fs = require('fs');
const path = require('path');
const prisma = require('../src/db');

// Same relative hop the whatsapp route uses: backend/ and whatsapp/ are
// siblings in the repo and in the image, so this resolves either way.
const STRATEGY = path.join(__dirname, '..', '..', 'whatsapp', 'strategy', '30-day.json');

const SLOTS = ['morning', 'afternoon', 'night'];
const DAYS = 30;

// Read and check the whole file before writing anything. A strategy file that
// is half-edited should fail with a list of what is wrong, not leave the
// calendar with forty good cells and fifty stale ones.
function load() {
  let strategy;
  try {
    strategy = JSON.parse(fs.readFileSync(STRATEGY, 'utf8'));
  } catch (err) {
    throw new Error(`Could not read ${STRATEGY}\n  ${err.message}`);
  }

  const problems = [];
  const cells = [];

  const days = strategy.days ?? [];
  if (days.length !== DAYS) problems.push(`expected ${DAYS} days, found ${days.length}`);

  for (let n = 1; n <= DAYS; n += 1) {
    const day = days.find((d) => d.day === n);
    if (!day) {
      problems.push(`day ${n} is missing`);
      continue;
    }
    for (const timeSlot of SLOTS) {
      const post = day.posts?.[timeSlot];
      if (!post) {
        problems.push(`day ${n} has no ${timeSlot} post`);
        continue;
      }
      // theme and draft are NOT NULL in the schema; the other two are optional
      // by design and normalised to null rather than to an empty string, so
      // "nothing written" reads the same way everywhere.
      if (!post.theme?.trim()) problems.push(`day ${n} ${timeSlot}: empty theme`);
      if (!post.draft?.trim()) problems.push(`day ${n} ${timeSlot}: empty draft`);

      cells.push({
        day: n,
        timeSlot,
        theme: post.theme?.trim() ?? '',
        draft: post.draft?.trim() ?? '',
        engagementQuestion: post.engagementQuestion?.trim() || null,
        imageIdea: post.imageIdea?.trim() || null,
      });
    }
  }

  if (problems.length) {
    throw new Error(`The strategy file has ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);
  }
  return cells;
}

async function main() {
  const cells = load();

  const before = await prisma.whatsAppContent.count();
  for (const cell of cells) {
    const { day, timeSlot, ...content } = cell;
    await prisma.whatsAppContent.upsert({
      where: { day_timeSlot: { day, timeSlot } },
      create: { day, timeSlot, ...content },
      // Deliberately not a spread of the whole cell: listing the four planning
      // fields is what guarantees sent/sentAt/fullPost are left alone, and it
      // stays true if the schema grows a field later.
      update: {
        theme: content.theme,
        engagementQuestion: content.engagementQuestion,
        imageIdea: content.imageIdea,
        draft: content.draft,
      },
    });
  }

  const after = await prisma.whatsAppContent.count();
  const sent = await prisma.whatsAppContent.count({ where: { sent: true } });
  const generated = await prisma.whatsAppContent.count({ where: { NOT: { fullPost: null } } });

  console.log(`Calendar seeded from ${path.relative(process.cwd(), STRATEGY)}`);
  console.log(`  ${cells.length} cells written — ${after - before} new, ${cells.length - (after - before)} updated in place`);
  console.log(`  left untouched: ${sent} marked sent, ${generated} with a generated post`);
}

main()
  .catch((err) => {
    console.error(`\nCalendar seed failed.\n${err.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
