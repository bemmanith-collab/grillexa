# Grillo WhatsApp Content Generator

Writes ready-to-post content for the Grillo WhatsApp channel. Type a topic and an
audience, get back a post formatted for a phone screen that you copy straight into
WhatsApp.

**It runs standalone.** It imports nothing from `backend/` or `frontend/`, never touches
the database, and does not need the Grillexa app to be running. It talks to one content
provider and to nothing else.

The Grillexa dashboard imports *this* — see *Used from the dashboard too* below. The
dependency runs one way only.

## Setup

```bash
cd whatsapp
npm install
cp .env.example .env
```

Then pick who writes the posts. **`.env` is gitignored — no key ever goes near the repo.**

| Provider | Cost | Key | Quality |
|---|---|---|---|
| **Google Gemini** | Free tier | `GEMINI_API_KEY` from <https://aistudio.google.com/apikey> — no card | Good. Holds the brand format. **Start here.** |
| **Anthropic Claude** | ~₹5 a post | `ANTHROPIC_API_KEY` from <https://console.anthropic.com/settings/keys> | Best writing of the three |
| **Pollinations** | Free | none | Unreliable. See the warning below |

The first one configured wins, in that order — so setting `GEMINI_API_KEY` is the whole
setup. With no keys at all it falls through to Pollinations and still writes something.

Force one with `AI_PROVIDER=gemini|claude|pollinations`. Naming a provider that is not
configured is an error rather than a silent fallback: a post written by an unexpected
provider is worse than no post, because nobody looks twice at it.

`npm run generate -- --list` ends by printing which provider is active.

### About Pollinations

It is an anonymous relay in front of somebody else's models. No account, no quota you
control, no uptime guarantee, and no say in which model answers. Against a long brand
prompt it will sometimes drop the section format or the closing lines.

It exists so the tool still does something on a machine with no keys. **Read what it
writes before posting it**, and treat a good result as luck rather than as the
arrangement working. `POLLINATIONS_ENABLED=false` turns it off, so a missing key fails
loudly instead of quietly producing a worse post.

Check it works:

```bash
npm run generate -- --list
```

## Using it

```bash
# The post today is due, per the weekly rota
node index.js generate --today

# See every type, audience, tone and language
node index.js generate --list

# One post
node index.js generate --type=myth --audience=general --topic="eating after 8 PM"

# A specific meal, for elders
node index.js generate --type=meal --slot=dinner --audience=elders

# One post of every type, saved to a folder
node index.js generate --batch --audience=general --out=posts/

# See the prompt without spending anything
node index.js generate --type=habit --dry-run
```

From the repo root, `npm run whatsapp -- --type=morning --audience=elders` does the
same thing.

`npm run generate -- <flags>` also works from inside `whatsapp/`. The bare `--` is npm's,
and it is what passes your flags through to the script.

## Options

| Flag | What it does |
|---|---|
| `--type` | Which kind of post. Required, unless `--batch`. |
| `--audience` | Who it is written for. Default `general`. |
| `--topic` | What it is about. Leave it out and one gets chosen to suit the type. |
| `--tone` | `friendly` (default), `professional`, `playful`, `authoritative`. |
| `--language` | `english` (default), `telugu`, `hindi`. |
| `--quote-language` | Language of the `GRILLO SAYS` line only. Default `auto`. |
| `--slot` | `breakfast`, `lunch`, `snack`, `dinner`. Only with `--type=meal`. |
| `--product` | Which product, with `--type=product`. Random if omitted. |
| `--ingredient` | Everyday ingredient to build the food around. Random if omitted. |
| `--day` | Weekday in the headline. Defaults to today in India. |
| `--season` | Season, with `--type=seasonal`. Defaults to the current one in India. |
| `--batch` | One post of every type, generated one after another. |
| `--out` | Also write to a file. A path ending `.txt` is a file; anything else is a folder. |
| `--dry-run` | Print the prompt instead of sending it. Costs nothing. |
| `--list` | Show everything that is valid, then exit. |

### Content types

| Type | What it is |
|---|---|
| `myth` | Myth vs Fact — a food belief people repeat, set straight |
| `morning` | A day-to-day tip for the start of the day |
| `meal` | One meal: breakfast, lunch, evening snack or dinner (`--slot`) |
| `cheat` | The Sunday cheat meal, made better rather than smaller |
| `habit` | A small habit offered as a week-long challenge |
| `product` | One Grillo product, kept deliberately minimal |
| `seasonal` | What is worth eating in the season we are in |
| `evening` | The quiet last post of the day — what you eat tonight, felt tomorrow morning |
| `customer` | A post built around something a customer actually said |

### Audiences

`general`, `elders`, `diabetics`, `young`.

