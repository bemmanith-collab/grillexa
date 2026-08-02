-- Display order for the product lists. Alphabetical split the two sprouts
-- around "Mixed fruit bowl"; staff read the list by family.
ALTER TABLE "Product" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 100;

-- Seeded in tens so a product can be slotted between two others later without
-- renumbering. Matched case-insensitively on name because these were typed in
-- by hand; anything not listed keeps the default and sorts after them by name.
UPDATE "Product" SET "sortOrder" = 10 WHERE lower(name) = 'banana';
UPDATE "Product" SET "sortOrder" = 20 WHERE lower(name) = 'green sprouts';
UPDATE "Product" SET "sortOrder" = 30 WHERE lower(name) = 'mixed sprouts';
UPDATE "Product" SET "sortOrder" = 40 WHERE lower(name) = 'mixed fruit bowl';
UPDATE "Product" SET "sortOrder" = 50 WHERE lower(name) = 'single fruit bowl';
