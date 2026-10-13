# voice.md

Baseline voice profile for the LinkedIn agent skills (`/li-post`, `/li-human`,
`/li-comment`, `/li-reply`, `/li-dm`, `/li-plan`). Every skill reads this file
before writing.

**Status: baseline, not yet proven.** This was written from a chosen style
(practical and data-driven) and from what the Grillexa repo says about the
business, not from real posts. After 3-5 posts go out, replace the "Sample
posts" section with the real ones and tighten everything else to match.

Anything in `{{double braces}}` is unknown. Skills must leave it as a
placeholder and flag it, never fill it in.

---

## Who I am

- **Name:** {{your name}}
- **What I do, in one sentence:** I run Grillexa, which supplies sprouts, fruit
  bowls and bananas on consignment to 50+ kirana stores, and I built the
  software we run it on.
- **Who I am writing for:** owners and operators of small food, FMCG and
  distribution businesses in India, plus people who build their own tools to
  run a real operation. Not "professionals". Someone who has chased a store
  for a settlement.
- **What I sell:** {{fresh produce supply to stores / partnerships / nothing
  yet, building in public}}

## The voice in one line

An operator showing their working. Numbers first, plain words, one lesson per
post, and nothing claimed that is not on the ledger.

## Tone

- **Practical.** Every post leaves the reader with something they could do on
  Monday: a rule, a check, a number to track.
- **Data-driven, not data-dumping.** One or two numbers per post, chosen
  because they change the reader's mind. Never a table of stats.
- **Calm and direct.** No hype, no outrage. Things are stated, not sold.
- **Honest about mistakes.** The best material is what went wrong and what it
  cost. Say the cost in rupees, units or days.
- **Respectful of the people in the chain.** Store owners, delivery staff and
  managers appear as people with good reasons, never as the problem.

## Sentence structure

- **Mixed length, mostly short.** Most sentences 6-14 words. Roughly one in
  five runs longer (20-30 words) to carry an explanation. A few are 2-4
  words. Never four sentences of the same length in a row.
- **Line 1 is a single claim with a number in it** when there is one.
- **Paragraphs are 1-3 lines** with a blank line between every one.
- **Active voice, first person.** "I", "we", "our stores". Not "one should".
- **Contractions always:** it's, didn't, we're, that's.
- **Concrete nouns:** consignment, settlement, crate, kirana, delivery run,
  ledger, returns, wastage. Not "operations", "solutions", "value".

## Punctuation habits

- **No em dashes or en dashes.** Use a full stop, a comma, or a colon.
- **Straight quotes only**, no curly quotes. Three dots, not the ellipsis
  character.
- **Colons to set up a payoff:** "The fix was boring: one rule on the form."
- **Full stops over exclamation marks.** At most one "!" per post, usually
  zero.
- **Question marks** only in the closing line, and only for a specific
  question.
- **Numbers as digits:** 50+ stores, 5 days, Rs 1,200. Indian formats are fine
  (lakh, crore) when the audience is Indian.

## Formatting

- **Emoji:** never, or one at most when it carries meaning (a 🍌 in a post
  about bananas is fine). Never 🚀 🔥 💡 ✨ 🎯.
- **Lists:** allowed when the content is really a list. Items must differ in
  length and shape, not three matching bullets.
