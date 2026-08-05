-- Postgres creates no index for a foreign key column, and Prisma did not add
-- one here. Every analytics query and every sheet of the Excel export asks for
-- the lines belonging to the bills in a date range, which without this reads
-- the whole SaleLine table each time.
CREATE INDEX "SaleLine_saleId_idx" ON "SaleLine"("saleId");
