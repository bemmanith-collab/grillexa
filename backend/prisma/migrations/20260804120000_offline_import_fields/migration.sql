-- Both columns support POST /api/import/offline.
--
-- Sale.paymentMethod: how an imported day's takings were collected. Nullable
-- because every bill already in the table was rung up in the app, which does
-- not ask.
--
-- DailyStockEntry.importedWastage: how much of `wastage` the import put there,
-- so re-running an import applies the difference rather than adding the same
-- units twice. Defaults to 0, which is true of every existing row.
ALTER TABLE "Sale" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "DailyStockEntry" ADD COLUMN "importedWastage" INTEGER NOT NULL DEFAULT 0;
