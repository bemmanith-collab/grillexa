-- Geocoding requests answered by Mapbox this month, alongside the map loads.
-- Its own migration rather than an edit to 20260814230000_map_usage: that one
-- has already run on the dev database, and Prisma refuses a migration whose
-- checksum changed after it was applied.
ALTER TABLE "MapUsage" ADD COLUMN "geocodes" INTEGER NOT NULL DEFAULT 0;
