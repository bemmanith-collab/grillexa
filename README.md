# Grillexa — Consignment, Billing & Stock

Stock and billing for a distributed retail business (sprouts, fruit bowls, bananas) supplying 50+ kirana stores. Goods go out to a store **on consignment** — not a sale until the store settles and says what actually sold. Also handles cash sales to walk-in customers, returns, wastage, and a daily per-store ledger.

- **Backend**: Node.js + Express, Prisma ORM, JWT in an httpOnly cookie, bcrypt
- **Frontend**: React (Vite), Chart.js, installable as an Android app (PWA)
- **Database**: PostgreSQL (Neon, Singapore)
- **Hosted**: Fly.io, region `sin`

## The consignment model

This is the core of the app. Everything else supports it.

1. **Deliver to Store** — goods go to a store on consignment. A Consignment Note is raised with line items and prices. **No revenue is recognised.** The stock is now sitting in the store, still owned by you.
2. **Settle Consignment** — opens on everything still awaiting settlement, however old, across every store the account can see; a second view adds the settled ones so a recent settlement can be corrected. Each row names who delivered it and who settled it last, to every role: everyone in the business can reach every one of these records, so a consignment that says SETTLED has to say who settled it. Later, the store reports what sold and what is coming back unsold. Settling generates a **Sale** for the sold portion (this is where revenue and GST are recognised) and a **Return** for the unsold portion. A consignment can be settled in more than one pass; `soldQty + returnedQty` can never exceed `deliveredQty`, and the database enforces that with a CHECK constraint.
3. **Direct Sale** — a cash bill straight to a walk-in customer. Billed and paid immediately, no consignment behind it. Can include RETURN lines, which credit the customer and subtract from the bill.

`Dispatches` is the pre-consignment HQ→store transfer flow. It is read-only history; new deliveries go through Deliver to Store.

## How the ledger works, and what it is not

Every (date, store, product) has one row:

```
opening → + received → − sold → − wastage → closing
```

`closing` carries into the next day's `opening`, and a write to a past date re-chains every later day forward.

**`opening` and `closing` are not displayed anywhere, deliberately.** Goods are never booked into the system before they are billed, so the running balance drifts negative as a matter of course and describes nothing real. What the business actually works from is **`consignmentQty`** — how much of a store's stock is still out on consignment, delivered but not yet settled.

The per-day movements (`received`, `sold`, `wastage`) *are* real: each one is a delivery, a bill, or a recorded wastage. Those are what the UI shows.

**Today's Stock opens on all stores at once** (`GET /api/stock/today?storeId=all`) — one row per product totalled across every store in scope, plus how many stores have reported today and the day's direct-sale takings. Someone who supplied thirty stores wants one sheet, not thirty. Picking a single store switches to that store's ledger rows. The all-stores view is read-only: unlike the single-store view it does not auto-create today's rows, because that would write products × stores rows on every page load.

`backend/scripts/recompute-ledger.js` rebuilds `opening`/`closing` from the recorded movements and `consignmentQty` from the consignment tables. Dry run by default; `--apply` writes in one transaction.

**`--apply` is not safe to run while the app is in use.** It reads every ledger row, computes the corrected values in memory, and only then writes — so a bill or settlement saved in between is invisible to the computation and gets overwritten by a `closing` derived from the movements as they were at read time. It also has no date filter: it rewrites the whole history, not a chosen window. Run it with nobody billing, after taking a backup, and keep the dry-run output — it is the only record of what changed. See *Checking the data* below.

## Prices

Unit prices are resolved **server-side from the product catalogue** (`backend/src/lib/pricing.js`), never trusted from the request. `GET /api/products` hides `price` from Sales accounts, so a Sales user's form has nothing to send back — trusting the client meant bills saved at ₹0.00 with stock correctly deducted and no error. Admin and Manager may override a price for a negotiated rate; a Sales account gets the catalogue price. Negative prices and fractional quantities are rejected.

**Editing a bill keeps the prices it already charged.** A correction to a phone number must not silently reprice the goods — the bill keeps its number, so a printed copy in someone's hand has to keep matching it. The old prices are read from the saved bill, never from the request, so an edit cannot smuggle a price past the Sales rule; a product added to the bill for the first time prices from the catalogue.

## Product order

Every list of products — the pickers on Deliver to Store and Direct Sale, Today's Stock, the Products page — is ordered by `Product.sortOrder` then by name, from one place (`backend/src/lib/catalogue.js`). Alphabetical order filed "Mixed fruit bowl" between "Green sprouts" and "Mixed sprouts"; nobody loading a van reads the list by spelling.

Numbers run in tens (10, 20, 30 …) so a product can be slotted between two others without renumbering, and `sortOrder` defaults to **100** so a product added without one lands at the end of the list rather than silently at the top. An Admin or Manager sets it in the **Order** column on the Products page.

Seeding it from a migration is worth doing carefully: the first attempt matched `lower(name) = 'mixed sprouts'`, matched no rows on the live catalogue, and left everything at 100 — which looks precisely like the deploy never happened, because alphabetical is the fallback. `backend/scripts/show-catalogue.js` prints the catalogue in the order the app lists it, with names bracketed so stray whitespace shows.

## Picking a store or a product

Fifty-odd stores in a `<select>` is a scroll marathon on a phone, so every store and product dropdown is a **searchable combobox** (`frontend/src/components/SearchSelect.jsx`): type any part of a name, matches are filtered case-insensitively and the matching text is highlighted. Arrow keys move, Enter picks, Escape closes; Enter with the list shut still submits the form. Rows are 44px so a thumb hits them, and the input is 16px so iOS doesn't zoom the page on focus.

Below six options it renders the plain native `<select>` instead: already touch-friendly, and a search box over four options is a step, not a shortcut. That is what a Sales account with a couple of stores sees, and — until the catalogue grows — what the product pickers show too.

