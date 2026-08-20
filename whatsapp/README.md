# Grillo WhatsApp Content Generator

Writes ready-to-post content for the Grillo WhatsApp channel. Type a topic and an
audience, get back a post formatted for a phone screen that you copy straight into
WhatsApp.

**This is a standalone tool.** It does not import from `backend/` or `frontend/`, does
not touch the database, and does not need the Grillexa app to be running. It talks to
the Claude API and to nothing else.

## Setup

```bash
cd whatsapp
npm install
cp .env.example .env      # then put your key in .env
```

You need an Anthropic API key from <https://console.anthropic.com/settings/keys>. Put
it in `.env` as `ANTHROPIC_API_KEY=sk-ant-...`. `.env` is gitignored — the key never
goes near the repo.

Check it works:

```bash
npm run generate -- --list
```

## Using it

```bash
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
| `--topic` | What it is about. Leave it out and Claude picks something suitable. |
| `--tone` | `friendly` (default), `professional`, `playful`, `authoritative`. |
| `--language` | `english` (default), `telugu`, `hindi`. |
| `--quote-language` | Language of the `GRILLO SAYS` line only. Default `auto`. |
| `--slot` | `breakfast`, `lunch`, `snack`, `dinner`. Only with `--type=meal`. |
| `--product` | Which product, with `--type=product`. Random if omitted. |
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
| `habit` | A small habit offered as a week-long challenge |
| `product` | One Grillo product, kept deliberately minimal |
| `seasonal` | What is worth eating in the season we are in |
| `evening` | The quiet last post of the day |
| `customer` | A post built around something a customer actually said |

### Audiences

`general`, `elders`, `diabetics`, `young`.

**`general` is the only one that splits the post.** It writes the shared opening and
then separate `👵 FOR ELDERS`, `👶 FOR YOUNG ONES` and `🌿 FOR THE FAMILY` sections,
because "everyone" means showing everyone. Naming a specific audience produces one
focused post with no split.

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
writing posts ahead of time.

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

`lib/products.json` is the product catalogue for `--type=product`. It is a plain list —
add a product with its `facts`, and those facts are the **only** things the post is
allowed to state about it.

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

## Cost and model

One post is one API call on `claude-opus-5` — roughly a few thousand tokens in and under
a thousand out. `--batch` is eight of those, run one after another rather than in
parallel, which is both easier to read and less likely to hit a rate limit.

The brand voice and the exemplar are sent as a cached prefix, so a batch pays for that
part once rather than eight times.

Override the model with `CLAUDE_MODEL` in `.env` if you need to.

## When something goes wrong

Every failure prints one line saying what happened and one saying what to do, and exits
non-zero so it can be scripted.

| Message | Fix |
|---|---|
| `No Anthropic API key found` | Create `.env` from `.env.example` and put your key in it. |
| `The Anthropic API key was rejected` | Key is mistyped, revoked, or from another account. |
| `Rate limited by the Anthropic API` | Wait a minute. A `--batch` makes eight calls in a row. |
| `Claude declined to write this post` | Rephrase the topic. Medical framing is the usual cause. |
| `Unknown --type "..."` | Run `--list`. |
