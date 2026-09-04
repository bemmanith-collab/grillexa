-- Which sales zone a store belongs to ('Zone 1' … 'Zone 4'). Nullable: every
-- store already in the table was added before zones existed.
ALTER TABLE "Store" ADD COLUMN "zone" TEXT;
