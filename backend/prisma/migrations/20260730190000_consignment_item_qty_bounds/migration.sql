-- POST /consignments/:id/settle validates remaining quantities *before* its
-- transaction, so two overlapping settlements (a double-tapped Save on a slow
-- phone connection) can both pass validation and both apply. The result is
-- soldQty + returnedQty exceeding deliveredQty: stock deducted twice and two
-- Sales raised for the same goods, double-counting real revenue.
--
-- The database is the only place that can arbitrate a race it doesn't know
-- about. With this constraint the losing transaction fails and rolls back
-- everything it wrote, instead of quietly corrupting the consignment.
--
-- NOT VALID deliberately: a plain CHECK verifies every existing row as it is
-- added, so one already-corrupted consignment would fail this migration — and
-- entrypoint.sh runs `prisma migrate deploy` under `set -e` before nginx
-- binds, so a failed migration means the app never starts. NOT VALID skips
-- that scan while still enforcing the rule on every future INSERT and UPDATE,
-- which is exactly where the double-settlement happens.
--
-- To enforce it retroactively once the existing rows are known to be clean:
--   SELECT * FROM "ConsignmentItem"
--     WHERE "soldQty" + "returnedQty" > "deliveredQty";
--   ALTER TABLE "ConsignmentItem" VALIDATE CONSTRAINT "consignment_item_qty_bounds";
ALTER TABLE "ConsignmentItem"
  ADD CONSTRAINT "consignment_item_qty_bounds"
  CHECK (
    "soldQty" >= 0
    AND "returnedQty" >= 0
    AND "deliveredQty" >= 0
    AND "soldQty" + "returnedQty" <= "deliveredQty"
  )
  NOT VALID;
