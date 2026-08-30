# Grillexa — Consignment, Billing & Stock

Stock and billing for a distributed retail business (sprouts, fruit bowls, bananas) supplying 50+ kirana stores. Goods go out to a store **on consignment** — not a sale until the store settles and says what actually sold. Also handles cash sales to walk-in customers, returns, wastage, and a daily per-store ledger.

- **Backend**: Node.js + Express, Prisma ORM, JWT in an httpOnly cookie, bcrypt
- **Frontend**: React (Vite), Chart.js, installable as an Android app (PWA)
- **Database**: PostgreSQL (Neon, Singapore)
- **Hosted**: Fly.io, region `sin`

**[TEAM-GUIDE.md](TEAM-GUIDE.md)** is the staff-facing how-to — install, the daily flow, adding a shop. This file is the design record and is not written for them.

## The consignment model

This is the core of the app. Everything else supports it.

1. **Deliver to Store** — goods go to a store on consignment. A Consignment Note is raised with line items and prices. **No revenue is recognised.** The stock is now sitting in the store, still owned by you.
2. **Settle Consignment** — opens on everything still awaiting settlement, however old, across every store the account can see; a second view adds the settled ones so a recent settlement can be corrected. Each row names who delivered it and who settled it last, to every role: everyone in the business can reach every one of these records, so a consignment that says SETTLED has to say who settled it. Later, the store reports what sold and what is coming back unsold. Settling generates a **Sale** for the sold portion (this is where revenue and GST are recognised) and a **Return** for the unsold portion. A consignment can be settled in more than one pass; `soldQty + returnedQty` can never exceed `deliveredQty`, and the database enforces that with a CHECK constraint.
3. **Direct Sale** — a cash bill straight to a walk-in customer. Billed and paid immediately, no consignment behind it. Can include RETURN lines, which credit the customer and subtract from the bill.

**Sold and returned come out of the same pile, and the settle form says so per row.** Each input caps at that item's remaining quantity on its own, which let 5 sold + 5 returned through against 5 remaining — the server rejected it, correctly, but only after a round trip. The form now flags the offending row in the **Remaining** column ("5 · over by 5") and disables the submit button. Per row rather than in the error banner at the top: on a phone the banner sits off-screen above a long list of products, so the only place the message is certain to be read is next to the fields that caused it. The server check stays where it was — it is the one that matters, and the client cannot be trusted to have run.

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

**"Reorder from Last …" is the opposite case, and repeats the order but not the price.** The shortcut on Deliver to Store and Direct Sale copies the previous document's products and quantities, then prices them from *today's* catalogue (`frontend/src/lib/reorder.js`). Carrying the old `pricePerUnit` across re-billed a repeat order at last month's price, and silently — the field looked filled in, so nobody checked it. A product with no catalogue price comes across blank, which the server reads as "use the catalogue price"; it is never sent as an explicit `0`, which the server takes as a deliberate override and would save the bill at zero. A product that has left the catalogue since is dropped and named in a warning rather than silently shrinking the order.

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

**It watches for a better fix instead of taking the first one.** The first reading a phone returns is usually the cheap one — wifi or cell tower, hundreds of metres out, sometimes kilometres — and the real GNSS fix arrives seconds later. `getCurrentPosition` hands back that first guess, which is what puts a store on the wrong road. So capture uses `watchPosition` and keeps the most accurate reading seen.

**It stops when the readings stop improving, not on a fixed clock.** Under 15m there is nothing left to wait for — that is hardware GPS under open sky, so the watch ends on sight. Otherwise a timer re-arms **each time the fix gets better** and ends the watch once the improvements stop: 2.5s when the fix is already usable, 8s when it is still too coarse to keep. That second one is also the stall guard — a phone on a weak network stops delivering readings without ever calling the error handler, and nothing else would notice. The 25s ceiling is the last resort, not the normal path; the numbers are constants at the top of `frontend/src/pages/Stores.jsx` and are meant to be tuned against real captures.

**"Improving" has to mean improving, not arriving.** The timer used to re-arm on every reading, and a phone delivers roughly one a second — almost none of them better than the best already held. So it was pushed back before it could ever expire, the early exit never fired, and every capture that was not under 15m ran the full 25s ceiling with someone stood in the street holding a phone out. It re-arms only on an actual improvement now. It is still armed by the first reading, so it remains the stall guard it was meant to be.

**Accuracy is recorded and shown, because a bad pin is otherwise invisible.** The browser reports the fix as a radius in metres, and that number is the only thing separating an 8m GNSS fix from a 5km guess — once saved they look identical, and the sole symptom is a driver arriving at the wrong shop. It is stored (`Store.accuracyM`) and shown in words, not just digits: **perfect** under 15m, **good** to 65m, **fair** to 200m, **poor** beyond, as `GPS accuracy: ±2.0km (poor — step outside)`. 65 rather than the textbook 50 because a Chennai street is a strip of sky between two buildings: a real GNSS fix there lands in the 50-65m band, and calling that "fair" sends someone back outside to re-capture a pin that was already right.

Four tiers, three colours — perfect and good share the green, because both mean "no action" and the badge already prints the tier word. **Colour carries urgency, wording carries gradation.** `unknown` is its own case and deliberately grey: a null accuracy is a pin typed by hand, which is neither reassuring nor alarming, and must never render as the best tier just because `null <= 15`. A bare radius means nothing to someone who has never thought about GPS accuracy; the word and the instruction are what carry it.

**Only perfect and good fixes get an address lookup** — anything past 65m skips it. Reverse geocoding a coarse point returns a confidently wrong street, and a wrong address that looks authoritative is worse than an empty box: the empty one gets typed in, the wrong one gets trusted. A fair fix (65-200m) usually *does* land on the right road, and that "usually" is exactly the problem — nobody downstream can tell the times it did from the times it didn't. The two skipping tiers say different things, because they have different fixes: fair is "close, but not close enough to name the street", poor is "your phone used wifi or the mobile network, not GPS — step outside".

The pin is kept in every case. It is the part that cannot be typed back in later. The pin is still saved, and the capture button relabels itself to **📍 Try again — step outside**: it always retried, but after a bad fix it has to say so, or the reasonable reading is that GPS simply failed.

**Or pick it off a map.** **Pick on map** opens a Mapbox GL map: tap to drop a pin, drag it to adjust, and search a road or landmark to get to the right street first. It works for a store added from the office, for one whose GPS fix came back kilometres wide, and for the fifty that were added before pins existed. Editing a store opens the map already centred on its pin.

**A map-picked pin records no accuracy**, deliberately — `accuracyM` is set to null, exactly as it is for a pair typed by hand. Nothing measured it, so it reads as `unknown` in the badge rather than claiming a precision it does not have. That is the whole point of storing accuracy: an invented number would make an eyeballed pin indistinguishable from an 8m GNSS fix.

**Pasting coordinates into the search box is the exact route, and needs no network.** `17.3779, 78.5174` is already the answer — it jumps straight there, spends no rate-limit budget, and is more precise than any search can promise. This is the reliable way out of Google Maps: long-press the shop there, copy the numbers, paste them here.

**The coordinate boxes hold what was typed, not the number read back out of it.** They were controlled by the parsed value, and a box like that cannot be typed into: press `.` after `17` and the box holds `17.`, which is not a number yet, so the parse re-rendered the box from what it could read and the dot was gone before the next digit arrived. Typing `17.4400` by hand produced `4400`, and backspacing through the dot of a saved pin wiped the pin. Pasting always worked, because a paste is a single change event — which is exactly why it survived this long, since the instructions tell people to paste. `CoordInput` in `frontend/src/pages/Stores.jsx` keeps the text; the parsed number still goes up to the form on every keystroke, so nothing downstream sees a string, and a fix arriving from GPS or the map still lands in the box. Every other numeric input in the app already kept the raw string — these were the odd ones out, because they are the only ones that have to split a pasted pair across two fields.

**A pair is two numbers and nothing else** — the pattern is anchored to the whole string, and that anchoring is the entire point. Reading a pair as "the first two numbers anywhere in the text" makes an Indian door number a coordinate: `8-2-120/1, Banjara Hills` parses as `(8, -2)`, which is in the Gulf of Guinea and passes every range check there is, so typing an ordinary address into the search box dropped a pin in the Atlantic instead of searching — no lookup, no warning. `Shop 17, Road 78` is the same bug in disguise: `(17, 78)` is in Maharashtra, so it looks like an ordinary Indian pin and nothing on screen says otherwise. Anything with a word in it, a third number, or a hyphen where the separator should be is an address, and it falls through to the geocoder — the safe direction to be wrong in, because a search that finds nothing is visible and a pin in the Atlantic is not. The same parser backs both coordinate boxes, so all three entry points were fixed at once (`frontend/src/lib/storeLinks.js`, covered in `frontend/test/storeLinks.js`).

**A pasted Google Maps share link is resolved where it can be, and refused honestly where it can't.** A long link carrying `@lat,lng` or `!3d…!4d…` is read straight from the URL with no request at all. A short `maps.app.goo.gl` link is followed, and the coordinates are taken **only from the URL it lands on** — never from the page body. Google's HTML contains unrelated coordinate-shaped numbers: scraping it for a Hyderabad shop returns a point in New Jersey, with nothing on screen to say it is wrong. A silently misplaced pin is worse than none, because it survives into Directions. Many short links resolve to a Google place id (`ftid=…`) with no position anywhere — turning that into a point needs the paid Places API, so the app says so and gives the long-press route instead of guessing.

**Only Google's own map hosts are ever fetched** (`maps.app.goo.gl`, `goo.gl`, `maps.google.com`, `google.com`). A server that follows a URL a user supplied is a request-forgery hole otherwise — an internal address, a cloud metadata endpoint, anything reachable from inside the network. The allowlist is the entire defence, so it is a literal list rather than a pattern, and `https://maps.app.goo.gl.evil.com/` fails it.

**The map opens where the shops are, and nothing hardcodes a city.** A store with a pin opens on it; one without opens on the **most recently added store that has a pin** — someone adding shops today is working one area, and that is the best available guess at where the next one is. Not an average of every pin: across two cities that lands the map in the countryside between them. The one hardcoded coordinate is reached only before any store anywhere has a pin, i.e. once in the life of the database.

**Search results are ranked near those same shops.** The page passes `near=lat,lng` and the lookup adds a ±0.5° viewbox (about 55km — a metro and its outskirts). Without it, a common road name ranks by how thoroughly a city is mapped: "MG Road" returns Bengaluru, when the store is in Hyderabad. It is `bounded=0`, a preference and not a restriction, so a shop in a new city stays findable through the very screen used to add the first store there.

**A six-digit query is treated as a PIN code** when Nominatim is the one answering, not as text — it goes to Nominatim's structured `postalcode` parameter rather than free-text `q`, which is what the postcode index is built for; free text can match a house number or a road that happens to contain the digits. The two cannot be combined, since a request carrying both is rejected. `600040` lands on Anna Nagar, and from there the pin gets dragged to the shutter.

**The search box is a `<div>`, not a `<form>`.** It renders inside the Add Store form, and a nested `<form>` is invalid HTML — the parser discards the inner one, so `onSubmit` never fires and the submit button submits the *outer* form. Searching for a place was attempting to save the store. Every button in the picker is `type="button"`, and Enter in the search box is intercepted, for the same reason.

