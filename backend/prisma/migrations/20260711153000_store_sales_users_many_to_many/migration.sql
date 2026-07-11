-- Replace the exclusive Store.salesUserId (one sales user per store) with a
-- many-to-many join table, so a store can have more than one sales person
-- assigned (e.g. someone covering for a colleague who's out).

-- CreateTable
CREATE TABLE "_StoreToUser" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- AddForeignKey
ALTER TABLE "_StoreToUser" ADD CONSTRAINT "_StoreToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StoreToUser" ADD CONSTRAINT "_StoreToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: carry over each store's existing single sales-user assignment.
INSERT INTO "_StoreToUser" ("A", "B")
SELECT "id", "salesUserId" FROM "Store" WHERE "salesUserId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "_StoreToUser_AB_unique" ON "_StoreToUser"("A", "B");

-- CreateIndex
CREATE INDEX "_StoreToUser_B_index" ON "_StoreToUser"("B");

-- DropForeignKey
ALTER TABLE "Store" DROP CONSTRAINT "Store_salesUserId_fkey";

-- AlterTable
ALTER TABLE "Store" DROP COLUMN "salesUserId";
