-- One row per day a "today's post isn't written" reminder went out.
--
-- The unique index on sentFor is doing real work: Fly runs more than one
-- machine, both can be awake, and each runs the same timer. They all race to
-- insert; the first commits and sends, the others hit the constraint and stay
-- quiet. Without it the reminder arrives twice on any morning both are up.
CREATE TABLE "WhatsAppReminder" (
    "id" SERIAL NOT NULL,
    "sentFor" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipients" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WhatsAppReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppReminder_sentFor_key" ON "WhatsAppReminder"("sentFor");
