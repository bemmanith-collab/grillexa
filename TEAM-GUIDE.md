# Grillexa — how to use it

For everyone on the team. The developer notes are in [README.md](README.md); this is the one to hand to staff.

App: **https://grillexa.fly.dev**

---

## 1. First time — install it on your phone

1. Open **https://grillexa.fly.dev** in Chrome (Android) or Safari (iPhone).
2. Log in with the email and password your Admin gave you. There is no signup — an Admin creates every account.
3. Tap **Install app** on the login screen.
   - **iPhone:** there is no button. Tap **Share** → **Add to Home Screen**.
4. Open it from the Home Screen from now on. On iPhone this is the only way notifications work.
5. Tap **Change password** (the key icon, bottom of the menu) and set your own.
6. **Tap Notifications, and allow it when the phone asks.** On a phone it's under **More**; on a computer it's at the bottom of the left-hand menu. You will not be told when anyone adds a shop until you do this — it is off until you turn it on, on **each** phone or computer you use.
7. **Android only:** Settings → Apps → **Chrome** → Battery → **Unrestricted**. Android holds notifications back for hours otherwise, and they arrive that evening instead of when the shop was added.

You stay logged in. If you're on a shared phone, **log out at the end of the shift** — that also stops the phone buzzing with your notifications.

---

## 2. Every day, in order

### Morning — load the van

Nothing to enter. You bill as you drop.

### At each shop — one of two things happens

**A) Leaving stock at a shop (the normal case) → Deliver to Store**

1. **Deliver to Store**
2. Pick the store — start typing its name, the list filters.
3. Add each product and the quantity. (**Reorder from Last** copies the last delivery to this store — check the quantities, prices come from today's catalogue.)
4. **Deliver to Store** to save. A Consignment Note is created.

This is **not a sale yet**. The stock is at the shop but still yours.

**B) Selling straight to a walk-in customer → Direct Sale**

1. **Direct Sale**
2. Pick the store, add products and quantities, enter the customer's name/phone if you have it.
3. Save. That's a bill, paid now.

A customer returning goods: add the item as a **RETURN** line on the bill — it credits them and comes off the total.

### When a shop pays you — Settle Consignment

This is where the money is actually recognised. Do it on your next visit.

1. **Settle Consignment**
2. Find the shop's consignment in the list (search by store name). Every unsettled one is there, however old.
3. For each product enter **Sold Qty** (what the shop sold and is paying for) and **Returned Qty** (what's coming back unsold).
4. **Sold + Returned can't be more than what you delivered.** The **Remaining** column tells you per row if you've gone over ("5 · over by 5") and the save button stays disabled until you fix it.
5. Save. Sold becomes a bill; returned comes back to HQ as good stock.

You don't have to settle it all at once — settle what's paid, come back for the rest.

Got it wrong? Switch to the view that includes settled ones and correct the last settlement.

### End of shift — count what spoiled

1. **My Dashboard** → **Record Wastage**
2. Pick the date, then one row per product: quantity and a reason (Spoiled / Damaged / Expired / Other).

**Only count what's actually thrown away.** Stock that came back unsold from a shop is *not* wastage — it goes out again tomorrow, and the settlement already recorded it.

---

## 3. Adding a new shop

**Anyone can add a store.** If you're standing outside a new shop, add it there and then — that's the only time the GPS pin is right.

1. **Stores** → fill in the name and phone.
2. Tap **📍 Get Current Location** and **stand outside the shop** while it works. Wait for it to finish, a few seconds.
3. Check the accuracy badge:
   - **perfect / good** (green) — done, the address fills in too.
   - **fair** or **poor** — the pin saved but it's rough. Tap **📍 Try again — step outside**, or fix it by hand (next point).
4. To fix a pin by hand: **Pick on map**, then tap/drag to the shutter. Or open **Find it on Google Maps**, long-press the shop there, copy the coordinates, and paste them into the latitude box — it splits the pair for you.
5. Save. Everyone else who has switched notifications on gets one — not the whole team automatically, only the devices that were registered in step 6 of the setup above.

Editing or deleting a store is Admin only — ask them.

**Directions** and **Call** on the Stores page work for everyone. If a store has no pin, Directions is labelled *(approx.)* — it's searching the address, not driving to a pin.

---

## 4. Checking your day

**My Dashboard** is the page you land on. Stores visited, takings, how today compares with the same day last week, consignments you settled, your top products, where you rank, and what needs chasing.

- **"Stores visited"** means stores where you billed, delivered, or settled today. Walking in and selling nothing counts as missed.
- **"Needs attention"** lists consignments delivered 2+ days ago that nobody has settled. Chase those.
- Pull down to refresh.

**Today's Stock** opens on all your stores at once — one row per product. Pick a single store to see just that one.

---

## 5. Managers and Admins

- **Reports** — charts and Profit & Loss for a date range. Tap any bar, slice or day to filter the whole page to it. **Download Excel** gives you six sheets.
- **My Dashboard** — use the picker at the top to see any individual's day, or **Everyone (company)**.
- **Products** (Admin/Manager) — prices, cost prices, and the **Order** column that sets what order products appear in everywhere. Numbers run 10, 20, 30… so you can slot one between two others.
- **Users** (Admin) — create accounts, set roles, assign stores, reset passwords.
- Sales accounts never see prices, Reports, or other people's numbers.

---

## 6. Common questions

**I can't see a store.** Sales accounts only see stores assigned to them, plus any they added themselves. Ask an Admin to assign it.

**I got the bill wrong.** Direct Sale bills can be edited from the Sales list — the bill number stays the same, so a printed copy still matches. Bills created by settling a consignment are edited from **Settle Consignment** instead.

**The price is wrong / shows nothing.** Prices come from the catalogue, not from you. Sales accounts don't see or set prices at all — tell a Manager.

**Nothing happens when I press save.** Check for a red note next to the fields, particularly the **Remaining** column on Settle Consignment. On a phone the message at the top of the page is often scrolled out of sight.

**I'm not getting notifications.** They're off until you turn them on, on every device separately — tap **Notifications** (under **More** on a phone) and allow it when asked. If the button already says *Turn off notifications*, that device is registered and the problem is below.

**No notifications on my iPhone.** They only work if the app was added to the Home Screen and you opened it from there. Then check Settings → Notifications → **Grillexa**: *Allow Notifications* on, and **Banners** enabled. Set to *Deliver Quietly* they go straight to the Notification Center without a sound, which looks exactly like nothing arriving. Check Focus and Do Not Disturb too.

**Notifications arrive hours late on Android.** Settings → Apps → **Chrome** → Battery → **Unrestricted**, and turn off Data Saver. Android otherwise holds them until it next wakes the app up, so a shop added at nine in the morning gets announced after the round is finished.
