-- Move store assignment from User.storeId (one store per user) to
-- Store.salesUserId (one owning sales user per store, many stores per user).

-- AlterTable: add the new ownership column on Store
ALTER TABLE "Store" ADD COLUMN "salesUserId" INTEGER;

-- Backfill: give each store the SALES user that currently points at it.
-- If more than one user somehow points at the same store, keep the
-- earliest-created one so the migration is deterministic.
UPDATE "Store" s
SET "salesUserId" = sub."id"
FROM (
  SELECT DISTINCT ON ("storeId") "storeId", "id"
  FROM "User"
  WHERE "role" = 'SALES' AND "storeId" IS NOT NULL
  ORDER BY "storeId", "createdAt" ASC
) sub
WHERE s."id" = sub."storeId";

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_salesUserId_fkey" FOREIGN KEY ("salesUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_storeId_fkey";

-- AlterTable: drop the old single-store column from User
ALTER TABLE "User" DROP COLUMN "storeId";
