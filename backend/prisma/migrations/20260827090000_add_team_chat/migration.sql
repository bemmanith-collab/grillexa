-- CreateTable
CREATE TABLE "TeamChatMessage" (
    "id" SERIAL NOT NULL,
    -- Nullable: a system announcement has no author.
    "senderId" INTEGER,
    "body" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamChatMember" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "addedById" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "TeamChatMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamChatMessage_createdAt_idx" ON "TeamChatMessage"("createdAt");

-- CreateIndex
CREATE INDEX "TeamChatMessage_isPinned_idx" ON "TeamChatMessage"("isPinned");

-- CreateIndex
CREATE UNIQUE INDEX "TeamChatMember_userId_key" ON "TeamChatMember"("userId");

-- CreateIndex
CREATE INDEX "TeamChatMember_isActive_idx" ON "TeamChatMember"("isActive");

-- AddForeignKey
ALTER TABLE "TeamChatMessage" ADD CONSTRAINT "TeamChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamChatMessage" ADD CONSTRAINT "TeamChatMessage_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamChatMember" ADD CONSTRAINT "TeamChatMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamChatMember" ADD CONSTRAINT "TeamChatMember_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Everyone already in the system joins the room on the first deploy. A chat
-- that opens empty of people needs an Admin to add six accounts by hand before
-- anybody can say anything, and nobody would.
INSERT INTO "TeamChatMember" ("userId", "isActive", "joinedAt")
SELECT "id", true, CURRENT_TIMESTAMP FROM "User";

-- The room opens with the announcement, pinned, so the first person in finds an
-- explanation rather than an empty screen. No senderId: it is from the app.
--
-- lastReadAt is left null above, so this counts as one unread for everybody and
-- the sidebar badge shows a 1 the first time they open the app. That is the
-- point of shipping it as a message rather than a release note.
INSERT INTO "TeamChatMessage" ("senderId", "body", "isSystem", "isPinned", "createdAt")
VALUES (
  NULL,
  E'🎉 New Feature Alert!\n\n**Team Chat** is now live.\n\nTalk to your team. Get answers faster. Stay in sync.\n\nNo extra apps. No distractions. Just Grillexa.\n\nHope this makes your day more productive! 💬\n\n— The Grillexa Team',
  true,
  true,
  CURRENT_TIMESTAMP
);