**The search goes through the server** (`GET /api/stores/geocode?q=`), for the same reasons reverse geocoding does — the paid Mapbox token never reaches a browser, the page cannot set the User-Agent Nominatim's policy asks for, and `connect-src` needs no geocoding host. It shares the reverse lookup's rate limiter, because both directions spend one budget. Results are capped at five and biased to India: without the country filter, "Adyar" also matches places in three other countries, and a list whose right answer is fourth is a list nobody reads to the end of.

**Two CSP entries had to change** for Mapbox (`nginx.conf`): `connect-src` gained `api.mapbox.com`, `events.mapbox.com` and `*.tiles.mapbox.com`, and `worker-src` gained `blob:`. Vector tiles, the style, sprites and glyphs are *fetched* rather than `<img>` loaded, so unlike the OpenStreetMap tiles this replaced they cannot go in `img-src`; and Mapbox GL runs its tile parser in a worker built from a blob URL, without which the library throws on construction. `script-src` is untouched — nothing third-party executes. Geocoding is deliberately absent from that list: it stays proxied.

**The marker is our own element**, not Mapbox's default SVG pin, so it keeps the dot the rest of the app styles.

**The map chases the pin only when the pin is off-screen, and never zooms out to do it.** It used to recentre and force zoom 18 on every pin change — including a tap on the map and a drag of the marker, which are not changes "from outside" at all. So the note under the map told you to zoom in until you could see the shutter, and the map then snapped back to 18 and slid your pin to the middle on the very next tap. What is left is the case the recentring was written for: a GPS fix, a pasted pair or a search result landing outside the current view, where not moving would look like nothing had happened.

**The marker effect waits for the map, and re-runs when it arrives.** The public token comes from `GET /api/stores/map-config`, so opening the picker before that request lands renders the component with no map at all — the effect that places the pin bailed on the empty ref, and its own dependencies (`lat`, `lng`) never changed afterwards, so it never ran again. The map came up with no pin and no way to see where the store already was. A `mapReady` flag is in the dependency list for exactly this.

**Mapbox GL is lazily loaded** (~1.9MB in its own chunk) because most visits to the Stores page never open a map. That mattered under Leaflet's 156KB; at twelve times the size it is the difference between a page that opens and one that thinks about it. The map also gets `isolation: isolate`, since map controls climb to high z-indexes and would otherwise sit over the app's sticky headers and the phone tab bar.

**Where GPS won't cooperate, Google Maps will.** On a fair or poor fix — or when there is no pin at all — a **Find it on Google Maps** link opens the map centred on the rough position (or searching the typed address), so the shop can be found by eye, long-pressed, and its coordinates pasted back. In dense Indian streets, and indoors, this is the dependable path rather than the fallback.

Null accuracy means no sensor estimate: a pin typed by hand, or one saved before this was recorded.

**The pin is applied before the address lookup is attempted**, not after. The lookup can be slow, rate-limited or down; the fix cannot be typed back in later, so it must never depend on the lookup succeeding. Every failure path — permission denied, no fix, timeout, lookup down — says what to do next and leaves the form usable.

The same button sits in the row editor as **📍 Re-capture**, because fifty stores were added before pins existed, and because a fix taken on a bad day needs replacing.

**Directions and Call are for every role**, not just an Admin: the people who drive to these shops are the ones who can't edit them. Directions opens `maps/dir/?api=1&destination=LAT,LNG` when there's a pin, and falls back to a name-and-address search when there isn't — labelled *(approx.)*, so the difference is visible before the drive rather than after. Call is a `tel:` link, shown only when the store has a number. Both are in `frontend/src/lib/storeLinks.js`, covered by `frontend/test/storeLinks.js`.

**Reverse geocoding goes through the API, not the page** (`GET /api/stores/reverse-geocode`, any signed-in role — it was Admin-only until Sales could add stores, at which point a salesperson capturing a pin got a 403 on the address that goes with it; the rate limiter, not the role, is what protects the provider). Mapbox answers when `MAPBOX_ACCESS_TOKEN` is set and Nominatim when it is not, in exactly the same `{parts, address}` shape — nothing downstream can tell which replied. Nominatim is free and asks in return for a User-Agent identifying the application — which a browser will not let script set — so the page cannot make this call politely. Routing it through the server also keeps `connect-src 'self'` intact, and gives somewhere to put a rate limit: the whole app shares one outbound IP, and a stuck retry loop would get that IP blocked for everyone. `backend/src/lib/geocode.js` composes the address; Nominatim files the same field under different keys depending on how an area was mapped, so a Chennai suburb arrives as `suburb`, `neighbourhood` or `city_district` and a city as `city`, `town`, `village` or `state_district`.

**`Permissions-Policy` had to change** (`nginx.conf`). It denied geolocation to the whole app, so the button would have failed before the browser ever asked the user — it is now `geolocation=(self)`, still denied to any embedded frame.

The address is stored as the single `Store.address` string the table already had, composed from the geocoded parts. The coordinates and the address text are **independent fields** — editing one never touches the other, and Directions always prefers the coordinates. Schema additions: `lat`, `lng`, `accuracyM`, and `phone` (`phone` because a Call button needs a number and there was nowhere to keep one).

### Where a pin came from (`pinSource`)

`accuracyM` could not tell a pin somebody placed by hand from one a machine guessed off an address — **both record a null accuracy, because neither was measured** — and the two need opposite treatment. `Store.pinSource` names it: `GPS`, `MANUAL`, or `GEOCODED`. Null means the row predates the column, and accuracy decides exactly as it did before.

It exists to answer one question: **may something automatic overwrite this?** `MANUAL` never — a person put it there, possibly to correct a bad guess. `GEOCODED` always, given a fix good enough to pass the accuracy gate — an address lands on the middle of a neighbourhood as often as on the shutter, and there is no accuracy figure on a geocode to compare against, so a reading taken standing in the shop wins outright. `GPS` only when the new reading is *strictly* tighter, so a store's row is not rewritten by every bill of the day. The rules are in `backend/src/lib/storePin.js`, pure and away from the routes, and covered by `backend/test/storePin.js`.

### Pins captured while billing

Most stores have no pin, and the errand of going to stand outside each one with the Stores page open is the errand that never gets run. But ringing up a bill is a moment we can be sure a phone is *inside the shop* — so that is when the fix is taken, automatically.

**Nothing is asked of the person billing and nothing is shown to them.** The capture starts only after the bill is already saved, so it cannot slow billing down or fail it; every outcome is swallowed on the client, because there is no screen waiting on it and no error anybody could act on. The one part that cannot be made invisible is the browser's own permission prompt the first time a device is asked — that is enforced by the browser, not by this code.

**The server decides, twice.** `POST /api/sales` returns `pinWanted` alongside the new bill, from the store row it had already loaded — false for a store whose pin is `MANUAL`, or already as tight as the hardware gets. That is what keeps the permission prompt from appearing on shops we have already located well: a page that never calls for a position never triggers one. Then `POST /api/stores/:id/pin` re-decides on arrival and **drops any fix coarser than 65m** (`ACCEPT_ACCURACY_M`, mirroring `ACCURACY_GOOD_M` on the client). Indoors is precisely where a reading is most likely to come off wifi and be kilometres out, and **no pin beats a wrong pin** — a wrong one never looks like an error, it just sends drivers to the wrong road forever. Rejecting a fix costs nothing; there is another bill along in an hour.

That endpoint is deliberately *not* `PATCH /api/stores/:id`, which is Admin-only and can rename or re-address a store. It writes `lat`/`lng`/`accuracyM`/`pinSource` and nothing else, so the account allowed to bill for a shop is allowed to locate it — which it must be, since the salesperson holding the phone is the only one who can. It answers `200` whether or not the fix was kept, with the reason (`first-pin`, `improved`, `replaces-geocoded`, `too-coarse`, `hand-placed`, `not-better`, `no-accuracy`) in the body and the server log, so a pin that never appears can be explained without guessing.

The watcher itself is **shared, not re-written**: `frontend/src/lib/locate.js` holds the `watchPosition` loop that was tuned on the Stores page — keep the most accurate reading, stop early at 15m, settle once readings stop improving — and both callers use it. A plain `getCurrentPosition` somewhere else in the app would have quietly undone all of that tuning, since the first fix a phone returns is usually the cheap one.

### Filling a missing pin in the background (backend only)

A store added without a pin would otherwise wait for the weekly backfill, or for somebody to bill there with location permission granted and a clean fix. `backend/src/lib/storeGeocode.js` closes that gap from the server alone: after a bill is saved, an unpinned store gets a provisional pin from its address.

**It cannot disturb billing, by construction.** The obvious shape — a middleware that awaits a geocode before creating the bill — puts a third-party HTTP call between a customer and their receipt, so a slow or down geocoder becomes a slow or down till; and an async middleware that throws takes the process with it on Express 4, which is what `test/crash-guards.js` exists for. So instead: nothing is awaited by the route, the call is queued with `setImmediate` *after* `res.json` has gone out, and `ensureStoreCoordinates(storeId)` returns `undefined` **synchronously** — not a promise — so a caller cannot block on it even by writing `await`. The bill cannot tell whether it ran, succeeded or failed. A test asserts exactly that, against every malformed argument it could be handed.

It is called after the response from **every endpoint that creates a bill against a store**: `POST /api/sales`, `POST /api/consignments/:id/settle`, and the offline CSV import (once per distinct store in the file, not once per row). All the guards live in the function, not at the call sites, so calling it for an already-pinned store on every bill is free and safe.

**Two timeouts, doing different jobs.** The HTTP calls abort themselves at 8s (`AbortSignal.timeout`), so nothing can hang. On top of that, `STORE_GEOCODE_TIMEOUT_MS` (default `2000`) is a shorter *waiting* budget: past it we stop caring about the answer and the day's throttle carries the store to tomorrow. Racing a timer does not cancel the request — the fetch runs on to its own abort — so this is "stop waiting", not "stop working", and it is tunable because 2s is tight for Nominatim on a bad day. A reply that would have arrived at 3s is a pin thrown away for nothing, and this work is off the request path where the extra second costs nobody anything.

**Off unless `STORE_GEOCODE_CITY` is set**, and that default is deliberate — see the flag's row in the environment table, and the three-of-six Chennai mishap below that explains it.

The other guards are all about not hammering a free service or overwriting something better:

- **One attempt per store per day**, marked *before* the lookup rather than after — a failed attempt has to throttle too, or the store that can never be geocoded is the one retried on every bill it ever rings up.
- **Never overwrites an existing pin**, from any source.
- **The write is `updateMany ... where: { lat: null }`**, not a re-read. A GPS fix from someone billing in the shop can land during the second the lookup takes, and that one is worth more — letting the database enforce it makes the race impossible rather than unlikely.
- Everything written is `pinSource: 'GEOCODED'` with a null `accuracyM`, so the first decent GPS reading still replaces it.

The pure guards are in `shouldAttempt`/`queryFor`, covered by `backend/test/storeGeocode.js` without a database, a clock or a network.

### Who hears about a captured pin

One person, named by `GEO_NOTIFY_EMAIL`, and strictly nobody else. Both success paths notify — the GPS capture in `POST /api/stores/:id/pin` and the address fill in `lib/storeGeocode.js` — and the two say different things, on purpose: a GPS pin reports its accuracy, an address pin says *"provisional — a GPS fix while billing will replace it"*. A notification that blurred those would be the one place that difference stops being visible.

