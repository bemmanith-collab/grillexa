# Grillexa Growth Hunter

An MCP server that looks for revenue the store network is not yet taking, and
refuses to invent it where the data cannot support it.

It answers four questions:

- **Is this spot a gap, or would we be buying our own trade back?**
- **Where in a city are we not, that we should be?**
- **What can we honestly tell a retailer to get them to stock us?**
- **Which of the leads sitting in the table is worth the drive?**

It reads the same Postgres database the app uses, through the backend's own
generated Prisma client — there is no second schema here, so it cannot drift
from the migrations the app actually runs.

---

## Read this before you trust a number it gives you

The tools are built. The data underneath them is currently thin, in ways that
change what the answers mean:

| | |
|---|---|
| Stores | 8 |
| **Stores with coordinates** | **1** (`Anjji Kirana`, Adyar) |
| Stores with recorded sales | 6 — all of them the Bangalore rows, none of them geocoded |
| Sales | 324, spanning 14 days |

So today: every distance and gap is measured from a single point, and every
revenue figure comes from six shops that cannot be placed on a map. The one real
shop has no sales recorded against it.

**No tool hides this.** Every response carries a `dataQuality` block listing
exactly what it was standing on, and `generate_b2b_pitch_deck` prints the
warnings into the document itself, above the fold, so a pitch cannot be sent
without the sender seeing them.

The fix is `backfill_store_coordinates` — but read the warning under it first.

---

## Install

```bash
cd mcp-servers/grillexa-growth-hunter
npm install
npm test          # 25 checks, no database needed
```

`DATABASE_URL` is read from `backend/.env` automatically. Anything already in
the environment wins, so you can point it elsewhere without editing files.

The `RetailerLead` table it needs ships as a normal migration:

```bash
cd backend && npx prisma migrate deploy
```

## Add it to Claude Code

```bash
claude mcp add grillexa-growth-hunter -- node "C:/Users/bemma/grillexa/mcp-servers/grillexa-growth-hunter/index.js"
```

Or by hand, in `.claude/settings.local.json`:

```json
{
  "mcpServers": {
    "grillexa-growth-hunter": {
      "command": "node",
      "args": ["C:/Users/bemma/grillexa/mcp-servers/grillexa-growth-hunter/index.js"]
    }
  }
}
```

Then `/mcp` in Claude Code to confirm it connected. To point it at production
instead of your local database, add an `env` block with a different
`DATABASE_URL` — it takes precedence over `backend/.env`.

---

## Tools

### `evaluate_neighborhood_density(lat, lng, radius?)`

Gap or cannibalisation, for one point.

Every shop is treated as drawing from a circle — 800m by default, because
neighbourhood grocery is a walking trade. The overlap between the new circle and
each existing one is the **exact lens area of two intersecting circles**, not a
distance heuristic. Of the trade in that shared ground, half is assumed to move
to the new shop (`SHARED_ZONE_CAPTURE`); without knowing where customers
actually live inside the overlap, a more precise figure would be invented.

Verdicts: `GAP`, `INFILL`, `CANNIBALISATION_RISK`. The threshold is 20% of the
**affected** shops' trade — not the whole network's, or a doorstep clone would
be drowned in the denominator of a large network.

> A site overlapping a shop that has never recorded a sale returns
> `revenueAtRiskKnown: false` and falls back to the geometry. Absent revenue is
> not the same fact as no revenue at risk — that distinction was a live bug,
> caught by running this against the real network, and is now pinned by a test.

### `find_gap_opportunities(city, minDemandScore?, limit?, stepM?)`

Grids a city and ranks the ground we do not cover.

Score is `coverage gap × neighbour strength`, both 0–1:

- **coverage gap** — 0 when a shop sits on the point, 1 once it is a full
  catchment diameter clear of every existing shop.
- **neighbour strength** — how the nearest shops trade against the network
  median, capped at 1.5× so one outlier cannot dominate the map.

