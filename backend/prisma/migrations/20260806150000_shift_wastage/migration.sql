-- End-of-shift wastage, counted by a salesperson at the end of their run.
--
-- No storeId, on purpose: unsold consignment stock is already back at HQ as a
-- CONSIGNMENT_UNSOLD Return by the time anyone counts what spoiled, so there
-- is no store ledger to decrement and no store to attribute it to.
--
-- This is a SEPARATE ledger from DailyStockEntry.wastage, which is stock that
-- spoiled inside a store. The two are never summed — see the note on the
-- Wastage model in schema.prisma.
CREATE TABLE "Wastage" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wastage_pkey" PRIMARY KEY ("id")
);

-- The summary reads by date range; the dashboard writes one shift at a time.
CREATE INDEX "Wastage_date_idx" ON "Wastage"("date");

ALTER TABLE "Wastage" ADD CONSTRAINT "Wastage_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Wastage" ADD CONSTRAINT "Wastage_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A count is a positive whole number of units. There is deliberately no upper
-- bound: the app tracks no HQ stock, so there is no "available quantity" to
-- cap against, and an invented cap would refuse a true count.
ALTER TABLE "Wastage" ADD CONSTRAINT "Wastage_quantity_positive" CHECK ("quantity" > 0);
