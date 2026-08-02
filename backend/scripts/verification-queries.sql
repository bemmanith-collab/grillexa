-- Verification queries for the 1–15 August 2026 report.
--
-- Run them against the live database with:
--   flyctl mpg connect <cluster-id>        # psql session
-- or open a proxy and use any client:
--   flyctl mpg proxy <cluster-id>          # then psql postgres://…@localhost:5432
--
-- Two things to know before trusting any number below.
--
-- 1. The window is matched on the business date columns (Sale.date,
--    DailyStockEntry.date), never on createdAt. Those columns hold a calendar
--    day at midnight UTC; createdAt is the instant the row was written, and
--    anything entered after 18:30 UTC belongs to the next Indian business day.
--    Filtering on createdAt shifts an evening's billing into the wrong report.
--
-- 2. Table and column names are quoted. Prisma created them camelCase with no
--    @@map, so "SaleLine"."unitPrice" is a different identifier from
--    saleline.unitprice, which is what an unquoted query would look for.
--
-- The window is half-open: >= 1 Aug, < 16 Aug.


-- ---------------------------------------------------------------------------
-- 1. Total revenue for the period
-- ---------------------------------------------------------------------------
-- Sale.totalAmount is already net of RETURN lines on the same bill, so this is
-- money taken, not gross billing. The split matters: a settlement sale is
-- revenue recognised now against stock delivered earlier — possibly in July —
-- while a direct sale was billed and paid the same day.
SELECT
  COUNT(*)                                                                    AS bills,
  ROUND(SUM(s."totalAmount")::numeric, 2)                                     AS total_revenue,
  ROUND(SUM(CASE WHEN s."consignmentId" IS NULL
                 THEN s."totalAmount" ELSE 0 END)::numeric, 2)                AS direct_sales,
  ROUND(SUM(CASE WHEN s."consignmentId" IS NOT NULL
                 THEN s."totalAmount" ELSE 0 END)::numeric, 2)                AS settlement_sales
FROM "Sale" s
WHERE s.date >= DATE '2026-08-01'
  AND s.date <  DATE '2026-08-16';


-- Same figure per store per day, for reconciling against what each store says
-- it handed over.
SELECT st.name AS store,
       s.date::date AS day,
       COUNT(*) AS bills,
       ROUND(SUM(s."totalAmount")::numeric, 2) AS revenue
FROM "Sale" s
JOIN "Store" st ON st.id = s."storeId"
WHERE s.date >= DATE '2026-08-01'
  AND s.date <  DATE '2026-08-16'
GROUP BY st.name, s.date
ORDER BY st.name, day;


-- ---------------------------------------------------------------------------
-- 2. Top products by sales
-- ---------------------------------------------------------------------------
-- RETURN lines subtract, in both units and money — that is what the type
-- column is for. Summing amount without the CASE overstates every product that
-- was ever brought back.
SELECT p.name AS product,
       p.sku,
       SUM(CASE WHEN sl.type = 'RETURN' THEN -sl.quantity ELSE sl.quantity END) AS net_units,
       ROUND(SUM(CASE WHEN sl.type = 'RETURN' THEN -sl.amount ELSE sl.amount END)::numeric, 2) AS net_revenue,
       SUM(CASE WHEN sl.type = 'RETURN' THEN sl.quantity ELSE 0 END) AS units_returned
FROM "SaleLine" sl
JOIN "Sale" s    ON s.id = sl."saleId"
JOIN "Product" p ON p.id = sl."productId"
WHERE s.date >= DATE '2026-08-01'
  AND s.date <  DATE '2026-08-16'
GROUP BY p.id, p.name, p.sku
ORDER BY net_revenue DESC;


-- ---------------------------------------------------------------------------
-- 3. Stores with missing reports
-- ---------------------------------------------------------------------------
-- One row per store-day that has no ledger row at all. A store that genuinely
-- had no movement still gets rows the moment anyone opens Today's Stock for
-- it, so a gap here means nobody looked, not that nothing happened.
WITH days AS (
  SELECT generate_series(DATE '2026-08-01', DATE '2026-08-15', INTERVAL '1 day')::date AS d
)
SELECT days.d AS missing_date,
       st.name AS store