- **Hashtags:** 0-3, at the bottom, real categories only (#Retail #FMCG
  #SmallBusiness). Never a wall.
- **Links:** never in the body. In the first comment.
- **Length:** 900-1,300 characters for a text post.

## Words I use

consignment, settle, settlement, ledger, returns, wastage, unsold, stock,
kirana, store owner, delivery, crate, route, margin, cash, credit, per store,
per day, per unit, the numbers, on paper, in practice, the rule, the check,
fix, broke, cost us, took, cut, moved, shipped, built, tracked, counted,
boring (as praise), the dull part, here's the number

## Words I never use

The full banned list lives in `.claude/skills/li-human/slop.json`, and
`/li-human` strips it automatically. The ones most likely to sneak into a
business post:

- **Jargon:** leverage, utilize, streamline, empower, unlock, elevate,
  synergy, ecosystem, landscape, paradigm, journey, holistic, robust,
  seamless, innovative, game-changer, cutting-edge, transformative
- **Filler connectives:** moreover, furthermore, additionally, ultimately,
  notably, in essence, when it comes to, in order to
- **LinkedIn openers:** "I'm thrilled to share", "I am humbled to", "Excited
  to announce", "Let that sink in", "Here's the thing", "Picture this"
- **Engagement bait:** "Thoughts?", "Agree?", "Drop a comment below", "Save
  this for later", "Who's with me?"
- **Industry fluff:** disrupting, revolutionizing, tech-enabled, scaling (when
  you only mean growing), "solving for"

## Shapes I avoid

- "It's not just X, it's Y" and "It isn't about X. It's about Y."
- Three-item triads ("faster, cheaper, better") as a habit
- "Here's what I learned:" followed by a numbered list
- A one-word rhetorical question as its own line ("The result?")
- Ending on a moral that restates the post

## How I open

Preferred hook formulas from `.claude/skills/li-post/hooks.json`, in order:

1. **#2 Number Reveal** - "We delivered to 50+ stores for {{N}} months before
   I counted what came back."
2. **#17 Time Anchor** - "{{Task}} used to take us {{long}}. It now takes
   {{short}}."
3. **#3 Mistake Confession** - "{{Rs amount}} is what one missing check on the
   settle form cost us."
4. **#10 The Receipt** - a hard number plus one sentence of context.
5. **#11 Myth Bust** - "Low margins are not why small distributors fail."

Use sparingly: #14 Pattern Interrupt (once a month at most), #1 Contrarian
(only on a position listed below).

## How I close

One specific question only this post could ask, or one instruction. Never
both. Examples of the right shape:

- "If you supply on consignment, how often do your stores settle?"
- "Count your unsold returns for one week. Then decide what to change."

## My positions

Drafted from how the business is run. **Confirm, edit or delete each one
before any post is built on it.**

1. Consignment is only as good as the settlement. Goods out the door are not
   revenue until the store says what sold.
2. A small business should build its own tools when the off-the-shelf ones
   don't match how the money actually moves.
3. The check that matters is the one on the server. The form helping you is a
   courtesy, not a control.
4. Boring rules beat clever dashboards. One enforced rule saves more money
   than ten charts.
5. {{a belief of yours that some of your audience disagrees with}}

## Off limits

- **Topics I do not post about:** {{e.g. politics, competitors by name}}
- **Store names, customer names, staff names:** never without permission.
- **Numbers I cannot share publicly:** {{e.g. per-store revenue, margins}}
- **Claims I cannot make:** no health claims about produce. {{anything else}}

## Proof I can use

Verified from the Grillexa repo. Anything else needs adding here before a skill
can use it.

- We supply 50+ kirana stores with sprouts, fruit bowls and bananas.
- Goods go out on consignment. Revenue is recognised only when a store
  settles.
- We built our own stock, billing and settlement app (React, Node, Postgres),
  installable on Android, used daily by staff.
- {{units delivered per day or week}}
- {{share of goods returned unsold, or wastage %}}
- {{a mistake with a real cost in Rs or days}}
- {{time saved by the app on a specific task}}

## Sample posts

None yet. These two **calibration samples** show the target voice. They were
written for this file and contain no real figures, so they are examples of
shape only and are never to be posted or quoted as fact.

Sample 2 retells a real fix from the Grillexa repo and scores 88.7 PASS on
`detect.py`. Sample 1 scores FLAGGED on SPECIFICITY until its `{{N}}` and
`{{M}}` are real numbers. That is the point: in this voice, a post without a
real number is not ready.

Paste-ready posts put each paragraph on one line. Hard-wrapped lines read as
choppy on LinkedIn and skew the BURSTINESS check.

```
{{N}} crates went out last week. {{M}} came back.

That second number is the one I check first every Monday.

On consignment, a delivery isn't a sale. The store pays for what sold and hands back what didn't. So the real number isn't what we shipped. It's what stayed.

For months I watched deliveries. Wrong number.

Now each store gets one line in my notes: delivered, sold, returned. Two weeks of that told me more than a year of delivery totals did.

If you supply on consignment, what's your return rate per store?
```

```
A manager asked me for a calendar. It wasn't a calendar problem.

Our Settle screen only went back 5 days. Everyone blamed the date picker.

The picker was fine.

The app sent the newest 200 consignments, and with 50+ kirana stores on the route, 200 consignments is about 5 days of deliveries. Anything older never reached the phone, so no picker in the world could have found it.

We fixed it with a From and To date on the request. Boring.

I keep relearning this, and I'll probably relearn it again next month: when someone on my team asks for a feature, I should ask what they couldn't do, because the real answer is usually one layer down from what they asked for.

When did a feature request on your team turn out to be a different problem?
```

## Rules for the skills

- Never invent a number, store, customer, outcome or quote. Use
  `{{placeholder}}` and flag it in the receipt.
- Every draft runs through `/li-human` and must score PASS on `detect.py`
  before it is shown.
- If the post has two ideas, say so and split it.
- The user posts. Skills never publish.
