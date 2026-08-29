// The rules that decide whether somebody drives across a city.
//
// Every one of these runs without a database, a network or a key, because the
// interesting failures here are arithmetic — an overlap formula that is subtly
// wrong still returns a plausible number, and a lead scorer that punishes
// missing data still returns a ranking. Neither shows up by running the server.
//
// Run: npm test (from mcp-servers/grillexa-growth-hunter/).
import assert from 'node:assert/strict';
import {
  haversineM,
  catchmentOverlap,
  evaluateSite,
  scoreCandidate,
  scoreLead,
  gridCandidates,
  thinCandidates,
  buildPitch,
  median,
  DEFAULT_CATCHMENT_M,
  MAX_SERVICE_RADIUS_M,
} from '../src/analysis.js';

const ADYAR = { lat: 13.0067, lng: 80.257 };

// A small network to reason against: two shops 600m apart (they share ground),
// one 5km away (its own catchment), all in Chennai.
const NETWORK = [
  { id: 1, name: 'Adyar', lat: 13.0067, lng: 80.257, dailyRevenue: 1000 },
  { id: 2, name: 'Besant Nagar', lat: 13.0121, lng: 80.257, dailyRevenue: 800 },
  { id: 3, name: 'Guindy', lat: 13.0067, lng: 80.2109, dailyRevenue: 600 },
];

