-- CreateTable
CREATE TABLE "WhatsAppContent" (
    "id" SERIAL NOT NULL,
    "day" INTEGER NOT NULL,
    "timeSlot" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "engagementQuestion" TEXT,
    "imageIdea" TEXT,
    "draft" TEXT NOT NULL,
    "fullPost" TEXT,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppContent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppContent_day_timeSlot_key" ON "WhatsAppContent"("day", "timeSlot");

-- CreateIndex
CREATE INDEX "WhatsAppContent_sent_idx" ON "WhatsAppContent"("sent");
