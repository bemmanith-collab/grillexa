-- How good the GPS fix was, in metres.
--
-- Without it a pin taken indoors off wifi (often kilometres out, especially
-- where GNSS is weak) is indistinguishable from one taken on the doorstep, and
-- the only symptom is a driver arriving at the wrong shop. Storing the radius
-- lets the store list show it and flag the ones worth re-capturing.
--
-- Null means no sensor estimate: every store pinned before this column
-- existed, and any pin typed in by hand.
ALTER TABLE "Store" ADD COLUMN "accuracyM" DOUBLE PRECISION;