**`general` writes one post for the whole household, not a section per reader.** It used
to split into `👵 FOR ELDERS` / `👶 FOR YOUNG ONES` / `🌿 FOR THE FAMILY` blocks and that
produced six- and seven-section posts repeating the same advice three ways — so the
audience now describes a reader and leaves the sections to the type. Where a detail
differs by age it is carried inside an ordinary line ("softer for the elders", "let the
children help") rather than under a heading of its own.

`diabetics` adds a short plain note that food is not treatment and their doctor stays in
charge. That note is not optional — see *What it will not write* below.

### Language, and the Grillo Says line

Two separate settings, because the channel is mostly English but Grillo is not always.

- **`--language`** is the post body. Default `english`. `telugu` and `hindi` write the
  whole post in that language **in the Latin alphabet** — the way people actually type on
  a phone here, not in Telugu script or Devanagari. Headings and the fixed closing lines
  stay in English either way.
- **`--quote-language`** is only the quote under `💬 GRILLO SAYS`. Default `auto`, which
  picks English or romanised Telugu **per post**, so a `--batch` run comes out mixed
  rather than all one language. Force it with `english` or `telugu`.

When `--language` is not English, `--quote-language` is ignored — the body setting
already governs the whole post, and a second instruction would only contradict it.

## The weekly rota

`--today` writes the post this weekday is due, so posting daily is not a decision anybody
has to make at 6am:

| Day | Post | Why there |
|---|---|---|
| Monday | Morning tip | The week's idea, while people are deciding what the week looks like |
| Tuesday | Myth vs Fact | Clears the belief standing in the way of Monday's idea |
| Wednesday | Dinner | Midweek is where good intentions collapse, and they collapse at dinner |
| Thursday | Habit challenge | Three days in — turn the idea into something with a checkbox |
| Friday | Evening wind-down | The week is done. Nothing to instruct |
| Saturday | Seasonal food | Market day, while people are buying |
| Sunday | Cheat meal | The most-read post of the week |

A repeating rhythm gets anticipated — people start waiting for the Sunday one — where a
random type each day is just noise arriving at breakfast.

**Product highlights and customer stories are deliberately off the rota.** Both are worth
posting occasionally and neither belongs on a weekly rhythm: a channel that sells every
week stops being read. Post them by hand, in place of a day's post, no more than about
once a fortnight. A test in `backend/test/whatsapp.js` fails if either one ends up
scheduled.

Anything passed alongside `--today` still wins, so `--today --audience=elders` is today's
type written for a different reader. The rota lives in `lib/rota.js` and is the same one
the dashboard panel uses.

## Used from the dashboard too

Admin and Manager (and only the emails in `WHATSAPP_AUTHORS`) get this same generator as a
panel on the Grillexa dashboard — `POST /api/whatsapp/generate` imports the library in
this folder rather than copying it, so both surfaces share one set of prompt files and
cannot drift apart.

Practically, that means **an edit to `prompts/` changes the dashboard too**, and reaches
it on the next deploy rather than immediately. `--dry-run` is still the cheap way to check
a prompt edit before it goes anywhere.

## The everyday ingredient

Left alone, every post reaches for the same few foods — banana, curd, sprouts — and the
channel goes stale within a fortnight. Telling the prompt to "vary the food" does not fix
that: each post is a separate API call with no memory of yesterday's, so every one of
them independently picks whatever is most typical.

So variety is injected rather than requested. Each post is handed one item from
`lib/pantry.json` — things already sitting in the kitchen that nobody thinks of, like
curry leaves, ridge gourd skin, banana stem, drumstick, coriander stems, last night's
rice — and builds at least one section of its food suggestions around it. The reader
should think *"I have that at home"*, not *"I should buy that"*.

Six of the nine types take one. `myth`, `product` and `customer` don't: they already have
a subject, and forcing an ingredient into them would bend the post.

`--batch` draws **without replacement**, so a batch never runs the same vegetable through
three posts. A single post draws at random; force one with `--ingredient="ridge gourd"`.

Add to `lib/pantry.json` freely — a name and a plain one-line note is all an entry needs.
The more that list grows, the less the channel repeats itself.

## Everything time-based runs on Indian time

Three things are decided by the clock: the weekday in the headline, which meal
`--type=meal` writes about when you don't pass `--slot`, and which season
`--type=seasonal` assumes. All three are facts about Andhra Pradesh, so all three are
computed in IST regardless of what the machine running the tool is set to
(`lib/clock.js`).

Without that, a laptop on UTC prints `THURSDAY` on a Friday post after 6:30pm IST, and
a batch run at 8am in Vijayawada writes about dinner. Output filenames use the Indian
date for the same reason.

It is a fixed +5:30 offset rather than a timezone lookup — India has never observed DST,
so the offset is exact, and the arithmetic doesn't depend on timezone data being present
on the machine. Same approach as `frontend/src/utils/date.js`, deliberately.

Override either with `--day=friday` or `--season="summer — hot and dry"` when you are
writing posts ahead of time. When the day is not today — either because you passed
`--day`, or because the type pins one — the prompt says so, so the post never calls a
Sunday "today" in something drafted on Wednesday.

`--type=cheat` is the one type with a pinned day: it is always written for Sunday
whatever day you generate it on, since these get drafted midweek.

## The post format

Every post is built the same way: an emoji headline in capitals, a short hook, then
sections separated by a lone `—`, and always the same closing furniture:

```
💬 GRILLO SAYS

"<one or two lines in Grillo's voice>"

<Three or four short words. Written fresh each time.>

🥗 Know Your Food Better.

— Grillo
```

`🥗 Know Your Food Better.` and `— Grillo` never change. The three-word line does — it
echoes whatever that post was about, so the sign-off has a rhythm without reading like a
template.

Most types also carry the `🔄 INSTEAD OF THIS… TRY THIS` block, which names a habit and
its replacement in the same breath. `product` and `customer` never do; `myth` and
`seasonal` include it only when there are real swaps worth making.

## Changing the voice

The prompt files in `prompts/` are meant to be edited. You do not need to touch any
JavaScript to change how the posts read.

| File | What it controls |
|---|---|
| `brand.md` | Voice, format, the closing furniture, the words to avoid. **Shared by every post** — change it once and all eight types follow. |
| `example-post.md` | The format exemplar. Replace it with a better post and everything shifts towards that one. |
| `myth.md`, `meal.md`, … | One file per type: what sections it has and what it avoids. |

After editing, `--dry-run` shows exactly what Claude will receive.

`examples/` holds hand-written reference posts showing what the current prompts are
aiming at, with a note on each explaining which instructions it demonstrates. **Nothing
in `examples/` is sent to the model** — only `prompts/` is loaded, and only by filename.
It is there for whoever edits a prompt file next and wants to see the target before
changing it.

`lib/products.json` is the product catalogue for `--type=product`. It is a plain list —
add a product with its `facts`, and those facts are the **only** things the post is
allowed to state about it.

`lib/pantry.json` is the everyday-ingredient list described above. Adding to it is the
single cheapest way to keep the channel from repeating itself.

`lib/options.js` holds the audiences, tones and languages. Adding an audience there
makes it valid in the CLI, in `--list` and in the prompt at once.

## What it will not write

Some of this is baked into the prompts deliberately, and it is worth knowing why before
you edit it out.

- **No health claims.** A food can be high in fibre; it cannot control your sugar, cure
  anything or reverse anything. The `diabetics` audience is explicitly told never to
  suggest a food treats diabetes and never to touch the subject of medication.
- **No invented customers.** `--type=customer` writes from a real detail you supply in
  `--topic`. With no topic it writes an unattributed version — "several of you have told
  us…" — with no named person and no outcome. It will not invent a name, an age, a
  duration or a result, because a fabricated testimonial published as genuine costs the
  channel more than any post gains it.
- **No selling.** Product posts never mention price, offers, stock or urgency.
- **No shaming.** No guilt language about food, ever.
- **No food debt.** `--type=cheat` is the one place the channel says *cheat meal*, because
  that is what readers call it themselves. It is used as their word, not as a verdict:
  the post makes Sunday's meal better rather than smaller, and nothing is ever earned,
  burnt off, worked off, made up for on Monday or counted. A good week has a Sunday in
  it — that idea is the whole difference between this type and a diet post, and it is
  what keeps the word from doing damage.

## Cost and model

One post is one API call — roughly a few thousand tokens in and under a thousand out.
`--batch` is nine of those, run one after another rather than in parallel: easier to read,
and less likely to trip a rate limit.

On **Gemini** and **Pollinations** that is free, within the free tier's per-minute and
per-day limits. On **Claude** it is roughly ₹5 a post, and only there does the cached
prefix help — the brand voice and the exemplar carry a cache breakpoint, so a batch pays
for them once instead of nine times.

Override the model with `GEMINI_MODEL` or `CLAUDE_MODEL` in `.env`.

## When something goes wrong

Every failure prints one line saying what happened and one saying what to do, and exits
non-zero so it can be scripted.

| Message | Fix |
|---|---|
| `No content provider is set up` | Set `GEMINI_API_KEY` in `.env`, or remove `POLLINATIONS_ENABLED=false`. |
| `The Gemini API key was rejected` | Mistyped or revoked. Keys: <https://aistudio.google.com/apikey> |
| `Gemini free-tier rate limit reached` | Wait a minute. A `--batch` makes nine calls in a row. |
| `Pollinations did not answer in time` | Free service, no uptime promise. Retry, or set `GEMINI_API_KEY`. |
| `Gemini declined the request` | Rephrase the topic. Medical framing is the usual cause. |
| `Unknown --type "..."` | Run `--list`. |
