-- The launch announcement was written with markdown emphasis, and the chat
-- renders plain text — so "**Team Chat**" appeared on screen with the asterisks
-- showing. Strip them.
--
-- A separate migration rather than an edit to the one that inserted the message:
-- that one has been applied everywhere, and Prisma checksums applied migrations,
-- so changing it would fail every later `migrate deploy`.
--
-- Scoped to system messages and idempotent — it matches nothing on a second run,
-- and it will never touch something a person typed.
UPDATE "TeamChatMessage"
SET "body" = replace("body", '**', '')
WHERE "isSystem" = true
  AND "body" LIKE '%**%';
