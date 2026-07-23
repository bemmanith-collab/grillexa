-- AlterTable
ALTER TABLE "DailyStockEntry" ADD COLUMN     "consignmentQty" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "consignmentId" INTEGER;

-- CreateTable
CREATE TABLE "Consignment" (
    "id" SERIAL NOT NULL,
    "consignmentNo" TEXT NOT NULL,
    "storeId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DELIVERED',
    "deliveredAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsignmentItem" (
    "id" SERIAL NOT NULL,
    "consignmentId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "deliveredQty" INTEGER NOT NULL,
    "soldQty" INTEGER NOT NULL DEFAULT 0,
    "returnedQty" INTEGER NOT NULL DEFAULT 0,
    "pricePerUnit" DOUBLE PRECISION NOT NULL,
    "totalValue" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ConsignmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" SERIAL NOT NULL,
    "settlementNo" TEXT NOT NULL,
    "consignmentId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "saleId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementLine" (
    "id" SERIAL NOT NULL,
    "settlementId" INTEGER NOT NULL,
    "consignmentItemId" INTEGER NOT NULL,
    "soldQty" INTEGER NOT NULL DEFAULT 0,
    "returnedQty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SettlementLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Consignment_consignmentNo_key" ON "Consignment"("consignmentNo");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_settlementNo_key" ON "Settlement"("settlementNo");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_saleId_key" ON "Settlement"("saleId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "Consignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consignment" ADD CONSTRAINT "Consignment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consignment" ADD CONSTRAINT "Consignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsignmentItem" ADD CONSTRAINT "ConsignmentItem_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "Consignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsignmentItem" ADD CONSTRAINT "ConsignmentItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "Consignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_consignmentItemId_fkey" FOREIGN KEY ("consignmentItemId") REFERENCES "ConsignmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
