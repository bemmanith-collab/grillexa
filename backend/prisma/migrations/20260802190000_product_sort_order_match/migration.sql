-- The previous migration seeded sortOrder with `lower(name) = 'mixed sprouts'`
-- and matched nothing on the live catalogue, so every product kept the default
-- 100 and the lists stayed alphabetical — indistinguishable from the change
-- never having been deployed. An equality match on a hand-typed name is the
-- wrong tool: a trailing space, a double space or a size suffix all defeat it.
--
-- Matched here on a normalised prefix: trimmed, lowercased, and internal runs
-- of whitespace collapsed to one. "Mixed  Sprouts " and "Mixed sprouts 200g"
-- both land on 30.
--
-- Anything not matched keeps its current value and sorts after these by name.
-- Set it by hand in the Order column on the Products page rather than by
-- adding a third migration.
UPDATE "Product" SET "sortOrder" = 10
 WHERE lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) LIKE 'banana%';

UPDATE "Product" SET "sortOrder" = 20
 WHERE lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) LIKE 'green sprout%';

UPDATE "Product" SET "sortOrder" = 30
 WHERE lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) LIKE 'mixed sprout%';

UPDATE "Product" SET "sortOrder" = 40
 WHERE lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) LIKE 'mixed fruit%';

UPDATE "Product" SET "sortOrder" = 50
 WHERE lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) LIKE 'single fruit%';
