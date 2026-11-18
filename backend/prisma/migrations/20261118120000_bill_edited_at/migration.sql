-- When a bill was last edited. Null = never edited (or edited before this
-- column existed — those edits were never recorded).
ALTER TABLE "Sale" ADD COLUMN "editedAt" TIMESTAMP(3);
ALTER TABLE "Settlement" ADD COLUMN "editedAt" TIMESTAMP(3);