**The results list is `position: fixed`, placed from JS.** Absolute positioning is clipped by whichever ancestor scrolls, and one of these pickers lives in a table cell inside `.table-scroll`: the list opened *inside* the horizontal scroller. Fixed escapes every clipping ancestor, at the price of following the field on scroll and resize, and of flipping above the field when there isn't room below — a line near the bottom of the form, or a phone keyboard eating half the screen.

**Recents are opt-in, per picker.** The stores this **device** picked most recently float to the top — recency, not frequency, because the store being delivered to today is nearly always one from this week's route. Products deliberately have none: the catalogue has one order for everyone (see Product order above), and a device's habits have no business reshuffling it. The `localStorage` key is the caller's, so no picker can mistake another's ids for its own — store 3 and product 3 are different things.

Stores: **Deliver to Store**, **Direct Sale**, **Today's Stock**, **Stock History**. Products: the **line items editor** (Deliver to Store, Direct Sale, Dispatches) and Stock History's filter. The filter pages pass an "All Stores"/"All products" row and the forms pass "Select a store…" through the same `firstOption` prop — a pinned row that is never counted as a recent pick. Settle Consignment has no store dropdown; it filters its list by a text search that already matches store names. The filtering and highlighting are pure functions in `frontend/src/lib/searchSelect.js`, covered by `frontend/test/searchSelect.js`.

## Store location

A store is a shutter on a street, and "Anna Nagar" typed into Maps lands a driver in the middle of a neighbourhood. So a store carries a **GPS pin** — `lat`/`lng`, captured on the phone while standing outside it.

**Adding one.** The 📍 Get Current Location button on the Stores page asks the browser for a fix, saves the coordinates, then reverse geocodes them to fill the address field. Everything it produces is a suggestion: the address is an ordinary editable field, and so are the coordinates — both can be typed over, and the latitude box accepts a whole `lat, lng` pair pasted straight out of Google Maps, which is how anyone fixing a wrong pin actually has the number to hand. A pin can be cleared outright; a bad pin is worse than none, because Directions trusts it over the address.

**It watches for a better fix instead of taking the first one.** The first reading a phone returns is usually the cheap one — wifi or cell tower, hundreds of metres out, sometimes kilometres — and the real GNSS fix arrives seconds later. `getCurrentPosition` hands back that first guess, which is what puts a store on the wrong road. So capture uses `watchPosition`, keeps the most accurate reading seen, stops early once it is within 50m, and settles for the best it managed after 12 seconds.

**Accuracy is recorded and shown, because a bad pin is otherwise invisible.** The browser reports the fix as a radius in metres, and that number is the only thing separating an 8m GNSS fix from a 5km guess — once saved they look identical, and the sole symptom is a driver arriving at the wrong shop. It is stored (`Store.accuracyM`) and shown in words, not just digits: **good** under 50m, **fair** to 500m, **poor** beyond, as `GPS accuracy: ±2.0km (poor — step outside)`. A bare radius means nothing to someone who has never thought about GPS accuracy; the word and the instruction are what carry it.

A poor fix **skips the address lookup entirely** — reverse geocoding a point that far out returns a confidently wrong street, and a wrong address that looks authoritative is worse than an empty box. The pin is still saved, and the capture button relabels itself to **📍 Try again — step outside**: it always retried, but after a bad fix it has to say so, or the reasonable reading is that GPS simply failed.

**Where GPS won't cooperate, Google Maps will.** On a fair or poor fix — or when there is no pin at all — a **Find it on Google Maps** link opens the map centred on the rough position (or searching the typed address), so the shop can be found by eye, long-pressed, and its coordinates pasted back. In dense Indian streets, and indoors, this is the dependable path rather than the fallback.

Null accuracy means no sensor estimate: a pin typed by hand, or one saved before this was recorded.

**The pin is applied before the address lookup is attempted**, not after. The lookup can be slow, rate-limited or down; the fix cannot be typed back in later, so it must never depend on the lookup succeeding. Every failure path — permission denied, no fix, timeout, lookup down — says what to do next and leaves the form usable.

The same button sits in the row editor as **📍 Re-capture**, because fifty stores were added before pins existed, and because a fix taken on a bad day needs replacing.

**Directions and Call are for every role**, not just an Admin: the people who drive to these shops are the ones who can't edit them. Directions opens `maps/dir/?api=1&destination=LAT,LNG` when there's a pin, and falls back to a name-and-address search when there isn't — labelled *(approx.)*, so the difference is visible before the drive rather than after. Call is a `tel:` link, shown only when the store has a number. Both are in `frontend/src/lib/storeLinks.js`, covered by `frontend/test/storeLinks.js`.

**Reverse geocoding goes through the API, not the page** (`GET /api/stores/reverse-geocode`, Admin only). Nominatim is free and asks in return for a User-Agent identifying the application — which a browser will not let script set — so the page cannot make this call politely. Routing it through the server also keeps `connect-src 'self'` intact, and gives somewhere to put a rate limit: the whole app shares one outbound IP, and a stuck retry loop would get that IP blocked for everyone. `backend/src/lib/geocode.js` composes the address; Nominatim files the same field under different keys depending on how an area was mapped, so a Chennai suburb arrives as `suburb`, `neighbourhood` or `city_district` and a city as `city`, `town`, `village` or `state_district`.

**Two headers had to change** (`nginx.conf`). `Permissions-Policy` denied geolocation to the whole app, so the button would have failed before the browser ever asked the user — it is now `geolocation=(self)`, still denied to any embedded frame. The CSP is unchanged: the geocode proxy is what makes that possible.

The address is stored as the single `Store.address` string the table already had, composed from the geocoded parts. The coordinates and the address text are **independent fields** — editing one never touches the other, and Directions always prefers the coordinates. Schema additions: `lat`, `lng`, `accuracyM`, and `phone` (`phone` because a Call button needs a number and there was nowhere to keep one).

## The Grilling Wisdom Planner

