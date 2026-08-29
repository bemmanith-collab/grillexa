-- CreateTable
CREATE TABLE "RetailerLead" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'OTHER',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracyM" DOUBLE PRECISION,
    "monthlyFootfall" INTEGER,
    "shelfSpaceCm" INTEGER,
    "notes" TEXT,
    "score" DOUBLE PRECISION,
    "scoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" INTEGER,

    CONSTRAINT "RetailerLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetailerLead_status_idx" ON "RetailerLead"("status");

-- CreateIndex
CREATE INDEX "RetailerLead_score_idx" ON "RetailerLead"("score");

-- AddForeignKey
ALTER TABLE "RetailerLead" ADD CONSTRAINT "RetailerLead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

