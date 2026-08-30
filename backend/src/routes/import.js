const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { toRecords, planImport, applyImport } = require('../lib/offlineImport');
const { ensureStoreCoordinates } = require('../lib/storeGeocode');

const router = express.Router();

router.use(authenticate);

// Backfill of sales and wastage recorded on paper or in a spreadsheet before
// the app was in use, one row per date × store × product. See
// scripts/offline-import-template.csv for the columns and
// scripts/crosstab-to-csv.js for turning a cross-tab sheet into them.
//
// ADMIN/MANAGER only: it writes bills for any store on any date, which is
// exactly what a SALES account is scoped away from. The role check is
// therefore the store check too, and assertStoreAccess would be a no-op here.
//
// The body is the CSV itself (Content-Type: text/csv), so there is no file
// upload to parse and no multipart dependency:
//
//   curl -X POST https://.../api/import/offline \
//     -H 'Content-Type: text/csv' --data-binary @offline.csv \
//     -b 'grillexa_session=...'
//
// Add ?dryRun=true to validate and see what would be written, changing
// nothing. Worth doing first on a file this size — it costs one request.
router.post(
  '/offline',
  requireRole('ADMIN', 'MANAGER'),
  express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }),
  async (req, res) => {
    const dryRun = req.query.dryRun === 'true';

    if (typeof req.body !== 'string' || req.body.trim() === '') {
      return res.status(400).json({
        error: 'Send the CSV as the request body with Content-Type: text/csv',
      });
    }

    const { rows, error } = toRecords(req.body);
    if (error) return res.status(400).json({ error });

    const [stores, products] = await Promise.all([
      prisma.store.findMany(),
      prisma.product.findMany(),
    ]);
    const storesByName = new Map(stores.map((s) => [s.name.trim().toLowerCase(), s]));
    const productsByName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]));

    const { plan, errors } = planImport(rows, { storesByName, productsByName });

    // Nothing is written unless every row is good. A half-imported day of
    // takings is worse than a rejected file: the ledger looks plausible and
    // nothing says which rows are missing.
    if (errors.length > 0) {
      console.warn(
        `Offline import rejected for ${req.user.email}: ${errors.length} bad row(s) of ${rows.length}`
      );
      return res.status(400).json({
        error: `${errors.length} row(s) failed validation. Nothing was imported — fix them and send the file again.`,
        rowsRead: rows.length,
        errors,
      });
    }

    if (dryRun) {
      return res.json({
        dryRun: true,
        rowsRead: rows.length,
        message: 'Valid. Nothing was written. Send again without ?dryRun=true to import.',
        results: plan.map((p) => ({
          line: p.line,
          date: p.date,
          store: p.store,
          product: p.product,
          soldQty: p.soldQty,
          wasteQty: p.wasteQty,
          revenue: p.revenue,
          saleNumber: p.saleNumber,
        })),
      });
    }

    try {
      const results = await prisma.$transaction(
        (tx) => applyImport(tx, plan, req.user.id),
        // adjustStock re-chains every later day for the product it touches, so
        // a backfill of old dates does real work per row. The 5s default trips
        // well before the row cap does.
        { maxWait: 15000, timeout: 120000 }
      );

      const salesCreated = results.filter((r) => r.sale === 'created').length;
      const salesSkipped = results.filter((r) => r.sale === 'skipped').length;
      console.log(
        `Offline import by ${req.user.email}: ${results.length} rows, ${salesCreated} bills created, ${salesSkipped} already present`
      );

      res.status(201).json({
        rowsRead: rows.length,
        salesCreated,
        salesSkipped,
        wastageRowsChanged: results.filter((r) => r.wastageDelta !== 0).length,
        nextStep: 'Run: node scripts/recompute-ledger.js --apply',
        results,
      });

      // Every store this file billed against, after the response. One call per
      // distinct store rather than per row — a file can carry hundreds of rows
      // for the same shop, and the day-long throttle inside would drop the rest
      // anyway. Nothing here is awaited and nothing here can throw into the
      // handler. See lib/storeGeocode.js.
      for (const storeId of new Set(plan.map((p) => p.storeId))) {
        ensureStoreCoordinates(storeId);
      }
    } catch (err) {
      // The transaction rolled back, so the database is untouched either way.
      console.error('Offline import failed:', err);
      res.status(err.status || 500).json({
        error: err.status ? err.message : 'Import failed and was rolled back. Nothing was written.',
      });
    }
  }
);

module.exports = router;