**Failures are not notified.** A refused fix is the normal case, not an event: too coarse, not better than the pin already there, no geocoder match. Those go to the server log, where they can be read when somebody asks why a store is still unpinned, rather than to a phone.

**It fails closed.** Unset means nobody, never "everybody" — the opposite of `TEAM_CHAT_ADMINS`, and deliberately so. These messages say where a member of staff physically was when they rang up a bill, so the cost of a missing or misspelt secret has to be silence, not location data broadcast to the whole team. `notifyPinWatcher` resolves exactly one user id and passes exactly that one to `sendToUsers`; there is no path that widens it.

**They expire after 24 hours** (`TTL: 86400`, against the one-hour default the rest of the app uses). "Store X got located" is a today fact — delivered two days late it is not a smaller version of the same message, it is noise about a day nobody is thinking about. TTL is the right lever rather than an expiry check of our own, because the push service enforces it even when this app never runs again: a phone switched off for the weekend gets nothing on Monday instead of a stack.

Seven tests in `backend/test/push.js` cover it, and the one that matters most asserts the fail-closed default by re-requiring the module with the variable unset.

### Backfilling pins from addresses

`node backend/scripts/backfill-store-coordinates.js` geocodes stores that trade but have never been located. Six stores had sales and no coordinates, which made their trade invisible to every question the growth tools ask about *where* to expand.

```bash
cd backend
node scripts/backfill-store-coordinates.js                     # preview, changes nothing
node scripts/backfill-store-coordinates.js --city="Bengaluru"  # preview, biased to one city
node scripts/backfill-store-coordinates.js --city="Bengaluru" --apply
node scripts/backfill-store-coordinates.js --all               # include stores with no sales yet
node scripts/backfill-store-coordinates.js --apply --json      # machine-readable, for a scheduled run
node scripts/backfill-store-coordinates.js --redo-geocoded --city="…" --apply   # ran it with the wrong city
```

**`--redo-geocoded` is the escape hatch for having run it with the wrong `--city`.** Without it a wrong pin is stuck: the store now has coordinates, so the next run skips it and the only fix is SQL by hand. It reconsiders `GEOCODED` pins only — a GPS fix or a hand-placed one is never touched, whatever flags are passed.

**It is a dry run by default**, and that is not politeness — the first real run proved why. Store addresses here are bare neighbourhood names ("MG Road", "Whitefield", "Jayanagar"), and each of those exists in several Indian cities. The search is biased toward an already-pinned store, and the only pinned store was in Chennai while the six being geocoded were Bengaluru shops — so **three of six matched confidently onto Chennai lookalikes**: Indiranagar landed in Ambattur, Jayanagar in Tambaram, Whitefield in Medavakkam. Nothing in the output looked wrong. Applied blind, that is three shops silently misplaced by 300km and every subsequent distance drawn from them.

**`--city="…"` is the fix, and the flag to reach for whenever the stores being geocoded are not in the same city as the ones already pinned.** It geocodes the city once, uses that as the bias, and — the part that actually matters — names the city *in the query itself*. The proximity hint is `bounded=0`, a preference the geocoder is free to ignore, and it does; `"Whitefield, Bengaluru"` is what pins it. With it, all six land in the right neighbourhoods.

It uses the app's own geocoders (Mapbox when `MAPBOX_ACCESS_TOKEN` is set and accepted, Nominatim otherwise, through the same `answerWith` fallback the routes use) and paces itself at one request per second, because Nominatim runs on donated hardware and the whole app shares one outbound IP.

Every store it writes is marked `pinSource = 'GEOCODED'` with a null `accuracyM`. Nothing measured these, so inventing a radius would make a rooftop guess indistinguishable from a GPS fix. Marking them is what lets the billing capture above replace them later with something real.

Both a run's successes and its failures are reported, and every match prints the string it actually searched alongside the label it matched, so a wrong city is visible before it is written rather than after. Stores with no address are separated from stores the geocoder could not match, because the fix differs: one needs an address typed in on the Stores page, the other needs a better one. `--json` prints the whole summary — counts, every match, every failure with its reason — for a scheduled run to log.

To run it on a schedule, use the Fly machine that is already deployed rather than adding a scheduler:

```bash
flyctl ssh console -a grillexa -C "node backend/scripts/backfill-store-coordinates.js --apply --json"
```

Wrap that in whatever cron you already trust (a GitHub Actions `schedule:` workflow is the least new infrastructure). Weekly is plenty — this only has work to do when a store is added without a pin, and the billing capture handles the rest.

## Mapbox, and the meter that watches the bill

The map and both directions of geocoding are Mapbox's. **Two tokens, and they are not interchangeable:**

| Variable | Kind | Where it lives | What it does |
| --- | --- | --- | --- |
| `MAPBOX_ACCESS_TOKEN` | secret `sk.` | server only, never serialised to a response | forward and reverse geocoding, in `backend/src/lib/mapbox.js` |
| `MAPBOX_PUBLIC_TOKEN` | public `pk.` | handed to the page by `GET /api/stores/map-config` | draws the map in the browser |

The public token is fetched at runtime rather than baked in at build time, so rotating it is `fly secrets set` and a restart instead of a rebuild and a redeploy. Mapbox expects a `pk.` token to be visible — the control that matters is the **URL restriction set on it in the Mapbox dashboard**, not secrecy. The `sk.` token is the one that can spend money, and it never leaves the server.

**Neither token is required.** With `MAPBOX_ACCESS_TOKEN` unset the Nominatim path answers both lookups exactly as before; with `MAPBOX_PUBLIC_TOKEN` unset the picker says which variable is missing and still offers search, pasted coordinates and the Google Maps route, rather than showing an empty grey rectangle. A local checkout with no secrets works.

**Nominatim is a fallback, not just a default.** It used to be reachable only when no Mapbox token was set at all, which meant a token that was *present and refused* took geocoding down completely — place search returned 502 and the address after a GPS capture failed. That is not hypothetical: a token carrying a URL restriction is answered **403** for every call this server makes, because a server sends no `Referer`. An expired key is a 401 and a spent quota is a 429, and all three behaved the same way. `answerWith` in `backend/src/lib/geocode.js` now tries Mapbox and falls back on the failure as well as on the absence, so the worst case is weaker results rather than none. It takes the two providers as arguments rather than importing `lib/mapbox`, which keeps the pair from being circular and makes it testable with no token and no network (`backend/test/geocode.js`). Only a Nominatim failure can still surface as a 502 — at that point there is nothing left to try.

**The Mapbox status reaches the log now.** `lib/mapbox.js` had always put the HTTP status in the error message so the log would say *which* failure it was, and the route then swallowed the error whole — so a 403 from a misplaced token looked exactly like Mapbox being down. The fallback logs it on the way past.

**The meter counts who answered, not who is configured.** Those were the same question while a missing token was the only way to reach Nominatim, and they stopped being the same the moment a configured token could be refused. Billing the free tier for a request Mapbox turned down would be the wrong kind of wrong.

**But the page now says when geocoding has degraded.** The two tokens are independent, and a drawn map is no evidence that geocoding is on — set the public one alone and you get a Mapbox map, a Mapbox meter reading a confident zero, and every search and reverse lookup quietly going to Nominatim, whose Indian coverage is thin. The symptom people report is "the map gives wrong locations", and nothing anywhere named the cause. `GET /api/stores/map-config` returns `geocoding: "mapbox" | "nominatim"`, and the Stores meter carries the warning when it is the second one. It reports the **last actual outcome** in preference to the environment, because a configured-but-refused token reads as `mapbox` from `process.env` while answering as Nominatim in fact — the same silent downgrade in a better disguise. Held in memory, so it describes this process and a restart is exactly when it should stop being believed. The pin itself is never affected by this — only the place search and the address filled in after a GPS capture.

**The free tier is metered on the page, for Admin only** (Stores → top of the page). Two `<meter>` bars: map loads out of 50,000 and geocoding requests out of 100,000, with the percentage, for the current calendar month.

- **Counted here, not read back from Mapbox.** There is no usage endpoint on the free plan.
- **A load is counted when a map finishes initialising** (`map.once('load')` → `POST /api/stores/map-load`), not when the Stores page opens. The picker is lazy and most visits never draw one; a map that never loaded — offline, refused token — is not one Mapbox billed for.
- **A geocode is counted only when Mapbox answered it.** The Nominatim fallback spends none of this quota, so it moves no counter.
- **One row per calendar month** (`MapUsage`, keyed `"2026-08"`), incremented with `upsert`, never read-then-written: two phones opening a map at once would otherwise both read the same number and one load would vanish. 150,000 rows a month existing only to be counted is a table that answers its own question slower every day.
- **The month key is UTC**, because Mapbox bills in UTC — a boundary read in IST would file five and a half hours of every night under the wrong month.
- **The figures ride back on the responses that moved them**, so the bars step up while the picker is open rather than on the next page load.
- **A failed count never fails the request.** The meter being wrong is a smaller problem than the map not opening or the address not filling in.

It is Admin-only because it is a billing figure: a salesperson standing outside a shop can do nothing with it but worry. And it is a meter, not a cap — going over the free tier costs money, it does not break, and cutting off the map because a counter is high would be worse than the bill. At the paid rates ($5 per 1,000 map loads, $0.75 per 1,000 geocodes) the free tier is roughly a thousand times this app's actual use.

`backend/src/lib/mapUsage.js` holds the counters, `backend/test/mapbox.js` covers both it and the geocoding shape — no database and no network, the request functions get a fake `fetch` and the meter a fake `prisma`.

## New-store notifications

A shop nobody knows about is a shop nobody delivers to. When someone adds a store, **everyone else on the team is notified** — a web push to every device they have switched on, and a toast on screen for the person who added it.

**Adding a store is open to every role**, which is the change that makes this worth having: a salesperson standing outside a new shop is the one who can capture its pin, and making them relay it to an Admin is how it gets typed in later from memory, or not at all. **Editing and deleting stay Admin-only** — adding a shop is additive and visible, while renaming or removing one rewrites history that invoices and stock ledgers already point at.

**The notification skips whoever performed the action.** Being buzzed about your own action is noise, and it is the one notification guaranteed to arrive with the app already open in front of you. They get the toast instead.

**Signing out drops this device's subscription**, server-side first while the session cookie is still valid — the endpoint is scoped to the calling user, and a signed-out request cannot reach it. Without that, a shared phone would keep buzzing for whoever used it last, and they would be reading a colleague's notifications with no way to stop it short of browser settings. It never blocks signing out: a failure there must not strand someone on a screen they are trying to leave.

**Subscriptions are per device, not per account.** The same person on a phone and a laptop is two rows in `PushSubscription`, and both should buzz — the phone is the one in a pocket when someone else adds a shop. The push service's `endpoint` is the key, and upserting on it is what stops a row accumulating on every app open.

**An endpoint is not stable, which this used to assume.** A browser replaces a subscription whenever it feels like it — key rotation, storage eviction, a browser update — and `pushsubscriptionchange` in the service worker is the only notice given. Miss it and the device listens on a new endpoint while the server pushes to the old one, which is a silent, permanent outage for that person: **a superseded endpoint does not reliably start failing.** FCM answers `201` on one, so the send path sees success, the `404`/`410` prune never fires, and nothing re-registers them. The handler re-subscribes and posts the new endpoint with the old one alongside, so the stale row is deleted outright rather than waiting for a rejection that may never arrive.