FROM days
CROSS JOIN "Store" st
LEFT JOIN "DailyStockEntry" e
       ON e."storeId" = st.id
      AND e.date = days.d::timestamp
WHERE e.id IS NULL
ORDER BY days.d, st.name;


-- The same thing counted per store — the useful ranking when chasing them.
WITH days AS (
  SELECT generate_series(DATE '2026-08-01', DATE '2026-08-15', INTERVAL '1 day')::date AS d
)
SELECT st.name AS store,
       COUNT(*) FILTER (WHERE e.id IS NULL) AS days_missing,
       COUNT(*) FILTER (WHERE e.id IS NOT NULL) AS days_reported
FROM days
CROSS JOIN "Store" st
LEFT JOIN "DailyStockEntry" e
       ON e."storeId" = st.id
      AND e.date = days.d::timestamp
GROUP BY st.name
HAVING COUNT(*) FILTER (WHERE e.id IS NULL) > 0
ORDER BY days_missing DESC, store;


-- ---------------------------------------------------------------------------
-- 4. Sale lines with zero price
-- ---------------------------------------------------------------------------
-- The failure this app has already had: prices came from the client, a SALES
-- account could not see them, and bills saved at 0.00 with stock correctly
-- deducted and no error raised. Prices are resolved server-side now, so this
-- should return nothing — but rows written before that fix are still here.
SELECT s.date::date AS day,
       s.number,
       st.name AS store,
       p.name  AS product,
       sl.type,
       sl.quantity,
       sl."unitPrice",
       sl.amount,
       u.name  AS billed_by
FROM "SaleLine" sl
JOIN "Sale" s    ON s.id = sl."saleId"
JOIN "Store" st  ON st.id = s."storeId"
JOIN "Product" p ON p.id = sl."productId"
JOIN "User" u    ON u.id = s."createdById"
WHERE s.date >= DATE '2026-08-01'
  AND s.date <  DATE '2026-08-16'
  AND sl.quantity > 0
  AND (sl."unitPrice" <= 0 OR sl.amount <= 0)
ORDER BY s.date, s.number;


-- Whole bills totalling zero or less. An all-RETURN bill is legitimately
-- negative, so those are excluded rather than reported as broken.
SELECT s.date::date AS day, s.number, st.name AS store, s."totalAmount", u.name AS billed_by
FROM "Sale" s
JOIN "Store" st ON st.id = s."storeId"
JOIN "User" u   ON u.id = s."createdById"
WHERE s.date >= DATE '2026-08-01'
  AND s.date <  DATE '2026-08-16'
  AND s."totalAmount" <= 0
  AND EXISTS (SELECT 1 FROM "SaleLine" sl WHERE sl."saleId" = s.id AND sl.type <> 'RETURN')
ORDER BY s.date;


-- ---------------------------------------------------------------------------
-- 5. Delivered in the window but not yet settled
-- ---------------------------------------------------------------------------
-- Not one of the four asked for, but it is the largest single reason a
-- consignment business's period revenue reads low: this stock left the
-- warehouse inside the window and no revenue has been recognised for it,
-- because the store has not reported what sold. Quantify it before concluding
-- the month was bad, and chase the oldest ones before 15 August.
SELECT c."deliveredAt"::date AS delivered,
       c."consignmentNo",
       st.name AS store,
       c.status,
       ROUND(SUM((ci."deliveredQty" - ci."soldQty" - ci."returnedQty") * ci."pricePerUnit")::numeric, 2) AS unsettled_value
FROM "Consignment" c
JOIN "Store" st           ON st.id = c."storeId"
JOIN "ConsignmentItem" ci ON ci."consignmentId" = c.id
WHERE c.status IN ('DELIVERED', 'PARTIAL_SETTLED')
  AND c."deliveredAt" >= DATE '2026-08-01'
  AND c."deliveredAt" <  DATE '2026-08-16'
GROUP BY c.id, c."deliveredAt", c."consignmentNo", st.name, c.status
HAVING SUM((ci."deliveredQty" - ci."soldQty" - ci."returnedQty") * ci."pricePerUnit") > 0
ORDER BY delivered, store;
