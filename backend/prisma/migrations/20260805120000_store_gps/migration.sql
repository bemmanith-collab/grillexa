-- Store location, for "take me there" on a phone.
--
-- lat/lng are captured from the browser's GPS while standing at the store and
-- are what the Directions button uses; an address typed by hand geocodes to
-- the middle of a neighbourhood, which is not where the shutter is. Nullable
-- because every store already in the table was added without one.
--
-- phone backs the Call button. There was nowhere to put a store's number
-- before, so it starts empty for every existing row.
ALTER TABLE "Store" ADD COLUMN "phone" TEXT;
ALTER TABLE "Store" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "Store" ADD COLUMN "lng" DOUBLE PRECISION;