**The enable button re-registers on every mount**, because "this device has a subscription" and "the server can reach this device" are different claims and only the first was ever checked. If the `POST` in `enable()` failed — dropped connection, expired session — the browser kept its subscription anyway, so the button read *on* while the server had no row at all. Nobody re-taps a button that already says it is on, so that state was permanent. The upsert is keyed on endpoint, so re-posting is idempotent and costs one request per app open.

**Dead subscriptions delete themselves.** A push service answers `404` or `410` once a subscription is gone for good — app uninstalled, permission revoked, browser data cleared. The send path deletes those rows then, and nothing else prunes the table; any other error (network, 5xx, rate limit) is transient and the row is kept. Sends run through `Promise.allSettled`, so one dead device cannot stop the rest of the team being told.

**Accepted is not delivered, and the difference is where the complaints come from.** A push service answering `201` means it has taken the message, nothing more. It is free to hold it until the device next wakes on its own, and on an Android under Doze or battery restriction that is hours. Reported as "notifications aren't reaching", it was really "reaching that evening" — from the phone the two are identical, and the server logs looked perfect throughout because they were.

So every send goes with **`urgency: 'high'`**, the RFC 8030 header asking the service to wake the device now rather than batch it, and **`TTL: 3600`** against a default of four weeks. If it could not be delivered within the hour the moment has passed, and a service flushing a fortnight of *New Store Added* at once is worse than silence. The header only asks — a phone's own battery settings can still overrule it, so `TEAM-GUIDE.md` carries the Android step.

**Every send is logged, success included** — push service host, user id, status code, then a batch summary. Not diagnostics-in-waiting: without it the question *"was anything sent when store 107 was created?"* has no answer at all after the fact, which is exactly the position an afternoon of live testing on staff phones started from. The host is logged and never the full endpoint, since the path is the secret that addresses someone's device.

**A notification failing never fails the action.** `POST /stores` responds without waiting on the push services, and errors are logged rather than thrown. The store was created; that is the part that had to be durable.

**Tapping a notification opens `/stores?focus=<id>`**, which scrolls to that row and highlights it for four seconds. There is deliberately no store detail page — the row already shows everything one would hold, and a page built only to be linked to is a page to maintain. The id is copied into state before the URL parameter is dropped, because the two have different lifetimes: the parameter must go immediately so a refresh doesn't re-trigger the highlight, while the highlight has to outlive it long enough to be seen.

**A salesperson also sees the stores they added**, not only the ones they are assigned to (`GET /stores`). Adding a store does not assign it to them, so without that clause a shop would vanish the instant it was saved — which reads as data loss, not as a scoping rule.

**Notifications are optional and degrade quietly.** Without `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` the app boots normally, `GET /api/push/key` answers `503`, and the send path returns early. A missing key is a notifications outage, not an outage.

**The VAPID public key is served, not bundled.** Vite would inline a `VITE_`-prefixed variable during `npm run build`, which happens inside the Docker image where Fly secrets do not exist — the key would have to become a build argument, and rotating it would mean rebuilding. `GET /api/push/key` costs one request and removes both problems. The key is public by design: it is handed to every browser that subscribes.

**iOS needs the app on the Home Screen.** Safari only exposes `PushManager` to an installed PWA (16.4+), so on an iPhone browsing the site normally, notifications are genuinely unavailable — the button says how to install rather than offering something that cannot work. The same applies to any plain-`http` origin, including a LAN address during development: no secure context, no service worker, no push.

The service worker (`frontend/public/sw.js`) gained `push`, `notificationclick` and `pushsubscriptionchange` handlers and **still caches nothing** — a notification is a message, not a stored copy of a page, so the network-only rule that file exists to protect is intact.

`backend/test/push.js` covers the send path with web-push and Prisma faked in the require cache: that both headers go out, that `410` prunes and `500` does not, that the actor is skipped, and that a send is logged without its endpoint path. Every failure it guards against is invisible in production until someone mentions they never heard about a shop.

## The daily grilling line (staff dashboard only)

Sales people get one line a day on the dashboard card when they open the app. It comes from the `WisdomMessage` table via `GET /api/quotes/today?audience=STAFF`, cached per device for the day.

**The pick is deterministic, and that is a fix, not a detail.** The old widget asked for a *random* quote on every request, so it changed on every page load — and the dashboard refreshes itself every five minutes, which would have moved the quote under the reader several times an hour. One line per day, the same for everyone, so two people comparing notes are looking at the same thing. A message pinned to a date beats the rotation.

**The planner page that managed these is gone** (removed 2026-08-07), and so is the customer line on bills — a bill footer is back to the fixed "🙏 Thank you for shopping with us!". What remains is read-only in practice:

- The `WisdomMessage` table and its rows are untouched, so the staff card keeps rotating through whatever was in it the day the page was removed.
- **Nothing in the UI can add, edit, pin or switch off a line any more.** Changing what the card says now means a SQL statement against the table, or restoring the page from git (`git show e3708a2 -- frontend/src/pages/WisdomPlanner.jsx`).
- The `/api/quotes` CRUD routes and `GET /api/quotes/suggestions` still exist and still work; nothing calls them. `ZENQUOTES_KEY` now configures a suggestion endpoint with no UI in front of it.

If the card outlives its welcome too, deleting `DailyWisdom` from `Dashboard.jsx` retires the whole feature; the table can then be dropped in its own migration.

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

**Profit & Loss by store lists only stores that traded, biggest profit first.** It used to list every store ever opened, alphabetically, with zeros filled in for the ones that sold nothing — 80 cards on a phone to answer "which shops made money", 14 of them empty, the best one buried mid-alphabet. A store with no movement in the range contributes nothing to a P&L, so it is left out rather than scrolled past.

The filter bar's three pickers are `SearchSelect`, not plain dropdowns. The store one was the last place in the app that put all eighty stores into a native `<select>`; products and people fall back to a `<select>` automatically, because `SearchSelect` does that for five options or fewer.

On a phone the P&L table opts out of the shared card layout (`.pnl-table`): one line per store — name, profit, margin — because the list is ranked by profit and that is the question it answers. Revenue and COGS stay in the desktop table and the Excel export rather than costing four screens of scrolling.

**Units Moved by Store is one collapsed row per store.** Each store's product table is a `<details>`, closed by default — the mobile layout renders every table row as a card, so 60-odd stores expanded was a page nobody scrolled to the end of. Stores with no movement in the range are dropped server-side, same as the P&L.

**The person filter reaches what the data attributes, and says so where it does not.** Sales are credited by who rang the bill up (`createdById`) — the same rule the personal dashboard uses — so the trend, the product mix, the store bars and the P&L table all narrow to one person. Wastage and Units Moved cannot: a stock ledger row records a store and a day and nobody's name, so those two keep showing everything in range, with a line above each saying why rather than leaving someone to notice a chart that did not move. The Excel export is store-and-range wide for the same reason; its Salesperson Performance sheet is where per-person figures live.

All five series arrive in **one** response (`GET /api/reports/analytics`). Five endpoints would mean five round trips on a phone and five slightly different moments in time on one screen.

**Chart choices that are not taste.** Colour means identity in exactly one chart — the product doughnut — so that is the only one with a categorical palette (fixed order, so a product keeps its colour when a filter removes the one above it) and the only one with a legend; the rest are single-series and named by their heading. The palette is validated for colour-blind separation against the app's white cards rather than eyeballed. Long tails fold into one grey **Other** slice that keeps the money but cannot be drilled into, because it is a remainder, not a thing. A day with no sales is a **zero on the line, not a gap** — a line drawn straight across a dead Sunday reports a quiet week as a steady one.

`GET /api/reports/excel?from=&to=&storeId=` streams a six-sheet workbook: Summary, Store Performance, Product Performance, Salesperson Performance, Consignment Summary, Wastage Breakdown. Headers are bold on petrol with the row frozen and a filter on it, money is `₹#,##0.00`, percentages carry two decimals, dates are **real dates** in `dd/mm/yyyy` (text would not sort or filter by month, which is most of why anyone opens this in Excel), and columns are measured to their content. It runs the same aggregation as the charts (`backend/src/lib/analytics.js`), so the file and the screen cannot disagree.

### The written report (Download PDF)

Two exports, two jobs. Excel is the raw rows for whoever wants to work on them. The **PDF is the written version** — the same numbers arranged as the questions somebody actually asks, each with a one-line answer before any detail, for the person who was never going to read five charts.

It answers six: *Did we make money? · Which shops are carrying us? · What is actually selling? · What are we throwing away? · Who is out there selling? · What should I look at this week?* The last one is derived from the other five — a shop trading at a loss, the biggest thing being thrown away, a salesperson under 70% store coverage — so it is instructions rather than a summary.

**The wording is the product here.** It says "about 18 paise in every rupee" rather than "18.4% margin", "2 shops lost money, the worst is X" rather than a table, and it never dresses up a loss. `frontend/src/lib/reportNarrative.js` is deliberately pure — no jsPDF, no React, no network — which is what lets `test/reportNarrative.js` check the sentences and the arithmetic under plain Node: that a loss says "No", that a period with no sales says "nothing sold" instead of printing zeros, and that no wastage counted is reported as a possibly-missed count rather than as good news.

**Money is formatted by a function passed in, not imported.** The screen wants ₹; the PDF must not have it, because jsPDF's built-in fonts are WinAnsi and render ₹ as a broken superscript that also throws the text-width maths off and clips the digits after it — the same trap `lib/invoice.js` documents. One of the tests asserts no ₹ survives into the PDF text.

**Text is drawn, not screenshotted.** html2canvas would have been fewer lines and would have produced a blurry raster nobody can select, search or print. Bar labels that do not fit are cut with a visible `...`: `splitTextToSize`'s first line was used at first and it drops the overflow silently, turning "Guru krupa Kirana store (Rocky)" into "Guru krupa Kirana store" and quietly losing the rep tag that says whose shop it is.

**Colour never carries meaning alone.** Every bar prints its own number, and the bars are blue rather than the brand green-against-red: those two are 4.2 apart for a red-green colourblind reader, which makes "good" and "bad" the same colour. Green is chrome only.

jsPDF is imported on demand so it stays out of the bundle for everyone who never presses the button, and the PDF is written from **exactly what is on screen** — including the product and person filters, which the Excel export ignores. Any filter in force is printed on the front page so the two can never quietly disagree.

**exceljs, not SheetJS.** The free build of SheetJS cannot write bold or filled cells — styling is a paid feature there — and bold filled headers on a frozen row are most of what makes six sheets readable. `backend/src/lib/excelReport.js` is the only file that would change to swap back.

Three columns that were asked for are **not** in the workbook, because the data behind them does not exist:

- **Wastage has no reason.** It is a counter on the daily stock ledger (`DailyStockEntry.wastage`), not an event log — there is no per-entry row to hang a reason on. Returns are the ledger that carries reasons. Wastage is valued at **cost**, not at the selling price: it is stock paid for and never sold.

- **There are two wastage figures, and they are never added together.** `DailyStockEntry.wastage` is stock that spoiled *inside a store*: per (date, store, product), it decrements that store's ledger, and it is what the Reports wastage chart, the Excel Wastage Breakdown sheet and the P&L cost line are built from. The `Wastage` table is **end-of-shift wastage** — what a salesperson counts as spoiled at the end of their run, with no `storeId` because there is no store to attach it to. See below.