const tests = {
  // --- geometry -----------------------------------------------------------
  'haversine matches a known distance': () => {
    // One degree of latitude is ~111.2km anywhere on the globe.
    const d = haversineM({ lat: 13, lng: 80 }, { lat: 14, lng: 80 });
    assert.ok(Math.abs(d - 111195) < 500, `expected ~111.2km, got ${Math.round(d)}m`);
    assert.equal(Math.round(haversineM(ADYAR, ADYAR)), 0);
  },

  'catchment overlap is the exact circle lens, not a distance guess': () => {
    const r = DEFAULT_CATCHMENT_M;
    assert.equal(catchmentOverlap(r, r, 0), 1, 'same spot is total overlap');
    assert.equal(catchmentOverlap(r, r, 2 * r), 0, 'a diameter apart is none');
    assert.equal(catchmentOverlap(r, r, 5 * r), 0, 'further still is none');

    // Two equal circles whose centres are one radius apart overlap on
    // (2pi/3 - sqrt(3)/2)/pi of their area. Worked by hand; if the formula is
    // ever "simplified" into a linear falloff this is the check that fails.
    const exact = (2 * Math.PI / 3 - Math.sqrt(3) / 2) / Math.PI;
    assert.ok(Math.abs(catchmentOverlap(r, r, r) - exact) < 1e-9, 'lens area is wrong');
    assert.ok(Math.abs(exact - 0.3910) < 0.001, 'sanity: the constant really is ~0.39');
  },

  'overlap falls as distance grows, and never leaves 0..1': () => {
    const r = 800;
    let prev = Infinity;
    for (let d = 0; d <= 2000; d += 50) {
      const o = catchmentOverlap(r, r, d);
      assert.ok(o >= 0 && o <= 1, `overlap ${o} out of range at ${d}m`);
      assert.ok(o <= prev + 1e-12, `overlap rose from ${prev} to ${o} at ${d}m`);
      prev = o;
    }
  },

  // --- is this a gap? -----------------------------------------------------
  'open ground far from every shop is a gap': () => {
    const far = { lat: 13.09, lng: 80.28 }; // ~9km north, still serviceable
    const r = evaluateSite(far, NETWORK);
    assert.equal(r.verdict, 'GAP');
    assert.equal(r.revenueAtRiskPerDay, 0, 'a gap takes nothing off anyone');
    assert.equal(r.serviceable, true);
  },

  'opening on top of an existing shop is cannibalisation': () => {
    const r = evaluateSite(ADYAR, NETWORK);
    assert.equal(r.verdict, 'CANNIBALISATION_RISK');
    // Sits exactly on Adyar, so all of that shop's ground is contested and half
    // its trade moves rather than growing.
    const adyar = r.affectedStores.find((s) => s.name === 'Adyar');
    assert.equal(adyar.catchmentOverlap, 1);
    assert.equal(adyar.revenueAtRiskPerDay, 500);
    assert.ok(r.reason.includes('rather than adding new trade'), r.reason);
  },

  'the share at risk is measured against the shops actually affected': () => {
    // The bug this guards: dividing by the whole network's revenue. Add fifty
    // untouched shops and a doorstep-clone must still read as cannibalisation.
    const padded = [...NETWORK];
    for (let i = 0; i < 50; i += 1) {
      padded.push({ id: 100 + i, name: `Far ${i}`, lat: 12.0 + i * 0.01, lng: 79.0, dailyRevenue: 5000 });
    }
    const r = evaluateSite(ADYAR, padded);
    assert.equal(r.verdict, 'CANNIBALISATION_RISK', 'drowned in the denominator');
  },

  'a site beyond the delivery range is flagged even when it is a gap': () => {
    const veryFar = { lat: 13.9, lng: 80.9 }; // ~130km out
    const r = evaluateSite(veryFar, NETWORK);
    assert.equal(r.verdict, 'GAP');
    assert.equal(r.serviceable, false, 'a gap we cannot service is not an opportunity');
    assert.ok(r.reason.includes('delivery run'), r.reason);
  },

  'overlapping a shop with no sales is not scored as harmless': () => {
    // The bug this guards, found by running the server against the real
    // network: the one geocoded store has never recorded a sale, so revenue at
    // risk divided out to zero and a site on its doorstep came back "INFILL —
    // mostly new ground". It is the same ground. Absent revenue must read as
    // unknown, never as safe.
    const unsold = [{ id: 1, name: 'Anjji Kirana', lat: 13.0067, lng: 80.257, dailyRevenue: 0 }];
    const r = evaluateSite(ADYAR, unsold);
    assert.equal(r.verdict, 'CANNIBALISATION_RISK', 'same spot is never new ground');
    assert.equal(r.maxCatchmentOverlap, 1);
    assert.equal(r.revenueAtRiskKnown, false, 'and the caller must be told it is unpriced');
    assert.ok(r.reason.includes('no recorded sales'), r.reason);
    assert.ok(!r.reason.includes('mostly new ground'), r.reason);

    // Far enough away it genuinely does not overlap: still a gap, and the
    // revenue question never arises.
    const clear = evaluateSite({ lat: 13.09, lng: 80.28 }, unsold);
    assert.equal(clear.verdict, 'GAP');
    assert.equal(clear.revenueAtRiskKnown, true);
  },

  'a light overlap with an unsold shop is infill, not a scare': () => {
    const unsold = [{ id: 1, name: 'Quiet', lat: 13.0067, lng: 80.257, dailyRevenue: 0 }];
    // ~1.2km away: the catchments graze at 800m radius.
    const r = evaluateSite({ lat: 13.0175, lng: 80.257 }, unsold);
    assert.equal(r.verdict, 'INFILL');
    assert.ok(r.maxCatchmentOverlap > 0 && r.maxCatchmentOverlap < 0.5, `overlap was ${r.maxCatchmentOverlap}`);
  },

  'a site with no geocoded stores to compare says so instead of guessing': () => {
    const r = evaluateSite(ADYAR, [{ id: 9, name: 'No pin', lat: null, lng: null, dailyRevenue: 900 }]);
    assert.equal(r.verdict, 'GAP');
    assert.equal(r.nearestStore, null);
    assert.ok(r.reason.includes('No geocoded store'), r.reason);
  },

  // --- where should we be? -----------------------------------------------
  'a candidate outside the service range scores zero with a reason': () => {
    const r = scoreCandidate({ lat: 13.9, lng: 80.9 }, NETWORK, { networkMedianDailyRevenue: 800 });
    assert.equal(r.score, 0);
    assert.ok(r.reason.includes('service range'), r.reason);
  },

  'uncovered ground beside strong shops beats uncovered ground beside weak ones': () => {
    const strong = [{ id: 1, name: 'Strong', lat: 13.0, lng: 80.25, dailyRevenue: 2000 }];
    const weak = [{ id: 1, name: 'Weak', lat: 13.0, lng: 80.25, dailyRevenue: 100 }];
    const point = { lat: 13.03, lng: 80.25 }; // ~3.3km clear of both
    const opts = { networkMedianDailyRevenue: 800 };
    const a = scoreCandidate(point, strong, opts).score;
    const b = scoreCandidate(point, weak, opts).score;
    assert.ok(a > b, `strong neighbourhood ${a} should beat weak ${b}`);
  },

  'a point on top of a shop has no coverage gap': () => {
    const r = scoreCandidate(ADYAR, NETWORK, { networkMedianDailyRevenue: 800 });
    assert.equal(r.coverageGap, 0);
    assert.equal(r.score, 0);
  },

  'the grid does not stretch sideways away from the equator': () => {
    // A degree of longitude is shorter at 13N than at the equator. If the grid
    // uses one step for both axes the cells come out wider than they are tall
    // and every shortlist drifts east-west.
    const cells = gridCandidates({ minLat: 13.0, maxLat: 13.02, minLng: 80.25, maxLng: 80.27 }, 750);
    assert.ok(cells.length > 4, `expected a real grid, got ${cells.length}`);
    const byLat = cells.filter((c) => c.lng === cells[0].lng);
    const dLat = haversineM(byLat[0], byLat[1]);
    const row = cells.filter((c) => c.lat === cells[0].lat);
    const dLng = haversineM(row[0], row[1]);
    assert.ok(Math.abs(dLat - dLng) < 40, `grid is not square: ${Math.round(dLat)}m x ${Math.round(dLng)}m`);
  },

  'thinning keeps the best of a cluster, not twenty of one corner': () => {
    const cluster = [
      { lat: 13.00, lng: 80.25, score: 50 },
      { lat: 13.001, lng: 80.25, score: 90 }, // ~110m away, same corner
      { lat: 13.002, lng: 80.25, score: 70 },
      { lat: 13.05, lng: 80.25, score: 60 }, // 5.5km away, its own place
    ];
    const kept = thinCandidates(cluster, 1500);
    assert.equal(kept.length, 2);
    assert.equal(kept[0].score, 90, 'the best of the cluster survives');
  },

  // --- what is a lead worth? ---------------------------------------------
  'a lead with no coordinates is scored on what is known, not punished to zero': () => {
    // The failure this guards: treating "we never recorded it" as "it is bad".
    // A shop with a phone number and good footfall is a real lead even before
    // anybody stands outside it with a phone.
    const lead = { name: 'Anon Stores', phone: '9000000000', contactName: 'R', monthlyFootfall: 6000 };
    const r = scoreLead(lead, NETWORK);
    assert.deepEqual(r.missing, ['location', 'serviceability']);
    assert.equal(r.availablePoints, 40, 'footfall 25 + actionability 15');
    assert.equal(r.score, 100, 'full marks on everything that could be judged');
    assert.equal(r.confidence, 0.4, 'and the confidence says only 40% could be judged');
  },

  'confidence separates a strong partial score from a strong complete one': () => {
    const thin = { name: 'A', phone: '9', contactName: 'x', monthlyFootfall: 6000 };
    const full = { name: 'B', phone: '9', contactName: 'x', monthlyFootfall: 6000, lat: 13.09, lng: 80.28 };
    const a = scoreLead(thin, NETWORK);
    const b = scoreLead(full, NETWORK);
    // The thin lead scores a perfect 100 on the two dimensions anybody could
    // judge. That is not the same claim as the complete lead's 85, and the only
    // thing separating them is confidence — 100 at 0.4 is a shrug, not a lead.
    assert.equal(a.score, 100);
    assert.equal(a.confidence, 0.4);
    assert.ok(b.confidence > a.confidence, 'the complete one is worth more trust');
    assert.equal(b.confidence, 1);
  },

  'being far enough not to cannibalise costs something in delivery': () => {
    // The tension the whole model exists to express: distance is good for
    // location and bad for serviceability. A lead cannot max both, and a scorer
    // that let it would just be rewarding distance twice.
    const base = { name: 'X', phone: '9', contactName: 'c', monthlyFootfall: 6000 };
    const r = scoreLead({ ...base, lat: 13.09, lng: 80.28 }, NETWORK);
    const location = r.dimensions.find((d) => d.name === 'location');
    const service = r.dimensions.find((d) => d.name === 'serviceability');
    assert.equal(location.earned, location.of, 'open ground earns location in full');
    assert.ok(service.earned < service.of, 'but the drive to it is not free');
    assert.ok(r.score < 100 && r.score > 50, `expected a real trade-off, got ${r.score}`);

    // And the reverse: a shop close enough to be a cheap stop pays for it in
    // location instead.
    const near = scoreLead({ ...base, lat: 13.008, lng: 80.257 }, NETWORK);
    const nearService = near.dimensions.find((d) => d.name === 'serviceability');
    assert.ok(nearService.earned > service.earned, 'nearer is cheaper to service');
    assert.ok(near.dimensions.find((d) => d.name === 'location').earned < location.earned,
      'and worse placed');
  },

  'a lead next door to our own shop scores worse than one in open ground': () => {
    const base = { name: 'X', phone: '9', contactName: 'c', monthlyFootfall: 6000 };
    const onTop = scoreLead({ ...base, ...ADYAR }, NETWORK);
    const gap = scoreLead({ ...base, lat: 13.09, lng: 80.28 }, NETWORK);
    assert.ok(gap.score > onTop.score, `gap ${gap.score} should beat doorstep ${onTop.score}`);
    assert.equal(gap.dimensions.find((d) => d.name === 'location').earned, 40);
  },

  'a lead nobody can contact is marked unactionable': () => {
    const r = scoreLead({ name: 'Ghost', lat: 13.09, lng: 80.28 }, NETWORK);
    const dim = r.dimensions.find((d) => d.name === 'actionability');
    assert.equal(dim.earned, 0);
    assert.ok(dim.note.includes('cannot be followed up'), dim.note);
  },

  // --- the pitch ----------------------------------------------------------
  'a pitch quotes only shops that actually sold, and names them': () => {
    const p = buildPitch({
      retailerName: 'Anjji Kirana',
      retailerLocation: 'Adyar',
      comparableStores: [
        { name: 'Sold', dailyRevenue: 400 },
        { name: 'Never sold', dailyRevenue: 0 },
      ],
      network: { salesCount: 50, salesWindow: { from: '2026-07-26', to: '2026-08-08' }, topProducts: [] },
      site: evaluateSite({ lat: 13.09, lng: 80.28 }, NETWORK),
      dataQuality: { warnings: [] },
    });
    assert.deepEqual(p.evidence.comparableStores.map((s) => s.name), ['Sold']);
    assert.ok(p.markdown.includes('Sold'), 'the evidence names its source');
    assert.ok(!p.markdown.includes('Never sold'));
    assert.ok(p.markdown.includes('2026-07-26'), 'and the window it came from');
  },

  'a pitch with no sales behind it refuses to quote a revenue figure': () => {
    const p = buildPitch({
      retailerName: 'Anjji Kirana',
      retailerLocation: 'Adyar',
      comparableStores: [],
      network: { salesCount: 0, topProducts: [] },
      site: null,
      dataQuality: { warnings: [] },
    });
    const slide = p.slides.find((s) => s.title.includes('comparable shops'));
    assert.ok(slide.body[0].includes('no revenue figure to quote'), slide.body[0]);
    assert.ok(!p.markdown.includes('Rs.0 a day'), 'never dresses absent data as zero');
  },

  'a data-quality warning reaches the top of the pitch, not a log nobody reads': () => {
    const p = buildPitch({
      retailerName: 'X',
      comparableStores: [{ name: 'Demo', dailyRevenue: 100 }],
      network: { salesCount: 5, topProducts: [] },
      site: null,
      dataQuality: { warnings: ['These figures come from seeded demo stores.'] },
    });
    assert.ok(p.markdown.includes('Before sending this'), 'warning must be visible in the document');
    assert.ok(p.markdown.includes('seeded demo stores'));
  },

  // --- helpers ------------------------------------------------------------
  'median handles even, odd and empty': () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
    assert.equal(median([]), 0);
    assert.equal(median([1, NaN, 3]), 2, 'a missing figure is skipped, not treated as zero');
  },

  // --- a check on the checks ---------------------------------------------
  'these tests would notice the obvious ways to break the maths': () => {
    // Every guard in this repo has been written twice because the first one
    // passed on the very file that was broken. This asserts the fixtures are
    // actually capable of failing.
    const r = DEFAULT_CATCHMENT_M;
    assert.notEqual(catchmentOverlap(r, r, r), catchmentOverlap(r, r, r * 1.5),
      'overlap must vary with distance or every site scores alike');
    assert.notEqual(evaluateSite(ADYAR, NETWORK).verdict, evaluateSite({ lat: 13.09, lng: 80.28 }, NETWORK).verdict,
      'the fixtures must span more than one verdict');
    assert.ok(MAX_SERVICE_RADIUS_M < haversineM(ADYAR, { lat: 13.9, lng: 80.9 }),
      'the far fixture must really be out of range');
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL  ${name}\n        ${err.message}`);
  }
}
console.log(`\n${Object.keys(tests).length - failed} passing${failed ? `, ${failed} failing` : ''}`);
if (failed) process.exitCode = 1;
