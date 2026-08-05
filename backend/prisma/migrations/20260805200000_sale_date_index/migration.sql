-- The personal metrics dashboard asks four questions about a single day's
-- sales (the day's bills, the same day last week, the company ranking), for
-- every sales person, refreshed every five minutes. Each one was a full scan
-- of every sale ever recorded; a day is a very small slice of that.
--
-- CONCURRENTLY is deliberately not used: prisma migrate deploy runs inside a
-- transaction, which forbids it, and this table is small enough that the brief
-- write lock is unnoticeable.
CREATE INDEX "Sale_date_idx" ON "Sale"("date");