- **Wastage is whole units, and has no upper bound.** `DailyStockEntry.wastage` is an `Int`, so a fractional quantity used to clear the route's `Number.isFinite` guard and fail inside the transaction instead, surfacing as a bare 500. Both the form and `POST /api/stock/:storeId/:productId/wastage` now require a positive integer. There is deliberately **no maximum**: the ledger's running balance is meaningless by design (see above), so there is no honest "units on hand" to cap against, and an invented cap would block a real entry.
- **Stores have no city**, only the one composed `address` string (see *Store location*), so the address goes out whole rather than guessed apart.
- **A consignment has no wastage figure.** Wastage is recorded against a store and a day, never against the consignment the stock arrived on; any per-consignment number would be invented. It is on the Wastage Breakdown sheet at the grain it actually exists at.

**Coverage %** on the salesperson sheet is stores reached ÷ stores assigned over the window, and nothing more blended — a number nobody can recompute in their head is a number nobody trusts when it is used to judge them. It is null, not 0%, for someone with no stores assigned.

Ranges are capped at 366 days: the window drives how many rows every query reads, and "all time" on a phone is a request nobody meant to make.

## End-of-shift wastage

**Unsold is not wasted.** Stock a store did not sell comes back to HQ when the consignment is settled — a `Return` with reason `CONSIGNMENT_UNSOLD`, booked as a negative receipt against that store. It is still good stock and it goes out again to another store tomorrow. Nothing about a return says anything was lost.

The only point at which the business actually knows what was lost is **the end of a shift**, when the salesperson counts what came back spoiled across their whole run. That is what the `Wastage` table records, from the **Record Wastage** button on the dashboard: a date, and one row per product with a quantity and a reason.

**It has no `storeId`, deliberately.** By the time anyone counts, the goods are back at HQ — the store ledger has already been squared by the settlement, and no single store can be blamed for a tray that spoiled in a van carrying stock from eleven of them. A storeless row is the honest shape.

Three consequences worth knowing:

- **It does not touch the stock ledger.** `adjustStock` needs `(storeId, productId, date)`, and this has no store. The app tracks stock *in stores*, never stock at HQ, so there is nothing here to decrement.
- **There is no quantity cap.** Nothing to validate against — no HQ stock figure exists, and the per-store running balance is meaningless by design. The rule is a positive whole number and nothing more; a cap would refuse a true count, which is worse than accepting a surprising one. A `CHECK (quantity > 0)` enforces the floor in the database.
- **It carries a reason, where the ledger counter could not.** Spoiled, Damaged, Expired, Other. A per-entry row has somewhere to hang a reason; a counter on a ledger row does not, which is why store wastage still has none. This is most of why the table earns its place.

Every row records **who counted it** (`createdById`). An end-of-shift count belongs to a person — two people counting the same day would otherwise merge into one figure with nobody's name on it, and this is the one number in the app with no store to trace it back through.

`POST /api/wastage` is open to any signed-in account including Sales, because they are the ones doing the counting. It is the only write in the app with no `assertStoreAccess` behind it — there is no store to scope to — which is exactly why authorship is recorded. `GET /api/wastage/summary` is staff-only, following Reports: your own count is yours, but what everyone together threw away is a manager's number. It totals by product, valued **at cost**, and keeps the reason split rather than flattening it: "40 units wasted" and "40 wasted, 38 of them expired" are different problems.

### Assigning stores, and "all stores"

A sales account is normally given a list of shops. With eighty-odd of them that list is a long scroll, so the dialog has a search box and keeps Cancel/OK pinned — only the list scrolls.

**"All stores" is a standing assignment, not a tick-everything shortcut**, and that distinction is the whole point. Checking every box covers the shops that exist at that moment and silently misses the one that opens next month; the account meant to see everything would quietly stop seeing everything, with nothing to indicate it. So it is a flag on the user (`allStores`) and the store list is resolved **per request** in `middleware/auth.js` — a shop opened an hour ago is already covered, and nobody has to reopen the dialog.

Turning it on clears the explicit list, because two answers to "which shops" is how they drift apart. `lib/scope.js:resolveStoreIds` is the rule, kept pure so `test/scope.js` can check it without a database — including the case that matters: the same account, asked twice, with a new store in between.

One consequence worth knowing: this resolves through `req.user.storeIds`, which every store-scoped query already filters on, so nothing else needed changing. The cost is one extra id-only query per request, and only for accounts carrying the flag.

## Roles & permissions

| Action | Admin | Manager | Sales |
|---|:--:|:--:|:--:|
| My Dashboard (own personal metrics) | ✅ | ✅ | ✅ |
| Charts on Reports, Download Excel, Download PDF | ✅ | ✅ | ❌ |
| Dashboard for another person, or company-wide | ✅ | ✅ | ❌ |
| Today's Stock, Stock History | ✅ any store | ✅ any store | ✅ own stores |
| Deliver to Store (create / edit consignment) | ✅ any | ✅ any | ✅ own stores |
| Settle Consignment (incl. edit last settlement) | ✅ any | ✅ any | ✅ own stores |
| Direct Sale (create / **edit** a bill) | ✅ any | ✅ any | ✅ own stores |
| Record wastage (per store), record returns | ✅ any | ✅ any | ✅ own stores |
| Record end-of-shift wastage | ✅ | ✅ | ✅ — it is their shift, and the count has no store to scope |
| View the end-of-shift wastage summary | ✅ | ✅ | ❌ |
| See product prices | ✅ | ✅ | ❌ |
| Reports (P&L, product sales) | ✅ | ✅ | ❌ |
| Dispatches (historical) | ✅ | ✅ | ❌ |
| Add / edit products | ✅ | ✅ | ❌ |
| Delete products | ✅ | ❌ | ❌ |
| **Add** a store | ✅ | ✅ | ✅ — whoever is standing outside it can capture the pin |
| Edit / delete a store | ✅ | ❌ | ❌ |
| Manage users, reset passwords | ✅ | ❌ | ❌ |
| Change own password | ✅ | ✅ | ✅ |
| Store list | ✅ all, with staff | ✅ all, with staff | own stores **plus any they added**, no staff names |

Enforced **server-side**, not merely hidden in the UI. Role and store assignments are re-read from the database on *every* request rather than trusted from the JWT, so a change takes effect immediately instead of at next login.

A Sales account can be assigned **several** stores. **There is no public signup** — an Admin creates every account from the Users page.

