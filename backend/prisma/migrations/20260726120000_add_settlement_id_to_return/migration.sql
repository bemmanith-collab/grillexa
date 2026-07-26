-- AlterTable
ALTER TABLE "Return" ADD COLUMN     "settlementId" INTEGER;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
