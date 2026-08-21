-- Post history for the WhatsApp content generator.
--
-- Additive only: a new table and nothing touched elsewhere, so it is safe to
-- apply to the live database while the app is serving.
--
-- postDate is the Indian calendar date the post was WRITTEN FOR, which is not
-- always the day it was generated on — a festival post is prepared in advance.
-- Suggestions read this column, not createdAt.
CREATE TABLE "WhatsAppPost" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'english',
    "slot" TEXT,
    "day" TEXT NOT NULL,
    "postDate" TEXT NOT NULL,
    "occasion" TEXT,
    "ingredient" TEXT,
    "topic" TEXT,
    "provider" TEXT,
    "text" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "rating" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" INTEGER NOT NULL,

    CONSTRAINT "WhatsAppPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WhatsAppPost_createdAt_idx" ON "WhatsAppPost"("createdAt");
CREATE INDEX "WhatsAppPost_type_createdAt_idx" ON "WhatsAppPost"("type", "createdAt");

ALTER TABLE "WhatsAppPost" ADD CONSTRAINT "WhatsAppPost_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