One line a day, to two audiences. **Sales people** get it on the dashboard card when they open the app; **customers** get it printed where the fixed "Thank you for shopping with us" used to sit on the footer of their bill — on screen, in the PDF, and in the WhatsApp text, which are now guaranteed to agree because the footer is resolved once in `BillDetailModal` and handed to all three. A Consignment Note keeps its own footer: that goes to a shopkeeper, not a customer, and is not the place for a word about breakfast.

Admin plans it at **/wisdom**: write a line, pick its audience, and either leave it in the daily rotation or pin it to a date. The page shows what both audiences are being told *today*, because the point of a planner is seeing what is actually live rather than what you hoped was.

**The pick is deterministic, and that is a fix, not a detail.** The old widget asked for a *random* quote on every request, so it changed on every page load — and the dashboard now refreshes itself every five minutes, which would have moved the quote under the reader several times an hour. One line per day, the same for everyone, so two people comparing notes are looking at the same thing. A message pinned to a date beats the rotation.

**No quote API serves this topic.** Checked before building on one: [API Ninjas](https://api-ninjas.com/api/quotes) offers twenty categories (wisdom, life, success, leadership…) and none for health, food, fitness or nutrition; the "nutrition APIs" that fill search results are food *databases*, not quotes. [ZenQuotes](https://docs.zenquotes.io/keyword-support-added-to-api-calls/) is the closest thing — it supports `keyword=`, which needs a registered key.

So the planner uses one **server-side**, day-cached (`connect-src` is `'self'`, same reason the geocoder is proxied — see *Store location*), and treats what comes back as *suggestions only*: `backend/src/lib/wisdom.js` filters for words about food and the body, drops anything over 160 characters (a bill footer is one line) and anything already in the plan, and an Admin approves each survivor into the form before it goes anywhere. **Nothing from a third party reaches a customer's bill unread by a person** — which matters when the text prints under your GSTIN. With `ZENQUOTES_KEY` set it queries `health`, `food` and `nutrition` directly; without one it filters a free unkeyed batch, so the feature works with no configuration, just less well. If the service is down the planner is unaffected — suggestions are a convenience, and the button says so.

The messages live in the `WisdomMessage` table rather than a source file, so the business edits its own words without a deploy. The fifteen original grilling lines were migrated in, plus staff lines about what is actually on the van ("Lead with the sprouts — a cup has more protein than an egg") and customer lines that thank before they suggest: a bill that lectures its reader is a bill that loses a customer.

## Personal metrics (the landing page)

Signing in lands on **My Dashboard** (`/`) — one salesperson's day, not the company's. Today's Stock moved to `/stock` and kept its place in the nav.

It shows: how many of your stores you got to, what you took, how that compares with the same weekday last week, consignments you settled, your top three products, where you rank against everyone else selling today, what needs chasing, and a 30-day trend line.

The **daily grilling quote** moved here from Today's Stock along with the landing page — a quote for the day belongs on the page you land on, and it sits under the ranking so the numbers still come first. Sales accounts get the prominent card, Admin and Manager the subtle one, exactly as before.

**What a visit means here.** Nothing in this app records a check-in. The GPS work pinned where stores *are*; it never tracked anyone arriving, and there is no `StoreVisit` table. So a visit is inferred from work that can only be done standing in the shop — a bill rung up, stock delivered, or a consignment settled at that store today. This is evidence, not attendance: **someone who walks into a shop and sells nothing counts as missed.** It is honest about what the data can support, and it works from the first day rather than waiting for everyone to start tapping a check-in button. Real check-ins (a `StoreVisit` row written from the phone's GPS on arrival, geofenced against `Store.lat/lng`) would replace `visitedStoreIds()` in `backend/src/lib/dashboard.js` and nothing else.

**Whose number is it.** Personal figures follow **who did the work** (`createdById`), not which store it happened at. Stores are shared between salespeople — crediting by store would pay two people for the same rupees and make the ranking meaningless. Settlement pressure is the one exception: an unsettled consignment is chased by whoever covers that shop, so pending/overdue alerts are scoped to your stores *or* your own deliveries.

**Ranking** is today's takings, highest first, over everyone who sold. Ties share the higher place, so two people level on ₹4,200 are both #2. A Sales account only ever learns its own rank and who is top — per-person amounts are company data and go to Admin/Manager only.

**Overdue** means two full days after delivery with the consignment still `DELIVERED` or `PARTIAL_SETTLED`. Same constant drives the pending count and the alert list, so they cannot disagree.

Admin and Manager land on **their own** metrics (they sell too) and switch with the picker: any individual, or *Everyone* for the company view. Company-wide **reporting** is unchanged and still lives in Reports.

The page refreshes every 5 minutes, but only while it is actually on screen — the app sits open in a pocket all day, and waking it to refetch a screen nobody is reading costs battery and data. Returning to the foreground refreshes immediately. Pull-to-refresh is implemented in the page: installed as an app there is no browser chrome to pull against, and that is the gesture everyone tries first.

No caching layer. It is 8 queries against one day of rows, in parallel; the one thing that actually mattered was an index on `Sale.date`, which every dashboard query needs and none had. Add caching when a measurement says it is slow.

## Charts, and the manager's workbook

Reports carries five charts and one filter bar — date range (Today / This week / This month / Custom), store, product, sales person — driving every figure on the page, charts and tables alike. **Tapping a mark drills down** by setting the filter it stands for: a store bar sets the store filter, a product slice or wastage bar sets the product filter, a bar on the sales-people chart sets the person filter, and a point on the trend line narrows the whole page to that day. Same state the dropdowns write, so there is one way in and one way back out.

**The person filter reaches what the data attributes, and says so where it does not.** Sales are credited by who rang the bill up (`createdById`) — the same rule the personal dashboard uses — so the trend, the product mix, the store bars and the P&L table all narrow to one person. Wastage and Units Moved cannot: a stock ledger row records a store and a day and nobody's name, so those two keep showing everything in range, with a line above each saying why rather than leaving someone to notice a chart that did not move. The Excel export is store-and-range wide for the same reason; its Salesperson Performance sheet is where per-person figures live.

All five series arrive in **one** response (`GET /api/reports/analytics`). Five endpoints would mean five round trips on a phone and five slightly different moments in time on one screen.

**Chart choices that are not taste.** Colour means identity in exactly one chart — the product doughnut — so that is the only one with a categorical palette (fixed order, so a product keeps its colour when a filter removes the one above it) and the only one with a legend; the rest are single-series and named by their heading. The palette is validated for colour-blind separation against the app's white cards rather than eyeballed. Long tails fold into one grey **Other** slice that keeps the money but cannot be drilled into, because it is a remainder, not a thing. A day with no sales is a **zero on the line, not a gap** — a line drawn straight across a dead Sunday reports a quiet week as a steady one.

`GET /api/reports/excel?from=&to=&storeId=` streams a six-sheet workbook: Summary, Store Performance, Product Performance, Salesperson Performance, Consignment Summary, Wastage Breakdown. Headers are bold on petrol with the row frozen and a filter on it, money is `₹#,##0.00`, percentages carry two decimals, dates are **real dates** in `dd/mm/yyyy` (text would not sort or filter by month, which is most of why anyone opens this in Excel), and columns are measured to their content. It runs the same aggregation as the charts (`backend/src/lib/analytics.js`), so the file and the screen cannot disagree.

**exceljs, not SheetJS.** The free build of SheetJS cannot write bold or filled cells — styling is a paid feature there — and bold filled headers on a frozen row are most of what makes six sheets readable. `backend/src/lib/excelReport.js` is the only file that would change to swap back.

Three columns that were asked for are **not** in the workbook, because the data behind them does not exist:

- **Wastage has no reason.** It is a counter on the daily stock ledger (`DailyStockEntry.wastage`), not an event log — there is no per-entry row to hang a reason on. Returns are the ledger that carries reasons. Wastage is valued at **cost**, not at the selling price: it is stock paid for and never sold.
- **Stores have no city**, only the one composed `address` string (see *Store location*), so the address goes out whole rather than guessed apart.
- **A consignment has no wastage figure.** Wastage is recorded against a store and a day, never against the consignment the stock arrived on; any per-consignment number would be invented. It is on the Wastage Breakdown sheet at the grain it actually exists at.

**Coverage %** on the salesperson sheet is stores reached ÷ stores assigned over the window, and nothing more blended — a number nobody can recompute in their head is a number nobody trusts when it is used to judge them. It is null, not 0%, for someone with no stores assigned.

Ranges are capped at 366 days: the window drives how many rows every query reads, and "all time" on a phone is a request nobody meant to make.

## Roles & permissions

| Action | Admin | Manager | Sales |
|---|:--:|:--:|:--:|
| My Dashboard (own personal metrics) | ✅ | ✅ | ✅ |
| Charts on Reports, Download Excel | ✅ | ✅ | ❌ |
| Dashboard for another person, or company-wide | ✅ | ✅ | ❌ |
| Today's Stock, Stock History | ✅ any store | ✅ any store | ✅ own stores |
| Deliver to Store (create / edit consignment) | ✅ any | ✅ any | ✅ own stores |
| Settle Consignment (incl. edit last settlement) | ✅ any | ✅ any | ✅ own stores |
| Direct Sale (create / **edit** a bill) | ✅ any | ✅ any | ✅ own stores |
| Record wastage, record returns | ✅ any | ✅ any | ✅ own stores |
| See product prices | ✅ | ✅ | ❌ |
| Reports (P&L, product sales) | ✅ | ✅ | ❌ |
| Dispatches (historical) | ✅ | ✅ | ❌ |
| Add / edit products | ✅ | ✅ | ❌ |
| Delete products | ✅ | ❌ | ❌ |
| Manage stores | ✅ | ❌ | ❌ |
| Manage users, reset passwords | ✅ | ❌ | ❌ |
| Grilling Wisdom Planner (plan what is said, to staff and customers) | ✅ | ❌ | ❌ |
| Change own password | ✅ | ✅ | ✅ |
| Store list | ✅ all, with staff | ✅ all, with staff | own stores, no staff names |

Enforced **server-side**, not merely hidden in the UI. Role and store assignments are re-read from the database on *every* request rather than trusted from the JWT, so a change takes effect immediately instead of at next login.

A Sales account can be assigned **several** stores. **There is no public signup** — an Admin creates every account from the Users page.

A Direct Sale bill can be corrected after the fact (`PATCH /api/sales/:id`): the original's stock effect is reversed and the corrected version applied, keeping the same bill number so a printed copy still matches. Bills generated by settling a consignment are refused — edit those from Settle Consignment, so the settlement and the consignment counters stay in agreement.

## Checking the data

Three pieces, in increasing order of how much damage they can do.

**`backend/scripts/integrity-check.js`** — read-only, writes nothing, safe against the live database at any time. Four checks over a date window: store-days with no ledger row, negative movements and over-settled consignment items, consignments delivered more than *n* days ago and still unsettled, and sale lines or bills priced at zero. Exits 1 if anything at ERROR level is found, so a scheduled job can tell "clean" from "look at this".

```bash
node scripts/integrity-check.js --from=2026-08-01 --to=2026-08-15 --stale-days=7
```

Note what it deliberately does *not* flag. `closing < 0` is reported as INFO, not an error: stock is never booked in before it is billed, so the running balance is expected to drift negative — see the ledger section above. Neither is a negative `received`, on its own. **Settling a consignment books the unsold stock going back to HQ as a negative receipt on the settlement date**, while the delivery was a positive receipt on an earlier date, so a store that took nothing in that day and sent something back correctly ends the day negative. The gross figure appears in the Returned column, from the `Return` ledger. What the check raises is a negative that the day's `CONSIGNMENT_UNSOLD` returns do not account for — `received + returnedToHq < 0` — which means something reduced receipts that was not stock going back.

That distinction was learned the hard way: the first version called any negative movement impossible and reported eleven correct rows as errors on its first live run.

**`.github/workflows/data-integrity.yml`** — runs that check at 06:00 IST daily and appends the output to `reports/data-integrity.md`, committed back to the repo. It runs the script over `flyctl ssh console` rather than connecting to Postgres from CI, because Managed Postgres is not open to the internet and putting a `DATABASE_URL` in GitHub secrets to change that is a worse trade than an SSH hop. Two things it needs to work: a `FLY_API_TOKEN` repository secret, and the script to be **deployed** — CI runs whatever is in the running image, not what is on the branch. GitHub's scheduler is best-effort and frequently late, so trust the timestamp inside the log rather than the cron line.

**`backend/scripts/verification-queries.sql`** — the reporting queries: revenue for a period split by direct versus settlement, top products net of returns, missing store-days, zero-priced lines, and stock delivered inside the window that is still unsettled. Every window is matched on the business date columns, never `createdAt`: `date` is a calendar day at midnight UTC, while `createdAt` is an instant, and anything billed after 18:30 UTC belongs to the next Indian business day.

## Importing offline sales & wastage

For days that were recorded on paper or in a spreadsheet before the app was in use. `POST /api/import/offline`, ADMIN/MANAGER only — it writes bills for any store on any date, which is exactly what a SALES account is scoped away from.

**The CSV.** One row per date × store × product; see `backend/scripts/offline-import-template.csv`.

```csv
date,store,product,soldQty,wasteQty,revenue,paymentMethod
2026-07-01,MG Road Store,Green Sprouts,42,3,1050,CASH
2026-07-01,MG Road Store,Mixed Fruit Bowl,0,4,,
```

Store and product names must match the catalogue (case-insensitively — check with `node scripts/show-catalogue.js`). `paymentMethod` is one of CASH, UPI, CARD, CREDIT, OTHER, and may be blank. Blank quantities mean zero. **`revenue` is required whenever `soldQty` is above zero and is what the bill is worth** — the sheet's money wins over the catalogue price, which is the entire point of importing it. Revenue with nothing sold is rejected as a contradiction rather than booked.

**Sending it.** The body is the CSV itself, so there is no file upload and no multipart dependency:

```bash
curl -X POST 'https://grillexa.fly.dev/api/import/offline?dryRun=true' \
  -H 'Content-Type: text/csv' --data-binary @offline.csv -b cookies.txt
```

Do the `?dryRun=true` pass first: it validates everything and writes nothing. Nginx's default 1 MB body limit and a 2000-row cap both apply; split larger files.

**Nothing is written unless every row is valid.** A bad row fails the whole file and every problem is reported at once, with line numbers, so the file gets fixed in one pass. A half-imported day of takings is worse than a rejected one: the ledger looks plausible and nothing says which rows are missing. The write itself is one transaction, with a raised timeout — `adjustStock` re-chains every later day for each product it touches, so backfilling old dates does real work per row.

**Re-running it is safe, in two different ways.** Bills are keyed `OFF-20260701-S3-P7`, derived from the row rather than a sequence, and `Sale.number` is unique — so a second import cannot create a second bill. Wastage has no audit row anywhere (`recompute-ledger.js` has to take it as recorded), so `DailyStockEntry.importedWastage` records what the import contributed and a re-run applies the *difference*: the same file twice is a no-op, a corrected file corrects the day, and wastage entered by hand through the app is never swallowed. Note the asymmetry — **a re-import corrects wastage but leaves an existing bill untouched**, reporting it per line as `skipped`. Fix a wrong bill in the app, not by re-importing.

Imported bills are Direct Sales (no consignment behind them), so they appear on the Sales list and in the day's takings exactly like walk-in bills. `paymentMethod` exists only on these — the app's own billing forms do not ask.

**Afterwards, run the ledger repair:**

```bash
node scripts/recompute-ledger.js            # dry run, prints what differs
node scripts/recompute-ledger.js --apply    # writes, in one transaction
```

The import cascades correctly on its own, but a backfill touches many past dates in one go and this is the cheap way to prove the chain: it rebuilds `opening`/`closing` from the movements and reports anything that disagrees. Read *How the ledger works* above before using `--apply` — **it is not safe to run while the app is in use** and it rewrites the whole history rather than the dates you imported. The dry run is safe at any time, so run that first and keep its output.

**Cross-tab sheets** go through `backend/scripts/crosstab-to-csv.js` first, which flattens products-down-the-side, dates-across-the-top into the columns above:

```bash
node scripts/crosstab-to-csv.js sheet.csv --store "MG Road Store" --payment UPI > offline.csv
```

It reads a CSV export (not `.xlsx` — no spreadsheet library), recognises `YYYY-MM-DD`, `DD/MM/YYYY` and `DD-MM-YYYY` in column headers along with a metric word (sold/qty/units, waste/wastage/damage, revenue/amount/total), copes with `₹`, thousands separators and `-` for nil, and drops the Total row. The sheet has no store column, so `--store` is required; run it once per store. **If a sheet is shaped differently, only `readCrosstab()` needs changing** — everything downstream works off the flat records it yields.

## Sessions & browser hardening

The session is a JWT in an **httpOnly cookie** (`grillexa_session`), not a Bearer token in `localStorage` — no script on the page can read it, the app's own or one injected through an XSS. `sameSite: strict` is the CSRF defence; `secure` is set in production only, because local dev has no TLS. `POST /api/auth/logout` clears it server-side: a browser cannot delete a cookie it cannot read, so logout used to be a claim the client made about itself.

`/api/auth` is rate-limited to 30 requests per 15 minutes, **counting failures only** — a whole shop shares one connection, and staff signing in successfully must never eat the budget that stops someone guessing passwords. `trust proxy` is set so the limiter sees the real client via Nginx's `X-Forwarded-For` instead of counting everyone as `127.0.0.1`.

Security headers and the CSP are set **once, by Nginx**, for everything including proxied API responses (`nginx.conf`). helmet was tried and removed: it duplicated every header and disagreed with one of them, sending both `X-Frame-Options: SAMEORIGIN` and `DENY`. Node is only reachable through Nginx, so one source is correct and two is a bug waiting to happen.

`script-src` is `'self'` with no `'unsafe-inline'`. That is only possible because `index.html` carries no inline script at all — hence `frontend/public/boot.js` (install-prompt capture and boot diagnostics) and `legacy.js` (the "this browser is too old" message for engines that ignore ES modules). Anything added inline to `index.html` will be blocked in production and work fine in dev, which is the worst way to find out.

## Project structure

```
grillexa/
├── .github/workflows/
│   └── data-integrity.yml   daily read-only check, logs to reports/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma   User, Store, Product, DailyStockEntry,
│   │   │                   Consignment(+Item), Settlement(+Line),
│   │   │                   Sale(+Line), Return,
│   │   │                   DispatchInvoice(+Line)
│   │   ├── migrations/     18 migrations
│   │   └── seed.js         local only — refuses to run with NODE_ENV=production
│   ├── scripts/
│   │   ├── recompute-ledger.js   ledger repair, dry run unless --apply
│   │   ├── integrity-check.js    read-only data checks over a date window
│   │   ├── smoke-analytics.js    post-deploy check of the charts + Excel
│   │   │                         endpoints, run inside the machine
│   │   ├── show-catalogue.js     product order as the app lists it
│   │   ├── crosstab-to-csv.js    cross-tab sheet → offline import CSV
│   │   ├── offline-import-template.csv  the import's columns, filled in
│   │   └── verification-queries.sql  reporting/reconciliation SQL
│   ├── src/
│   │   ├── lib/         stock.js (ledger + cascade), pricing.js (catalogue
│   │   │                prices), scope.js (store access),
│   │   │                dashboard.js (personal metrics arithmetic),
│   │   │                analytics.js (chart + export aggregation),
│   │   │                excelReport.js (the six-sheet workbook),
│   │   │                wisdom.js (which line runs today, and what
│   │   │                counts as on-topic from a quote API),
│   │   │                catalogue.js (one product order for every list),
│   │   │                geocode.js (reverse geocode via Nominatim),
│   │   │                offlineImport.js (CSV parse, validate, write)
│   │   ├── middleware/  auth.js (cookie session), role.js
│   │   ├── routes/      auth, users, products, stores, stock, consignments,
│   │   │                sales, returns, dispatches, reports, quotes, import,
│   │   │                dashboard
│   │   ├── app.js       CORS, cookie parser, login rate limit, route mounting
│   │   ├── db.js
│   │   └── index.js
│   ├── test/            crash-guards.js, stock-cascade.js, stock-rollup.js,
│   │                    pricing.js, consignment-list.js, offline-import.js,
│   │                    geocode.js, dashboard.js, analytics.js, wisdom.js,
│   │                    fake-tx.js (shared in-memory Prisma)   (npm test)
│   └── .env.example
├── frontend/
│   ├── public/          manifest.json, sw.js, icons (PWA), boot.js and
│   │                    legacy.js (external so the CSP can ban inline script)
│   ├── src/
│   │   ├── api/client.js         axios, withCredentials, 401 → /login
│   │   ├── context/AuthContext.jsx
│   │   ├── components/  Chart (chart.js canvas + dataset builders),
│   │   │                Sidebar (browser tab gets the website nav, installed
│   │   │                app gets the tab bar), DatePager, LineItemsForm,
│   │   │                BillDetailModal, WastageModal, StockDetailModal,
│   │   │                StoreAssignModal, ChangePasswordModal,
│   │   │                ResetPasswordModal, InstallAppButton, DailyWisdom,
│   │   │                ProtectedRoute, RouteErrorBoundary, Toast, Spinner,
│   │   │                EmptyState, SearchSelect (the searchable
│   │   │                store/product dropdown),
│   │   │                icons.jsx
│   │   ├── lib/         businessInfo.js, invoice.js (jsPDF), format.js,
│   │   │                greeting.js, reorder.js, returnReasons.js,
│   │   │                searchSelect.js (filter/highlight/recents),
│   │   │                storeLinks.js (maps and tel: links)
│   │   ├── utils/date.js         business-timezone "today"
│   │   └── pages/       Login, Dashboard (personal metrics, the landing
│   │                    page), WisdomPlanner,
│   │                    page), Inventory (Today's Stock), DeliverToStore,
│   │                    SettleConsignment, DirectSale, Sales, Dispatches,
│   │                    Products, StockHistory, Reports, Stores, Users
│   ├── test/            invoice.js, greeting.js, searchSelect.js,
│                         storeLinks.js   (npm test)
│   └── vite.config.js   dev proxy, build target down to iOS 14
├── Dockerfile        production image for Fly (backend + frontend + Nginx)
├── entrypoint.sh     runs `prisma migrate deploy`, then Node + Nginx
├── nginx.conf        production Nginx — serves the SPA, proxies /api and
│                     /health, and sets every security header and the CSP
├── fly.toml          Fly config — region sin, internal_port 4000
├── docker-compose.yml  local Postgres only
└── README.md
```

Fly builds **only** the root `Dockerfile`, `nginx.conf` and `entrypoint.sh`. There are no other Dockerfiles or nginx configs; earlier duplicates under `backend/` and `frontend/` were removed because editing the wrong one silently did nothing.

## Local development

Node 20+ and a reachable Postgres. `docker compose up -d` starts one on `localhost:5432`.

```bash
cd backend
cp .env.example .env        # set DATABASE_URL and JWT_SECRET
npm install
npx prisma migrate deploy
npm run seed                # optional demo data
npm run dev                 # http://localhost:4000
npm test                    # no database needed
```

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

To check UI changes on a phone over the LAN without running Postgres locally, point the dev server at the deployed API:

```bash
VITE_API_PROXY=https://grillexa.fly.dev npm run dev
```

That talks to the **real database** — browse freely, but don't test billing through it.

### Seed data

`npm run seed` creates a demo catalogue, six sample stores, and logins with the password `ChangeMe123!` (`admin@grillexa.local`, `manager@grillexa.local`, one per store). It also backfills 14 days of randomised history.

It **refuses to run when `NODE_ENV=production`**, because `npm run seed` picks up whatever `DATABASE_URL` is in the environment. Delete or change these accounts before any real use.

## Deploying to Fly.io

```bash
flyctl deploy -a grillexa      # from the repo root — fly.toml points at ./Dockerfile
```

`entrypoint.sh` runs `prisma migrate deploy` on every container start, before Nginx binds. A migration that fails therefore stops the app from starting: it will not roll back on its own, and needs `flyctl ssh console` and `npx prisma migrate resolve`. Before deploying anything with a migration, know your restore path:

```bash
npx neonctl@latest branches list            # branches, one per restore point
# or restore from the last pg_dump — see below
```

Database is **Neon** (free tier, `ap-southeast-1` Singapore), reached over the public internet from Fly `sin`. Measured from the app machine: **3ms warm, 432ms on the first query after idle** — Neon suspends the compute after ~5 minutes of no queries, so the first action of the morning pays that wake-up once. The `/health` endpoint deliberately does **not** touch the database; if it did, the health check every 15s would keep the compute awake permanently and burn the free tier's 191.9 monthly compute-hours in about eight days.

`DATABASE_URL` uses Neon's **direct** endpoint, not the `-pooler` one. `entrypoint.sh` runs `prisma migrate deploy` on every boot and Prisma migrations are not reliable through PgBouncer. If connection counts ever outgrow the direct endpoint, the fix is a `directUrl` in `schema.prisma` — not simply swapping in the pooled string.

Moved off Fly Managed Postgres on 2026-08-05: a Basic cluster provisioned 10GB to hold **9.6MB** of data, at ~$38/month against ~$0. Migration was `pg_dump --schema=public --no-owner --no-acl` → `psql`, verified by comparing exact row counts, all 13 sequence `last_value`s, constraint/index counts and `_prisma_migrations` on both sides, then running `integrity-check.js` against the new database before cutting over.

Two things that bite on this restore path, both already handled in the dump command above: extensions (`pg_stat_monitor`, `pgaudit` are Percona/Fly-specific and do not exist on Neon — scoping the dump to `--schema=public` leaves them out), and `CREATE SCHEMA public` colliding with the one Neon creates for a new database.

The app image is stateless and holds no volume, so replacing a machine cannot lose data.

`min_machines_running = 1` is deliberate: a cold boot is ~26 seconds because `prisma migrate deploy` runs before Nginx binds, and once the app is installed to a phone home screen that delay is a blank splash screen.

## Installing on a phone

The app is a PWA. On **Android**, Chrome offers **Install app** — there is also a button inside the app under **More**. It installs as a real WebAPK: home-screen icon, no address bar, and it updates itself on deploy. No store account, no APK to distribute.

On **iPhone** there is no install prompt in any browser (they are all WebKit); use **Safari → Share → Add to Home Screen**.

The login greeting is worth knowing about here: the installed app starts at `/` and restores its session from the cookie rather than logging in, so greeting on login alone meant the people who use the app most never saw one. It now also greets on the first open of the day per device (`grillexa_greeted_on` in `localStorage`), and an explicit login always greets.

The service worker caches nothing, deliberately — this app writes bills, and a cached page showing yesterday's consignments as current is worse than a plain connection error.

## Environment variables (backend)

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string — Neon's **direct** endpoint in production, never the pooled one. A Fly secret, never committed |
| `JWT_SECRET` | Signing secret. The app refuses to start without it |
| `JWT_EXPIRES_IN` | Token lifetime, default `8h` |
| `PORT` | Node's port — `4000` locally, `4001` inside the Fly image where Nginx owns `4000` |
| `CORS_ORIGIN` | Comma-separated allowed origins. Unset means "reflect the caller's origin" — a literal `*` is illegal alongside the credentialed cookie, so the config sends back the caller instead. Not needed on Fly, where Nginx serves the app and API from one origin |
| `NODE_ENV` | `production` in the Fly image. Sets `secure` on the session cookie, and makes `npm run seed` refuse to run |
| `BUSINESS_UTC_OFFSET_MINUTES` | Business day offset, default `330` (IST). Both the server and the browser resolve "today" with this, so a device in another timezone can't disagree with the ledger |
| `ZENQUOTES_KEY` | **Optional.** Lets the Wisdom Planner's suggestion button query ZenQuotes by keyword (`health`, `food`, `nutrition`) instead of filtering a free unkeyed batch. Everything else about the planner works without it |

Read from the environment or `.env`. One exception worth knowing: the business's own name, address and FSSAI licence number are hardcoded in `frontend/src/lib/businessInfo.js` because they are printed on every invoice. Not secret, but they are per-business and would need changing for anyone else.

## API overview

| Method | Path | Access |
|---|---|---|
| POST | `/api/auth/login` | Public — sets the session cookie, rate-limited |
| POST | `/api/auth/logout` | Public — clears the session cookie |
| GET | `/api/auth/me` | Authenticated |
| POST | `/api/auth/change-password` | Authenticated |
| GET/POST/PATCH/DELETE | `/api/users`, `/api/users/:id` | Admin |
| GET | `/api/products` | Authenticated (price hidden from Sales) |
| POST/PATCH | `/api/products`, `/api/products/:id` | Admin, Manager |
| DELETE | `/api/products/:id` | Admin |
| GET | `/api/stores` | Authenticated — Sales sees only its own stores, without staff names |
| POST/PATCH/DELETE | `/api/stores`, `/api/stores/:id` | Admin |
| GET | `/api/stock/today?storeId=&date=` | Authenticated, store-scoped. `storeId=all` totals every store in scope |
| GET | `/api/stock/history?storeId=&productId=&from=&to=` | Authenticated, store-scoped |
| POST | `/api/stock/:storeId/:productId/wastage` | Authenticated, store-scoped |
| GET | `/api/consignments`, `/api/consignments/:id` | Authenticated, store-scoped. Unfiltered returns the newest 200; `?status=` returns every match |
| GET | `/api/consignments/latest/:storeId` | Authenticated, store-scoped |
| POST/PATCH | `/api/consignments`, `/api/consignments/:id` | Admin, Manager, Sales |
| POST | `/api/consignments/:id/settle` | Admin, Manager, Sales |
| PATCH | `/api/consignments/:id/settlements/:settlementId` | Admin, Manager, Sales |
| GET | `/api/sales`, `/api/sales/:id`, `/api/sales/latest/:storeId` | Authenticated, store-scoped |
| POST/PATCH | `/api/sales`, `/api/sales/:id` | Admin, Manager, Sales |
| POST | `/api/import/offline?dryRun=` | Admin, Manager — CSV body, not JSON |
| GET/POST | `/api/returns` | Authenticated, store-scoped |
| GET | `/api/dispatches`, `/api/dispatches/:id` | Admin, Manager |
| POST | `/api/dispatches` | Admin, Manager |
| GET | `/api/reports/summary`, `/pnl`, `/product-sales` | Admin, Manager — the last two take `?from=&to=&storeId=` (plus `?userId=` on pnl, `?productId=` on product-sales), or the older `?days=` |
| GET | `/api/reports/analytics?from=&to=&storeId=&productId=&userId=` | Admin, Manager — every chart series in one response |
| GET | `/api/reports/excel?from=&to=&storeId=` | Admin, Manager — six-sheet .xlsx attachment |
| GET | `/api/dashboard/salesperson?userId=&date=` | Authenticated — Sales always gets its own day, whatever it asks for; `userId=N` or `userId=all` is Admin/Manager only |
| GET | `/api/quotes/today?audience=STAFF\|CUSTOMER` | Authenticated — the day's line for the dashboard card or the bill footer |
| GET/POST/PATCH/DELETE | `/api/quotes`, `/api/quotes/:id` | Admin — the plan itself |
| GET | `/api/quotes/suggestions` | Admin — candidate lines pulled from ZenQuotes and filtered to food/health |

## Tests

```bash
cd backend && npm test
cd frontend && npm test
```

No framework, no database, no browser — plain Node scripts that print `ok` lines.

Backend, ten files:

- `test/crash-guards.js` — malformed request bodies return 400 rather than killing the process (an unhandled rejection in an async handler exits Node on Express 4), `todayStr` is ISO and round-trips, and public signup stays gone.
- `test/stock-cascade.js` — the ledger cascade against an in-memory Prisma stub: back-dated writes re-chain later days, moving a document between dates leaves nothing behind, and reversing a bill restores stock exactly.
- `test/stock-rollup.js` — the all-stores sheet's arithmetic: every product gets a row even with no movement, day totals add up across stores, and consignment units come from the open consignments rather than a carried-forward balance — so the units column and the value card can't drift apart.
- `test/pricing.js` — prices come from the catalogue, a Sales account cannot override one, an edit keeps what the bill already charged, and a product new to the bill prices from the catalogue.

- `test/consignment-list.js` — who sees which consignments, and how many: a manager or admin is never store-scoped (with or without a status filter), a Sales account always is, and the outstanding list is never truncated while the history list still is.
- `test/dashboard.js` — the numbers people are ranked on: a return subtracts from its product rather than inflating it, a product only returned today is not a "top seller", a tie shares the higher place, a blank baseline gives no percentage instead of an invented one, and the oldest unsettled consignment is chased first.
- `test/analytics.js` — the arithmetic behind the charts and the workbook, which are the same arithmetic: a dead day is a zero on the line rather than a gap the chart draws straight through, returns subtract, wastage is valued at cost, a long tail folds into one "Other" that keeps the money, and coverage is null (not 0%) for someone with no stores. The last test writes a real workbook and reads it back — six sheets, bold filled frozen headers, ₹ formats, and dates that arrive as dates rather than as text that cannot be sorted.
- `test/wisdom.js` — the planner: a day's message is the same every time it is asked and does not depend on the order the database returned rows in, a message pinned to a date beats the rotation, a switched-off line is never shown, an empty planner is null rather than a crash, and the relevance filter keeps "Let food be thy medicine" while rejecting "Be the change you wish to see" — and is not fooled by "create" containing "ate" or "wealthy" containing "health".
- `test/offline-import.js` — the offline CSV import end to end without a database: the parser (quotes, CRLF, a UTF-8 BOM), every rule that stops a bad row reaching the ledger, and the write path against the same in-memory Prisma stub — a re-import creates no second bill and adds no second lot of wastage, a corrected file applies the difference, and wastage entered by hand is not swallowed.

`test/fake-tx.js` is not a test: it is the in-memory Prisma stub `stock-cascade.js` and `offline-import.js` share, so there is one fake to keep honest rather than two that drift. It applies the schema's column defaults on insert the way Postgres does — a fake that returned a defaulted column as `undefined` turned the import's wastage delta into `NaN`, which looked exactly like a bug in the code.

Frontend, two files:

- `test/greeting.js` — the login greeting's name and time-of-day boundaries. Everyone who logs in sees it, and a greeting can't fail, only be wrong.
- `test/invoice.js` — a Consignment Note never calls itself an invoice. Both renderers (the WhatsApp text and the PDF) are checked against the same `documentOptions`, the PDF by building it in Node with jsPDF and reading the labels back out of the finished document.