That scoping is what makes the store list readable for a salesperson and unreadable for an Admin, who gets all eighty in one flat list. So the Stores page carries a **Filter by salesperson** picker, Admin only, next to the search box. Its options come from the `salesUsers` already on the store list response rather than a second request — somebody covering no store could only ever filter the list to empty, so there is nothing more to fetch. It is a `SearchSelect` like the filters on Reports, which means it stays a native `<select>` while there are five salespeople or fewer.

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
│   │   │                   Sale(+Line), Return, Wastage (end-of-shift),
│   │   │                   DispatchInvoice(+Line)
│   │   ├── migrations/     19 migrations
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
│   │   │                geocode.js (geocoding via Nominatim, the fallback),
│   │   │                mapbox.js (geocoding via Mapbox, the default),
│   │   │                mapUsage.js (the free-tier meter, per month),
│   │   │                offlineImport.js (CSV parse, validate, write)
│   │   ├── middleware/  auth.js (cookie session), role.js
│   │   ├── routes/      auth, users, products, stores, stock, consignments,
│   │   │                sales, returns, dispatches, reports, quotes, import,
│   │   │                dashboard, wastage (end-of-shift, storeless)
│   │   ├── app.js       CORS, cookie parser, login rate limit, route mounting
│   │   ├── db.js
│   │   └── index.js
│   ├── test/            crash-guards.js, stock-cascade.js, stock-rollup.js,
│   │                    pricing.js, consignment-list.js, offline-import.js,
│   │                    geocode.js, mapbox.js, dashboard.js, analytics.js,
│   │                    wisdom.js,
│   │                    wastage.js,
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
│   │   │                BillDetailModal, WastageModal (per store),
│   │   │                ShiftWastageModal (end-of-shift, no store),
│   │   │                StockDetailModal,
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
│   │                    page), Inventory (Today's Stock), DeliverToStore,
│   │                    SettleConsignment, DirectSale, Sales, Dispatches,
│   │                    Products, StockHistory, Reports, Stores, Users
│   ├── test/            invoice.js, greeting.js, searchSelect.js,
│   │                    storeLinks.js, reorder.js, reportNarrative.js
│   │                    (npm test)
│   └── vite.config.js   dev proxy, build target down to iOS 14
├── whatsapp/         standalone content generator for the Grillo WhatsApp
│   │                 channel — see below. Not part of the app.
│   ├── index.js      CLI (commander)
│   ├── lib/          claude.js (the only file that talks to the API),
│   │                 generate.js (prompt assembly), options.js (the type /
│   │                 audience / tone / language registry), clock.js (IST,
│   │                 same +5:30 offset as the app), render.js,
│   │                 products.json, pantry.json (everyday ingredients,
│   │                 one per post, so the channel stops repeating itself)
│   ├── prompts/      brand.md, example-post.md, one file per content type
│   ├── examples/     hand-written reference posts. Documentation only —
│   │                 never sent to the model, unlike prompts/
│   └── strategy/     30-day.json — the ninety planned calendar cells. Read by
│                     backend/prisma/seedCalendar.js, not by the CLI
├── package.json      root launcher only — `npm run whatsapp`. Nothing is
│                     installed at this level.
├── Dockerfile        production image for Fly (backend + frontend + Nginx)
├── entrypoint.sh     runs `prisma migrate deploy`, then Node + Nginx
├── nginx.conf        production Nginx — serves the SPA, proxies /api and
│                     /health, and sets every security header and the CSP
├── fly.toml          Fly config — region sin, internal_port 4000
├── docker-compose.yml  local Postgres only
└── README.md
```

Fly builds **only** the root `Dockerfile`, `nginx.conf` and `entrypoint.sh`. There are no other Dockerfiles or nginx configs; earlier duplicates under `backend/` and `frontend/` were removed because editing the wrong one silently did nothing.

`whatsapp/` **is** in the image, as its own directory beside the backend rather than inside it — the dashboard panel imports it at runtime. See below.

## The WhatsApp content generator

`whatsapp/` writes posts for the Grillo WhatsApp channel — myth-vs-fact, morning tips, a meal of the day, the Sunday cheat meal, habit challenges, product highlights, seasonal food, evening wind-downs and customer stories — formatted for a phone screen and copied straight into WhatsApp. **[whatsapp/README.md](whatsapp/README.md)** is the how-to.

**The dependency runs one way only.** The backend imports the subproject; the subproject imports nothing back. It still never opens the database, still has its own `package.json` and `node_modules`, and still runs standalone from a terminal with the app switched off. What changed is that it now also ships in the image, as `/app/whatsapp` beside `/app/backend`, because `POST /api/whatsapp/generate` loads it at runtime — CommonJS reaching ESM through `import()`, over a relative path that resolves the same in the repo and in the image.

Keeping it a separate directory rather than folding it into `backend/src` is what lets the dashboard and the CLI share **one copy of the prompt files**. Two copies would drift, and the channel would start saying different things depending on who wrote the post.

```bash
npm run whatsapp -- --today                              # the post today is due
npm run whatsapp -- --type=morning --audience=elders     # or pick one
```

**The week has a fixed shape** (`whatsapp/lib/rota.js`), and `--today` follows it: Monday a morning tip, Tuesday a myth, Wednesday dinner, Thursday a habit challenge, Friday an evening wind-down, Saturday seasonal, Sunday the cheat meal. A repeating rhythm gets anticipated — people start waiting for the Sunday one — where a random type each day is just noise arriving at breakfast. Product highlights and customer stories are deliberately **off** the rota and posted by hand, because a channel that sells every week stops being read.

## The dashboard panel

**WhatsApp** is its own page, reached from the nav beside Users and Stores: pick a type and an audience, optionally type a topic, generate, copy. It opens with today's rota post already selected, so daily posting is one click rather than three decisions.

It began as a card at the bottom of the dashboard and was moved. On a phone the dashboard is a long scroll — metrics, ranking, chart, top products, alerts, leaderboard — and burying a tool used every single day underneath all of it is how it stops getting used. Writing a post is a task, not a metric.

**The nav entry is not role-based either.** Only the server knows `WHATSAPP_AUTHORS`, so the sidebar asks `GET /api/whatsapp/options` and adds the link only if the answer is 200. Four of the five Admin accounts never see it. Sales accounts skip the request entirely — they can never be on the list, and it would otherwise be a refused call on every page load for most of the staff.

**Role is not the whole gate.** Writing for the customer channel is a job two named people do, not something every Admin should be able to do because they can also reset passwords. `WHATSAPP_AUTHORS` is a comma-separated allowlist of email addresses checked on top of the role, and it **fails closed**: unset means nobody, and the panel simply does not render. An unset variable meaning "everybody" would hand the channel to every Admin the first time someone forgot to set a secret, and nothing would look wrong. Both checks live on the server — the panel hiding itself is a courtesy, not access control.

The endpoint is rate limited to 60 posts an hour. Unlike the rest of the API, every call to it costs real money at Anthropic, and a stuck retry loop should hit a wall rather than a bill.

The dropdowns are built from `GET /api/whatsapp/options`, which reads the subproject's own registry — so a content type added there appears in the dashboard with no frontend change, and the panel can never offer something the generator does not have.

Two things in it are load-bearing and should survive future edits:

**The voice lives in one file.** `prompts/brand.md` carries the tone, the format and the forbidden vocabulary, and is sent with every request; the per-type files only say what sections that type has. Changing how the channel sounds is one edit, not eight. `--dry-run` prints the assembled prompt without spending anything, which is how you check a prompt edit before it goes near the API.

**Variety is injected, not requested.** Every post left to itself reaches for banana, curd and sprouts, and the channel goes stale in a fortnight — and telling the prompt to vary the food does not help, because each post is a separate API call with no memory of the last one. So each post is handed one item from `lib/pantry.json`, the things already in the kitchen that nobody thinks of: curry leaves, ridge gourd skin, banana stem, coriander stems, last night's rice. A batch draws without replacement. Growing that list is the cheapest way to keep the channel fresh.

**Three providers can write the posts, chosen by which key is set.** Google Gemini's free tier first, then Claude if an Anthropic key is present, then Pollinations — free and keyless — as the floor, so the tool always does something. `whatsapp/lib/provider.js` is the only file that knows more than one exists; the prompts, the rota and both surfaces are provider-agnostic. Pollinations is an anonymous relay with no uptime promise and no control over which model answers, so it is a last resort rather than a second choice, and `POLLINATIONS_ENABLED=false` turns it off where a missing key should fail loudly instead.

**It knows what day it is in the Indian calendar.** `whatsapp/lib/calendar.json` carries 23 festivals and national days with a note each on what the day is, what people cook, and what not to say. The fixed dates are filled in; the lunar ones are listed with their dates **deliberately empty**, because a wrong Deepavali date on a customer channel is worse than no Deepavali post. An unfilled festival is skipped silently, so `--list` names every one still missing a date for the year — otherwise the day passes, an ordinary post goes out, and nobody notices until a customer asks.

**It knows today's weather and this month's fruit.** Open-Meteo (free, no key) for Hyderabad, turned into what it should do to the food — rain means warm and off-the-stove and cut fruit spoiling faster, a hot day means buttermilk and water-heavy fruit. Fetched once per day per process, and a forecast failure only costs a line of context, never the post. Fruit comes from `whatsapp/lib/fruits.json`, by the months it is genuinely in the market here.

Festival dates are filled by `npm run calendar:fill` from Google's public Indian-holidays feed (no key, no account) rather than typed in — they are lunisolar and move every year. It writes into the file rather than fetching at generation time, so the dates are reviewable in a diff and no post waits on a network call. Bathukamma, Bonalu and Karthika Pournami are Telangana observances absent from any national feed and stay manual.

**The channel names four meats and no others.** Chicken, mutton, fish, prawns. Never beef and never pork — not as a suggestion, an example, or an aside. Hindu, Muslim and Christian families read this on the same street, and one careless line loses a share of them for good. Vegetarian by default; where meat appears a vegetarian option sits beside it. Fasting is never advised on in either direction, and nobody is ever told to eat less at a festival.

**It reminds you.** A daily habit fails on the mornings nobody remembers, not the mornings nobody has anything to say — so from 7am IST the app pushes *"Friday is usually an Evening Wind-Down post, and today's is not written yet"* to whoever is in `WHATSAPP_AUTHORS`, using the web-push that was already set up for store notifications and the sentence the suggestion engine already computes. It goes quiet the moment the post exists, since a reminder that fires anyway teaches people the notification means nothing.

It is a timer in the app rather than a cron service, which `min_machines_running = 1` makes viable — but **more than one machine can be awake**, so the day's row in `WhatsAppReminder` is claimed under a unique constraint before anything is sent. First machine wins, the rest fail the insert and stay quiet. A flag in memory would send it twice on a busy morning. The check runs every five minutes rather than once on the hour, so a machine restarting at 07:03 does not skip the day.

**It suggests what to write next.** Nine content types and a daily habit means the easy ones get reached for and the rest quietly stop appearing. `backend/src/lib/whatsappSuggestions.js` reads the post history and says what has gone stale, most overdue first — and it counts what was *marked as posted*, not what was generated, because a draft nobody sent is not something the readers saw.

**The clock is the business's, not the machine's.** The weekday in the headline, the meal a batch writes about, the season a seasonal post assumes and the date in output filenames are all computed in IST (`lib/clock.js`), using the same fixed +5:30 offset and the same reasoning as `frontend/src/utils/date.js` — India has never observed DST, so the offset is exact and needs no timezone data on the machine. A laptop on UTC otherwise prints `THURSDAY` on a Friday post every evening after 6:30, and a batch run at 8am in Vijayawada writes about dinner.

**Some of the prompt is there for honesty, not style.** Product posts may state only the facts listed for that product in `lib/products.json`. The `diabetics` audience is told never to imply a food treats or controls diabetes and never to touch the subject of medication. `--type=customer` writes from a real detail supplied in `--topic`; with no topic it produces an unattributed post rather than inventing a name and an outcome, because a made-up testimonial published as genuine costs the channel more than any post gains it. The Sunday cheat-meal post is the one place the channel uses the words *cheat meal*, because that is what readers call it themselves; it makes the meal better rather than smaller, and nothing in it is ever earned, burnt off or made up for on Monday. Those are not decoration.

## The 30-day content calendar

The generator writes **one post, now**. The calendar is the other half: **ninety posts, planned** — thirty days at three fixed times, seeded from a file and ticked off as they go out.

```
Morning    7:30 AM   Habit & Energy
Afternoon  1:00 PM   Food & Productivity
Night      8:30 PM   Community & Mission
```

Themes run in weekly bands, so a week reads as a week rather than ninety unrelated posts:

| | Morning | Afternoon | Night |
|---|---|---|---|
| **Week 1** (days 1–7) | Hydration & Morning Routine | Balanced Lunches | Local Store Awareness |
| **Week 2** (days 8–14) | Breakfast & Energy | Snack Swaps | Community Building |
| **Week 3** (days 15–21) | Fruits & Fibre | Productivity & Food | Healthier Living |
| **Week 4** (days 22–30) | Consistency & Habits | Long-term Health | Growth & Mission |

**`whatsapp/strategy/30-day.json` is the source of truth**, not the database. Each of the ninety cells carries a `theme`, a `draft` under a hundred words, an `engagementQuestion` and an `imageIdea`. Editing the file and re-running the seed updates that cell in place:

```bash
cd backend && npm run seed:calendar
```

The same script seeds production. It is **not** part of `npm start` — the calendar is a deliberate act, not something a restart should do — so it is run by hand after a deploy, and `whatsapp/strategy/` is copied into the image for exactly this:

```bash
flyctl ssh console -a grillexa -C "sh -c 'cd /app/backend && node prisma/seedCalendar.js'"
```

**The seed is safe to run repeatedly, and that is the point.** Rows are upserted on `(day, timeSlot)`, and `sent`, `sentAt` and `fullPost` are never written by it — a month of ticked-off posts and generated prose has to survive a typo fix in the strategy file, or nobody will dare run it again. The `update` clause lists the four planning fields by name rather than spreading the whole cell, which is what keeps that true if the schema grows a field later.

**Nothing about the voice lives in the calendar.** *Generate Full Post* hands the cell's draft to the existing generator as its topic, so `prompts/brand.md`, the post format, the audience rules, the weather, the seasonal fruit and the everyday-ingredient rotation all apply exactly as they do to a hand-written post. The engagement question is appended to the topic as an instruction, because a post that ends on the quote leaves the reply prompt to be pasted on afterwards — which is how it gets forgotten.

The three times of day are the *channel's* vocabulary and the nine content types are the *generator's*; `SLOT_TO_TYPE` in `backend/src/routes/whatsapp.js` is the one place they meet. Morning becomes a Morning Tip, afternoon a Meal of the Day at lunch, night an Evening Wind-Down. A rename on either side breaks Generate Full Post for one time of day only and silently, so `test/whatsapp-calendar.js` checks the join against the generator's own registry.

**A generated calendar post is also recorded in `WhatsAppPost`**, so it counts towards the suggestion engine's view of what the channel has actually shown people, alongside the hand-written ones.

`WhatsAppContent` is deliberately **not** merged into `WhatsAppPost`. That table is history — what was written, when, by whom, with a rating against it. This one is a plan: it exists before anything is written and most of its rows sit empty of prose for weeks. Merging them would mean every history query had to filter out ninety rows of intent, and the plan would be rewritten every time somebody pressed Generate.

## Team Chat

One room, the whole staff in it. A WhatsApp group, not a support desk: no threads, no channels, no reactions. Everyone reads and writes; Admins add people, remove people, pin and delete.

**Polled, not socketed.** `fly.toml` sets `auto_start_machines = true`, so more than one machine can be awake — a socket opened against one would never see a message posted to the other, the same problem the WhatsApp reminder solves with a unique constraint rather than a flag in memory. The room polls `GET /api/team-chat?after=<id>` every five seconds while the tab is visible, which is an indexed lookup returning nothing most of the time, and the existing web push covers the app being closed. A socket layer would need shared pub/sub before it beat this.

**Membership is the gate, not role.** Every role can talk here, so there is no `requireRole` on the router. `TeamChatMember` decides instead, and it is read on every request rather than baked into the session — an Admin removing somebody has to bite immediately, not at their next login.

**Moderation is Admin *and* an allowlist.** `TEAM_CHAT_ADMINS` is a comma-separated list of emails checked on top of the role, the same shape as `WHATSAPP_AUTHORS`. Five accounts carry ADMIN and only two of them run the room; being able to reset a password should not also mean being able to remove somebody from the group. Unset means every Admin — the **opposite** of the channel route, and deliberately: there, failing closed protects customers from an unapproved post, whereas here it would leave a room full of people with nobody able to remove a mistake.

**Deleted messages keep their place.** `deletedAt` is set and the body stops being returned — `lib/teamChat.js:present()` blanks it, so no route can leak it by forgetting. The thread shows "This message was deleted by X". A message vanishing without trace makes the conversation above and below it stop making sense, and leaves no way to tell moderation from a bug.

**The unread badge is one column, not a table.** `TeamChatMember.lastReadAt`, and the count is messages newer than it. The alternative — a row per message per member — grows with traffic times headcount and turns the badge into a `NOT IN` over a growing table on every poll, from every page in the app. What it cannot do is say who read what; that is the point to add a receipts table, not before.

One subtlety that cost a bug: the count excludes your own messages with an explicit `OR [{ senderId: null }, { senderId: { not: viewerId } }]` rather than a plain not-equals. `senderId <> $1` is **unknown** for a NULL sender in SQL, so every authorless system message was silently dropped from the count and the launch announcement lit no badge at all.

**The room opens with a system message.** Seeded by the migration with `senderId` NULL and `isSystem` true — a system announcement has no author, and attributing it to whichever Admin happened to have the lowest id would put words in a real person's mouth in a room the whole team reads. It is pinned, it is not deletable by anyone including a moderator, and it counts as one unread for everybody so the badge shows a 1 the first time each person opens the app. The same migration puts every existing account in the room, because a chat that opens with nobody in it needs an Admin to add six people by hand before anyone can speak.

### Acting on a message

**Hold a message to get its actions** — Edit, Pin, Delete — in a sheet, the way every chat app does. There were a pin and a delete button on every row before, and on a phone hover does not exist to hide them, so the thread became a wall of icons with the messages squeezed between and every control a 26px target.

A hold is 450ms and any movement over 10px cancels it, so scrolling the thread never opens the sheet. Long-press also raises the system text-selection menu on iOS, so the message blocks the context menu — but the message **body** stays selectable, because people copy order numbers out of here. Holding is unreachable from a keyboard, so the message is focusable and Enter opens the same sheet.

**Editing belongs to the author alone, and is deliberately not a moderator power.** Deleting somebody else's message leaves a visible tombstone in the thread; rewriting one would put different words under their name with nothing to show it happened. A moderator who disagrees can delete and say why. An edited message is marked *edited*, and `editedAt` records when.

### The launcher on the dashboard

The chat is also a floating button on `/`, and nowhere else. `App.jsx` gates it on `location.pathname === '/'` rather than putting it inside the dashboard page, because it is fixed to the viewport and must not be clipped or scrolled by a page container.

**Dashboard only, on purpose.** On the till and delivery screens a floating button lands on the fields somebody is filling in — Direct Sale and Deliver to Store are the clearest cases. Those screens already have the sidebar entry, which costs nothing and covers nothing.

**Draggable, and it snaps to the nearer side on release.** A launcher welded to one corner eventually covers the one control somebody needs, and this dashboard puts cards and buttons exactly there. Snapping is what makes dragging safe: it can be moved out of the way but never left stranded over the middle of a form. Position is remembered per browser.

Three details make it feel like a control rather than a bug. Movement under 6px counts as a tap, so trying to move it does not open the chat. `setPointerCapture` keeps the drag alive when the finger slides off the bubble, which is what drops it on a fast flick otherwise. And only the snap-back is animated — transitioning during the drag makes the bubble lag the finger.

`#2F5664` is deliberately outside the palette: the launcher floats above the app rather than belonging to it, so it stays put while the page changes underneath. White on it is 7.97:1, and it holds 7.3:1 or better against every ground the app uses.

### Deploying it

```bash
# 1. Who moderates. Without this every Admin can remove people.
flyctl secrets set TEAM_CHAT_ADMINS="emmanithbussa2000@gmail.com,sairajesh140@gmail.com" -a grillexa

# 2. Deploy. `npm start` runs `prisma migrate deploy`, so the tables, the
#    membership rows and the announcement all land on boot.
flyctl deploy -a grillexa
```

Nothing else is needed — push already works, since the chat reuses the VAPID setup and `lib/push.js` that store notifications were built on.

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

**Cutting over is not the same as switching it off.** The cluster (`kyzl60x136lopj9g` / `grillexa-db`) kept running until it was destroyed on 2026-08-10, billing the whole time for a database nothing connected to — 93% of the July 2026 invoice ($26.83 compute + $1.98 storage of $30.85), on track for ~$42/month once a full month was billed. It stayed invisible because **Managed Postgres does not appear in `flyctl apps list`, `flyctl volumes list`, or the GraphQL `addOns` query**; the only command that shows it is:

```bash
flyctl mpg list --org personal
```

Destroy it with `flyctl mpg destroy <cluster-id>`, never `flyctl mpg detach` — detach strips the app's `DATABASE_URL` secret, which by then holds the *Neon* URL. Confirm the secret's digest is unchanged afterwards (`flyctl secrets list -a grillexa`), and check a real query rather than `/health`, which never touches the database.

Two things that bite on this restore path, both already handled in the dump command above: extensions (`pg_stat_monitor`, `pgaudit` are Percona/Fly-specific and do not exist on Neon — scoping the dump to `--schema=public` leaves them out), and `CREATE SCHEMA public` colliding with the one Neon creates for a new database.

The app image is stateless and holds no volume, so replacing a machine cannot lose data.

`min_machines_running = 1` is deliberate: a cold boot is ~26 seconds because `prisma migrate deploy` runs before Nginx binds, and once the app is installed to a phone home screen that delay is a blank splash screen. It costs ~$4.19/month to hold one machine on at `sin` rates, about $2/month more than letting it stop when idle — with the Postgres cluster gone this is now essentially the entire Fly bill.

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
| `VAPID_PUBLIC_KEY` | Public half of the web-push keypair, handed to browsers so they can address a subscription to this server. Public by design. Generate both with `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | Signs each push. A Fly secret, never committed. **Rotating the pair invalidates every existing subscription**, so it is not routine |
| `VAPID_SUBJECT` | Contact address a push service uses to reach an operator about a misbehaving sender. Must be a `mailto:` or `https:` URL. Defaults to the maintainer's address |
| `GEMINI_API_KEY` | Powers the WhatsApp Content Generator panel. Free tier, no card, from <https://aistudio.google.com/apikey>. A Fly secret. First choice of three providers |
| `ANTHROPIC_API_KEY` | Optional alternative provider — better writing, roughly ₹5 a post. Used only if `GEMINI_API_KEY` is unset. A Fly secret, never committed |
| `AI_PROVIDER` | Optional. Forces `gemini`, `claude` or `pollinations` instead of picking the first configured one. Errors rather than falling back if the named one is not set up |
| `POLLINATIONS_ENABLED` | Optional, default on. The keyless free fallback used when nothing else is configured. `false` turns it off so a missing key fails loudly instead of quietly writing a worse post |
| `WEATHER_LAT` / `WEATHER_LON` | Optional. Where to read the weather for; defaults to Amberpet, Hyderabad. No key — Open-Meteo is keyless |
| `WHATSAPP_REMINDER` | Optional, default on. `off` silences the daily "today's post isn't written" push notification |
| `WHATSAPP_REMINDER_HOUR` | Optional, default `7`. The IST hour the reminder may go out from. An empty value falls back to 7 rather than to midnight |
| `WHATSAPP_AUTHORS` | Comma-separated **email addresses** allowed to write channel posts, checked on top of the Admin/Manager role. **Fails closed** — unset means nobody, and the panel does not appear for anyone. Emails rather than names because they are unique in the database and stable |
| `TEAM_CHAT_ADMINS` | Comma-separated **email addresses** allowed to moderate the team chat, checked on top of the Admin role. Unlike `WHATSAPP_AUTHORS` this **fails open** — unset means every Admin, because a room nobody can manage is worse than one extra person having the button |
| `STORE_GEOCODE_CITY` | Optional, and **off when unset — which is the safe default, not an oversight**. The city to resolve bare store addresses against ("MG Road", "Whitefield") when filling a missing pin in the background after a bill. Unset, no background geocoding happens at all. Set it only to the city these shops are actually in: run without one, a real backfill matched three of six Bengaluru shops onto Chennai lookalikes, every one a confident-looking result |
| `GEO_NOTIFY_EMAIL` | **One** email address told when a store gets located — successes only, from both the GPS capture and the address fill. **Fails closed**, like `WHATSAPP_AUTHORS`: unset means nobody, never "everybody". That direction is deliberate — these notifications say where a member of staff physically was when they rang up a bill, so a missing or misspelt value has to produce silence rather than broadcast location data to the whole team. Matched case-insensitively. The push **expires after 24 hours**, so a phone that was off all weekend gets nothing on Monday rather than a stack |
| `STORE_GEOCODE_TIMEOUT_MS` | Optional, default `2000`. How long the background pin fill waits for a geocoder before giving up on this bill's attempt. The HTTP calls abort themselves at 8s regardless, so this only shortens the *waiting*, and racing it does not cancel the request. Raise it if pins are not appearing and the logs show it giving up — the work is off the request path, so a longer wait costs nobody anything |
| `ZENQUOTES_KEY` | **Optional, and currently pointless.** It configured the Wisdom Planner's suggestion button, and that page has been removed — `GET /api/quotes/suggestions` still honours the key but nothing calls it. Safe to leave unset |

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
| POST | `/api/stores` | Authenticated — a salesperson outside a new shop is the person best placed to capture its pin |
| PATCH/DELETE | `/api/stores/:id` | Admin — renaming or removing rewrites history that invoices and ledgers point at |
| POST | `/api/stores/:id/pin` | Admin, Manager, Sales — store-scoped. Writes coordinates only; silently drops a fix coarser than 65m |
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
| POST | `/api/wastage` | Authenticated, any role — end-of-shift count, `{ date, lines: [{ productId, quantity, reason }] }`. No store, no cap, blanks skipped |
| GET | `/api/wastage/summary?from=&to=` | Admin, Manager — totals by product at cost, with the reason split and who counted each row |
| GET | `/api/wastage/products` | Authenticated — the catalogue and the reason list the modal is built from |
| GET | `/api/quotes/today?audience=STAFF\|CUSTOMER` | Authenticated — the day's line. Only `STAFF` is still called, by the dashboard card; bills no longer ask for `CUSTOMER` |
| GET/POST/PATCH/DELETE | `/api/quotes`, `/api/quotes/:id` | Admin — **orphaned.** The planner page that used these was removed; they work, nothing calls them |
| GET | `/api/quotes/suggestions` | Admin — **orphaned**, same reason |
| GET | `/api/whatsapp/options`, `/suggestions`, `/history` | Admin, Manager **and** on the `WHATSAPP_AUTHORS` allowlist |
| POST | `/api/whatsapp/generate` | Same gate — rate-limited to 60/hour, every call bills a third party |
| POST | `/api/whatsapp/history/:id` | Same gate — marks a post as actually posted, or rates it |
| GET | `/api/whatsapp/calendar` | Same gate — all ninety planned cells in one response, generated posts included |
| POST | `/api/whatsapp/calendar/:id/generate` | Same gate — polishes one cell's draft into a full post, same 60/hour limit |
| PATCH | `/api/whatsapp/calendar/:id` | Same gate — `{ sent }` to tick a cell off, `{ fullPost }` to keep an edit |
| GET | `/api/team-chat?after=&limit=` | Authenticated **and** an active chat member — the thread, the pinned messages and whether you may moderate |
| GET | `/api/team-chat/unread` | Authenticated — just the number, for the sidebar badge. Answers 0 for a non-member rather than 403 |
| POST | `/api/team-chat` | Active member — send. Rate-limited to 30/minute |
| POST | `/api/team-chat/read` | Active member — marks the room read now |
| DELETE | `/api/team-chat/:id` | Admin **and** on `TEAM_CHAT_ADMINS` — soft delete. Refuses the system announcement |
| POST | `/api/team-chat/:id/pin` | Same gate — pin or unpin. Refuses the announcement and deleted messages |
| GET | `/api/team-chat/members` | Active member — the roster. Who is *not* in it is sent only to a moderator |
| POST | `/api/team-chat/members` | Same gate — add, or re-add somebody who left. Upsert, so it never doubles a person |
| DELETE | `/api/team-chat/members/:userId` | Same gate — a flag, not a delete, so their messages stay readable. You cannot remove yourself |

## MCP servers

`mcp-servers/grillexa-growth-hunter` is an MCP server that looks for revenue the
network is not yet taking: whether a location is a genuine gap or would
cannibalise a shop we already supply, which parts of a city are underserved,
what can honestly be told a retailer, and which leads are worth the drive. It
reads the same database through the backend's own Prisma client, and every
answer carries the coverage it was drawn from — currently one geocoded store, so
the caveats are the point. See its own README.

## Tests

```bash
cd backend && npm test
cd frontend && npm test
```

No framework, no database, no browser — plain Node scripts that print `ok` lines.

Backend, twenty files:

- `test/crash-guards.js` — malformed request bodies return 400 rather than killing the process (an unhandled rejection in an async handler exits Node on Express 4), `todayStr` is ISO and round-trips, and public signup stays gone.
- `test/stock-cascade.js` — the ledger cascade against an in-memory Prisma stub: back-dated writes re-chain later days, moving a document between dates leaves nothing behind, and reversing a bill restores stock exactly.
- `test/stock-rollup.js` — the all-stores sheet's arithmetic: every product gets a row even with no movement, day totals add up across stores, and consignment units come from the open consignments rather than a carried-forward balance — so the units column and the value card can't drift apart.
- `test/pricing.js` — prices come from the catalogue, a Sales account cannot override one, an edit keeps what the bill already charged, and a product new to the bill prices from the catalogue.

- `test/consignment-list.js` — who sees which consignments, and how many: a manager or admin is never store-scoped (with or without a status filter), a Sales account always is, and the outstanding list is never truncated while the history list still is.
- `test/dashboard.js` — the numbers people are ranked on: a return subtracts from its product rather than inflating it, a product only returned today is not a "top seller", a tie shares the higher place, a blank baseline gives no percentage instead of an invented one, and the oldest unsettled consignment is chased first.
- `test/analytics.js` — the arithmetic behind the charts and the workbook, which are the same arithmetic: a dead day is a zero on the line rather than a gap the chart draws straight through, returns subtract, wastage is valued at cost, a long tail folds into one "Other" that keeps the money, and coverage is null (not 0%) for someone with no stores. The last test writes a real workbook and reads it back — six sheets, bold filled frozen headers, ₹ formats, and dates that arrive as dates rather than as text that cannot be sorted.
- `test/wisdom.js` — the daily line (the planner page it was written for is gone, but `lib/wisdom.js` still picks the staff card's message): a day's message is the same every time it is asked and does not depend on the order the database returned rows in, a message pinned to a date beats the rotation, a switched-off line is never shown, an empty planner is null rather than a crash, and the relevance filter keeps "Let food be thy medicine" while rejecting "Be the change you wish to see" — and is not fooled by "create" containing "ate" or "wealthy" containing "health".
- `test/offline-import.js` — the offline CSV import end to end without a database: the parser (quotes, CRLF, a UTF-8 BOM), every rule that stops a bad row reaching the ledger, and the write path against the same in-memory Prisma stub — a re-import creates no second bill and adds no second lot of wastage, a corrected file applies the difference, and wastage entered by hand is not swallowed.

- `test/wastage.js` — the end-of-shift count's rules, which are mostly about what is *not* an error: the modal posts every product in the catalogue and most of them are blank, so a blank is skipped rather than written as a zero or rejected, an empty submission is caught as "nothing counted", a fractional count is refused before it can hit an Int column, the same product twice is refused rather than double-counted, and there is no upper bound because there is nothing to bound it against. The summary values at cost and keeps the reason split.

- `test/team-chat.js` — one room the whole staff writes in, and two of five Admins moderate it. The part that must not be wrong is who may delete a message and remove a person, so: the two named Admins moderate and the other three do not, the allowlist narrows the Admin role but can never widen it to a Manager, a removed member cannot post, a deleted message loses its body but keeps its place, and nobody — moderator included — can delete the announcement. One test exists because of a real bug: the badge must count authorless system messages, which a plain `senderId <> N` silently dropped.

- `test/whatsapp-calendar.js` — the 30-day calendar is ninety rows of copy in a JSON file plus one small map, and both rot quietly. The strategy file is checked for thirty contiguous days with all three times of day, nothing blank that the schema requires, no draft over a hundred words, and none of the words `prompts/brand.md` forbids outright — beef and pork among them, which lose readers permanently. Then the join: every time of day must still name a content type the generator actually has, and pass a meal only to a type that takes one.

- `test/storePin.js` — whether a location captured during billing becomes a store's pin. Worth testing because both mistakes are silent: refuse too eagerly and a store stays invisible to every location question, accept too eagerly and a wifi guess is written that looks exactly like a GPS fix and misdirects deliveries for good. So: a coarse fix is refused even when there is no pin at all, `accuracyM` of `0` is "the sensor said nothing" rather than "perfectly accurate", a hand-placed pin is never overwritten, a geocoded one always is, a measured pin is only replaced by a *strictly* better reading, and the accuracy gate outranks the improvement test — a 3km fix does not replace a 5km one, since better is not the same as good enough.

- `test/storeGeocode.js` — the guards on the background geocode that runs after a bill. All of them stop one of two things: hammering a free service on a shared outbound IP, or writing a guess over something better. So an unconfigured city means no lookup at all, a store that already has a pin is never touched, a store with no address is skipped rather than searched blank, a missing store returns false instead of throwing, the day-long throttle is checked at both edges, and the city is folded into the query string rather than trusted to a proximity hint the geocoder may ignore. One test covers the hard constraint directly: `ensureStoreCoordinates` returns `undefined` synchronously and throws for no argument at all — not `null`, a float, a string, `NaN` or an object — because a route that has already sent its response must not be able to block on it or be crashed by it.

`test/fake-tx.js` is not a test: it is the in-memory Prisma stub `stock-cascade.js` and `offline-import.js` share, so there is one fake to keep honest rather than two that drift. It applies the schema's column defaults on insert the way Postgres does — a fake that returned a defaulted column as `undefined` turned the import's wastage delta into `NaN`, which looked exactly like a bug in the code.

Frontend, eleven files:

- `test/greeting.js` — the login greeting's name and time-of-day boundaries. Everyone who logs in sees it, and a greeting can't fail, only be wrong.
- `test/invoice.js` — a Consignment Note never calls itself an invoice. Both renderers (the WhatsApp text and the PDF) are checked against the same `documentOptions`, the PDF by building it in Node with jsPDF and reading the labels back out of the finished document.
- `test/searchSelect.js` — the combobox every store and product picker is built on: matching anywhere in the name and case-insensitively, recent picks first without reordering the caller's list, and highlighting that covers every occurrence without losing characters.
- `test/storeLinks.js` — the Directions and Call links. A wrong maps URL sends a delivery to the wrong end of the city and never looks like an error, so half a pin is never sent as a coordinate, zero is treated as a real coordinate rather than a missing one, and a pair pasted from Google Maps lands in both fields.
- `test/reportNarrative.js` — the Reports PDF is a document somebody forwards, which makes the wording part of the product: a report that says "Yes, we made money" about a period that lost money is worse than no report. A loss says "No" and never reports paise-in-the-rupee; a period with no sales says "nothing sold" rather than printing zeros; no wastage counted is flagged as a possibly-missed count rather than as good news; someone can top the sales table and still be named for leaving half their shops unvisited. One test asserts no ₹ reaches the PDF, since jsPDF's fonts have no glyph for it.
- `test/iconShadow.js` also checks the opposite mistake: a component-shaped name a file **uses and never imports**. `Sidebar.jsx` listed `icon: MessagesSquare` in `NAV` without importing it, and `NAV` is a module-level const — so the reference threw the moment the module loaded, before anything rendered, and Grillexa did not start for anyone. The build does not resolve identifiers, so it passed; the tests do not load the bundle, so they passed. Telling a binding from a use is the whole difficulty, since `icon: Icon` inside `({ … })` declares a name while `icon: MessagesSquare` inside an array literal uses one.

- `test/cssVars.js` — a custom property that is never defined resolves to nothing, and the rule it was in silently does nothing. The pinned-message bar shipped using a token from an unreleased palette, so in production it had no background: dark text on the dark page, with the launch announcement sitting in it unreadable. It was not alone — eight tokens across forty-nine uses were undefined on main, so paddings collapsed, transitions never ran and headings fell back to the body face. Nothing failed, because the build does not resolve custom properties and the browser check ran against a working copy where the tokens existed. Any `var(--x)` without a fallback must now be declared.

- `test/route-structure.js` — a `<Route>` that is not a direct child of `<Routes>` never mounts, and nothing else notices. This shipped: `/team-chat` was added inside the `/users` element rather than beside it, React rendered it without complaint, the build passed, every test passed, and grepping the deployed bundle for `/team-chat` returned **true** — while the path fell through to the catch-all and redirected to `/`.

  Indentation was the only visible difference, so a line-based scan cannot catch it. **Brace depth** can: a route's children live inside `element={ … }`, so a `<Route>` at depth 0 is a sibling and one at depth 1 or more is buried. The file also cross-checks that every `to:` in the sidebar's `NAV` has a matching `<Route path>` — a nav link to a route that does not exist produces the same silent redirect from the other direction.

  Two of its five checks test the checker: one asserts it flags a known-bad sample, the other that it stays quiet on a good one. Both exist because the first two attempts at this file — one written by hand, one a tag-depth scanner — each returned **zero buried routes** on the very file that shipped broken. Without them the suite would have gone green on a test that verified nothing, which is exactly the failure it was written to prevent.
- `test/reorder.js` — "Reorder from Last …" repeats the order, not last month's prices: lines are re-priced from the current catalogue, a product with no price comes back blank rather than as an explicit `0`, and a discontinued product is dropped and named rather than silently removed.