They multiply, so a candidate must be **both** uncovered and next to shops that
actually sell. Uncovered ground beside three failing shops is not an
opportunity; it is the same failure with a new lease.

Ground outside the 12km delivery range never enters the shortlist at any
threshold — it is counted in `outOfServiceRange` instead. Results are thinned to
1.5km apart so a shortlist is not twenty variations on one street corner.

**There is no external demand data here.** "Demand" is inferred entirely from
our own shops' performance. With census, footfall or competitor data this would
be a much better tool, and the shape of it would not have to change.

### `generate_b2b_pitch_deck(retailerName, retailerLocation?, nearbyStores?)`

A pitch built only from what the network can evidence.

Six slides, returned as structured JSON and rendered markdown. It leads with the
consignment offer — stock stays ours until it sells, unsold goes back — because
that is the genuinely persuasive thing and it is real in the schema.

It quotes only shops that actually recorded sales, **names them and the date
window** in a "where these numbers come from" footer, drops any comparable with
fewer than five trading days, and refuses to print a revenue line at all when
there are no sales behind it rather than quoting `Rs.0`.

### `score_retailer_lead(leadId?, persist?)`

Ranks one lead, or the whole open pipeline.

| Dimension | Points | What it measures |
|---|---|---|
| Location | 40 | Gap or cannibalisation, from the site evaluation |
| Serviceability | 20 | Distance to the nearest shop — an extra stop, or its own run |
| Footfall | 25 | Self-reported, weighted accordingly |
| Actionability | 15 | Can anyone actually be contacted |

Location and serviceability **pull against each other on purpose**: far enough
not to cannibalise is far enough to cost something to deliver to. A lead cannot
max both, and a scorer that let it would just be rewarding distance twice.

**Missing information lowers confidence, never the score.** A lead nobody has
visited is unknown, not bad. The score is out of the points that could actually
be judged, and `confidence` says how much that was — 100 at 40% confidence is a
shrug, not a lead.

### `add_retailer_lead(name, ...)`

Only `name` is required. A name and a phone number scribbled at a market is a
real lead, and a table that refuses it just moves the lead to somebody's
notebook. Give an `address` and it is geocoded so the lead can be scored on
location.

### `backfill_store_coordinates(apply?, storeIds?)`

Geocodes stores that have no pin, from their address, via the same free
Nominatim service the app already uses — one request per second, same
`User-Agent`, because being rate-limited under two names is how a project gets
blocked.

**Defaults to a dry run, and you should use it as one.** On the first run
against this network, three of six lookups were wrong: `Indiranagar`,
`Whitefield` and `Jayanagar` resolved to Chennai streets rather than the
Bangalore areas, because the search is biased toward the only existing pin,
which is in Chennai. A wrong pin is worse than no pin — it silently poisons
every distance computed afterwards, and nothing downstream can tell.

Check the proposed pins against what you know, then re-run with `apply: true`.
`accuracyM` is left null on purpose: a geocoded address is not a sensor reading,
and writing a fake radius would make a rooftop guess look like a GPS fix.

---

## Resources

| URI | What it is |
|---|---|
| `grillexa://network/overview` | Every store with its trade, coverage and pin status |
| `grillexa://stores/geocoded` | The subset every location answer is drawn from, plus pairwise distances |
| `grillexa://leads/pipeline` | Leads with their last score, best first |
| `grillexa://data-quality` | What every number here is standing on |

---

## Layout

```
index.js            MCP server — tool schemas and handlers, kept thin
src/analysis.js     All the maths. No database, no network, no clock.
src/queries.js      All the Prisma reads and the geocoder
test/analysis.js    25 checks that run under plain node
```

The split is the point: the rules that decide whether somebody drives across a
city are the rules worth testing, and rules that can only be exercised against a
live database are rules nobody checks.

Every invented number in `analysis.js` is a named constant with the reasoning
beside it — catchment radius, delivery range, shared-zone capture, the
cannibalisation threshold. A growth score that cannot be argued with is one that
gets ignored the first time it is surprising.
