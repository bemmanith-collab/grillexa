-- What one unit cost us on the day it was billed. Profit used to read the
-- live Product.costPrice, so changing a product's cost silently rewrote the
-- margin on every bill ever written for it.
ALTER TABLE "SaleLine" ADD COLUMN "costPrice" DOUBLE PRECISION;

-- Bills written before this column existed: today's cost is the only value
-- there is, and it is what the P&L was already showing for them.
UPDATE "SaleLine" sl SET "costPrice" = p."costPrice" FROM "Product" p WHERE p."id" = sl."productId";

-- Snapshot in the database rather than in each route: four places write bill
-- lines (direct sale create/edit, settlement, CSV import) and a fifth would
-- forget. An explicit value is left alone.
CREATE FUNCTION sale_line_snapshot_cost() RETURNS trigger AS $$
BEGIN
  IF NEW."costPrice" IS NULL THEN
    SELECT "costPrice" INTO NEW."costPrice" FROM "Product" WHERE "id" = NEW."productId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sale_line_snapshot_cost BEFORE INSERT ON "SaleLine"
  FOR EACH ROW EXECUTE FUNCTION sale_line_snapshot_cost();
