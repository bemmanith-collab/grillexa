-- Where a store's pin came from.
--
-- lat/lng/accuracyM could not answer this, and the gap was about to cost real
-- data. A pin placed by hand and a pin guessed from an address both store a
-- null accuracyM, because neither was measured by a sensor — so any rule that
-- reads accuracy alone has to treat them identically. They are not:
--
--   MANUAL   — a person put it there deliberately, possibly to correct a bad
--              guess. Nothing automatic may overwrite it.
--   GEOCODED — a machine's best effort from an address string, which lands on
--              the middle of a neighbourhood as often as on the shutter. It
--              should be replaced by the first decent GPS fix that arrives.
--   GPS      — a sensor reading, with a real accuracyM to compare against.
--
-- Nullable, and null is not a fourth kind: it means the row predates this
-- column and the accuracyM heuristic still decides, exactly as before.
ALTER TABLE "Store" ADD COLUMN "pinSource" TEXT;

-- Every pin that exists today was captured through the Stores page, which only
-- ever wrote a hand-placed pin or a GPS one, and accuracyM tells those apart.
UPDATE "Store" SET "pinSource" = 'GPS' WHERE "lat" IS NOT NULL AND "accuracyM" IS NOT NULL;
UPDATE "Store" SET "pinSource" = 'MANUAL' WHERE "lat" IS NOT NULL AND "accuracyM" IS NULL;
