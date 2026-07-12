-- AlterTable
ALTER TABLE "SaleLine" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'SALE',
ADD COLUMN     "reason" TEXT;
