// The maths behind every tool in this server.
//
// Nothing here touches Prisma, the network or the clock. That is deliberate:
// these are the rules that decide whether somebody drives across a city to
// pitch a shop, and rules that can only be exercised against a live database
// are rules nobody checks. Everything below runs under plain `node test/`.
//
// Where a number had to be invented it is a named constant with the reasoning
// beside it, not a literal buried in an expression. A growth score that cannot
// be argued with is a growth score that gets ignored the first time it is
// surprising.

// ---------------------------------------------------------------------------
// Assumptions, stated once, in one place.
// ---------------------------------------------------------------------------

// How far a neighbourhood kirana actually draws from. Indian grocery retail is
// a walking trade — this is the distance past which somebody buys their milk
// somewhere else, not the distance they could theoretically travel.
export const DEFAULT_CATCHMENT_M = 800;

// How far a van can sensibly service from the nearest existing stop. Past this
// a shop is its own delivery run rather than an extra stop on one, which is a
// different economic proposition and usually a worse one.
export const MAX_SERVICE_RADIUS_M = 12000;

// In the slice of ground two shops both reach, what share of trade the NEW shop
// takes off the existing one. Half is the honest default: without knowing where
// customers actually live inside that slice, any more precise figure would be
// invented precision. Raise it only with real customer-location data.
export const SHARED_ZONE_CAPTURE = 0.5;

// Above this share of a store's revenue at risk, opening is cannibalisation
// rather than expansion — the network gets another rent bill and roughly the
// same total trade.
export const CANNIBALISATION_THRESHOLD = 0.2;

const EARTH_RADIUS_M = 6371008.8;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const toRad = (deg) => (deg * Math.PI) / 180;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Great-circle distance in metres. */
export function haversineM(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * What fraction of a circle of radius `rA` is also covered by a circle of
 * radius `rB` whose centre is `d` away.
 *
 * This is the exact lens area of two overlapping circles over the area of the
 * first — not a distance heuristic dressed up as one. Two shops 400m apart with
 * 800m catchments genuinely share most of their ground, and the number says so
 * for a reason that can be drawn on paper.
 */
export function catchmentOverlap(rA, rB, d) {
  if (!(rA > 0) || !(rB > 0)) return 0;
  if (d >= rA + rB) return 0;                       // disjoint
  if (d <= Math.abs(rA - rB)) {
    // One sits entirely inside the other. If the new catchment is the smaller,
    // every last metre of it is contested.
    return Math.min(1, (Math.min(rA, rB) ** 2) / rA ** 2);
  }
  const a = rA ** 2 * Math.acos(clamp((d * d + rA * rA - rB * rB) / (2 * d * rA), -1, 1));
  const b = rB ** 2 * Math.acos(clamp((d * d + rB * rB - rA * rA) / (2 * d * rB), -1, 1));
  const tri =
    0.5 * Math.sqrt(Math.max(0, (-d + rA + rB) * (d + rA - rB) * (d - rA + rB) * (d + rA + rB)));
  return clamp((a + b - tri) / (Math.PI * rA ** 2), 0, 1);
}

// ---------------------------------------------------------------------------
// Is this location a gap, or are we buying our own trade back?
// ---------------------------------------------------------------------------

/**
 * @param site      {lat, lng}
 * @param stores    [{id, name, lat, lng, dailyRevenue}] — geocoded stores only
 * @param catchmentM radius to assume for every shop, ours and the new one
 */
export function evaluateSite(site, stores, catchmentM = DEFAULT_CATCHMENT_M) {
  const withDistance = stores
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .map((s) => {
      const distanceM = haversineM(site, s);
      const overlap = catchmentOverlap(catchmentM, catchmentM, distanceM);
      // Revenue the new shop would take off this one rather than add to the
      // network. Zero when the catchments never meet.
      const revenueAtRiskPerDay = (s.dailyRevenue || 0) * overlap * SHARED_ZONE_CAPTURE;
      return { ...s, distanceM: Math.round(distanceM), overlap, revenueAtRiskPerDay };
    })
    .sort((a, b) => a.distanceM - b.distanceM);

  const affected = withDistance.filter((s) => s.overlap > 0);
  const revenueAtRiskPerDay = affected.reduce((t, s) => t + s.revenueAtRiskPerDay, 0);
  const affectedRevenuePerDay = affected.reduce((t, s) => t + (s.dailyRevenue || 0), 0);
  // Share of the AFFECTED stores' trade, not the whole network's. A network of
  // eighty shops would drown any single overlap in the denominator and report
  // "1% at risk" for a shop opening across the road from another.
  const shareAtRisk = affectedRevenuePerDay > 0 ? revenueAtRiskPerDay / affectedRevenuePerDay : 0;

  const nearest = withDistance[0] || null;
  const serviceable = nearest ? nearest.distanceM <= MAX_SERVICE_RADIUS_M : false;

  const maxOverlap = affected.reduce((m, s) => Math.max(m, s.overlap), 0);

  let verdict;
  let reason;
  if (affected.length === 0) {
    verdict = 'GAP';
    reason = nearest
      ? `No existing store's catchment reaches here; the nearest is ${nearest.name} at ${fmtKm(nearest.distanceM)}.`
      : 'No geocoded store is anywhere near here.';
  } else if (affectedRevenuePerDay === 0) {
    // Overlapping shops that have never recorded a sale. The revenue maths
    // divides to zero here and reads as "nothing at risk", which is how a site
    // on another shop's doorstep came back as INFILL — mostly new ground. It is
    // the same ground. Fall back to the geometry and say the money is unknown,
    // because absent revenue is not the same fact as no revenue at risk.
    verdict = maxOverlap >= 0.5 ? 'CANNIBALISATION_RISK' : 'INFILL';
    reason =
      `Shares ${pct(maxOverlap)} of its catchment with ${listNames(affected)}, ` +
      `but ${affected.length > 1 ? 'those shops have' : 'that shop has'} no recorded sales — ` +
      'so how much trade would move cannot be estimated, only the overlap.';
  } else if (shareAtRisk >= CANNIBALISATION_THRESHOLD) {
    verdict = 'CANNIBALISATION_RISK';
    reason = `Would take an estimated ${pct(shareAtRisk)} of the trade of ${listNames(affected)} rather than adding new trade.`;
  } else {
    verdict = 'INFILL';
    reason = `Overlaps ${listNames(affected)} but only an estimated ${pct(shareAtRisk)} of their trade — mostly new ground.`;
  }

  if (!serviceable && nearest) {
    reason += ` Note it sits ${fmtKm(nearest.distanceM)} from the nearest store, beyond the ${fmtKm(MAX_SERVICE_RADIUS_M)} a delivery run stretches to.`;
  }

  return {
    verdict,
    reason,
    serviceable,
    revenueAtRiskPerDay: round2(revenueAtRiskPerDay),
    shareAtRisk: round2(shareAtRisk),
    // Explicitly distinct from `shareAtRisk: 0`. Null means "we could not
    // price it", and the caller must not render that as a safe zero.
    revenueAtRiskKnown: affectedRevenuePerDay > 0 || affected.length === 0,
    maxCatchmentOverlap: round2(maxOverlap),
    nearestStore: nearest && { name: nearest.name, distanceM: nearest.distanceM },
    affectedStores: affected.map((s) => ({
      name: s.name,
      distanceM: s.distanceM,
      catchmentOverlap: round2(s.overlap),
      revenueAtRiskPerDay: round2(s.revenueAtRiskPerDay),
    })),
  };
}

// ---------------------------------------------------------------------------
// Where should we be that we are not?
// ---------------------------------------------------------------------------

/**
 * Score one candidate point for how worth opening it is.
 *
 * Two factors, both 0..1, multiplied — so a location must be BOTH uncovered and
 * surrounded by shops that actually sell. Uncovered ground next to three
 * failing shops is not an opportunity, it is the same failure with a new lease.
 *
 * `networkMedianDailyRevenue` is the yardstick: a neighbour is "strong" only
 * relative to the rest of the network, so the score does not drift when the
 * whole business has a good month.
 */
export function scoreCandidate(point, stores, opts = {}) {
  const {
    catchmentM = DEFAULT_CATCHMENT_M,
    maxServiceRadiusM = MAX_SERVICE_RADIUS_M,
    networkMedianDailyRevenue = 0,
    neighbourCount = 3,
  } = opts;

  const ranked = stores
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .map((s) => ({ ...s, distanceM: haversineM(point, s) }))
    .sort((a, b) => a.distanceM - b.distanceM);

  if (ranked.length === 0) {
    return { score: 0, serviceable: false, coverageGap: 0, neighbourStrength: 0, reason: 'No geocoded stores to compare against.' };
  }

  const nearest = ranked[0];

  // Too far to service is not an opportunity at any demand level — it is a
  // second depot. Reported as zero with the reason said out loud rather than
  // quietly ranked last.
  if (nearest.distanceM > maxServiceRadiusM) {
    return {
      score: 0,
      serviceable: false,
      coverageGap: 1,
      neighbourStrength: 0,
      distanceToNearestM: Math.round(nearest.distanceM),
      reason: `${fmtKm(nearest.distanceM)} from the nearest store — outside the ${fmtKm(maxServiceRadiusM)} service range.`,
    };
  }

  // 0 when a store sits on top of the point, 1 once it is a full catchment
  // diameter clear of every existing shop.
  const coverageGap = clamp(nearest.distanceM / (2 * catchmentM), 0, 1);

  const neighbours = ranked.slice(0, neighbourCount);
  const neighbourMean =
    neighbours.reduce((t, s) => t + (s.dailyRevenue || 0), 0) / (neighbours.length || 1);
  // Capped at 1.5× the median: a single exceptional shop should lift a nearby
  // candidate, not let one outlier dominate the whole map.
  const neighbourStrength =
    networkMedianDailyRevenue > 0 ? clamp(neighbourMean / networkMedianDailyRevenue, 0, 1.5) / 1.5 : 0;

  const score = Math.round(100 * coverageGap * neighbourStrength);
  return {
    score,
    serviceable: true,
    coverageGap: round2(coverageGap),
    neighbourStrength: round2(neighbourStrength),
    distanceToNearestM: Math.round(nearest.distanceM),
    nearestStore: nearest.name,
    reason:
      `${fmtKm(nearest.distanceM)} clear of ${nearest.name}; ` +
      `neighbouring shops take Rs.${Math.round(neighbourMean)}/day against a network median of Rs.${Math.round(networkMedianDailyRevenue)}.`,
  };
}

/**
 * Lay a grid over a bounding box and score every cell.
 *
 * A grid rather than anything cleverer because the output is a shortlist a
 * human drives to, and 500m cells over a metro is already more candidates than
 * anybody visits in a month.
 */
export function gridCandidates(bbox, stepM = 750) {
  const { minLat, maxLat, minLng, maxLng } = bbox;
  // Metres per degree of longitude shrinks with latitude; at Chennai's 13°N a
  // degree of longitude is ~7% shorter than at the equator. Ignoring this
  // stretches the grid sideways and biases every candidate east or west.
  const midLat = (minLat + maxLat) / 2;
  const latStep = (stepM / EARTH_RADIUS_M) * (180 / Math.PI);
  const lngStep = latStep / Math.max(0.01, Math.cos(toRad(midLat)));

  const out = [];
  for (let lat = minLat; lat <= maxLat; lat += latStep) {
    for (let lng = minLng; lng <= maxLng; lng += lngStep) {
      out.push({ lat: round6(lat), lng: round6(lng) });
    }
  }
  return out;
}

/** Keep the best cell in each neighbourhood so a shortlist isn't twenty
 *  variations on one street corner. */
export function thinCandidates(scored, minSeparationM = 1500) {
  const kept = [];
  for (const c of [...scored].sort((a, b) => b.score - a.score)) {
    if (kept.every((k) => haversineM(k, c) >= minSeparationM)) kept.push(c);
  }
  return kept;
}

// ---------------------------------------------------------------------------
// What is a lead worth?
// ---------------------------------------------------------------------------

// Absent information is not bad information. A lead with no coordinates cannot
// be scored on location, and scoring it zero there would rank it below a lead
// we know to be badly placed — the opposite of the truth. Each dimension
// reports whether it could be judged at all, and the total is expressed out of
// the points that were actually available.
const LEAD_WEIGHTS = { location: 40, serviceability: 20, footfall: 25, actionability: 15 };

// A shop nobody has counted footfall for is the norm, not an outlier. This is
// the figure a decent neighbourhood kirana does — used to normalise, so 3000
// scores mid rather than "low because it isn't 50,000".
const TYPICAL_MONTHLY_FOOTFALL = 3000;

export function scoreLead(lead, stores, opts = {}) {
  const { catchmentM = DEFAULT_CATCHMENT_M, maxServiceRadiusM = MAX_SERVICE_RADIUS_M } = opts;
  const dimensions = [];
  const hasPin = Number.isFinite(lead.lat) && Number.isFinite(lead.lng);
  const geocoded = stores.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));

  let site = null;
  if (hasPin && geocoded.length > 0) {
    site = evaluateSite({ lat: lead.lat, lng: lead.lng }, geocoded, catchmentM);

    // A gap is worth the most, an infill is worth having, cannibalisation is
    // worth avoiding. Scaled by how much trade is actually at risk rather than
    // by the label alone.
    const locationFrac =
      site.verdict === 'GAP' ? 1 : clamp(1 - site.shareAtRisk / CANNIBALISATION_THRESHOLD, 0, 1) * 0.8;
    dimensions.push({
      name: 'location',
      available: true,
      earned: Math.round(LEAD_WEIGHTS.location * locationFrac),
      of: LEAD_WEIGHTS.location,
      note: site.reason,
    });

    const d = site.nearestStore?.distanceM ?? Infinity;
    const serviceFrac = clamp(1 - d / maxServiceRadiusM, 0, 1);
    dimensions.push({
      name: 'serviceability',
      available: true,
      earned: Math.round(LEAD_WEIGHTS.serviceability * serviceFrac),
      of: LEAD_WEIGHTS.serviceability,
      note: Number.isFinite(d)
        ? `${fmtKm(d)} from ${site.nearestStore.name} — ${d <= maxServiceRadiusM ? 'an extra stop on an existing run' : 'its own delivery run'}.`
        : 'No store to route a delivery from.',
    });
  } else {
    const why = !hasPin
      ? 'Lead has no coordinates, so it cannot be placed against the network.'
      : 'No geocoded stores to compare against.';
    dimensions.push({ name: 'location', available: false, earned: 0, of: LEAD_WEIGHTS.location, note: why });
    dimensions.push({ name: 'serviceability', available: false, earned: 0, of: LEAD_WEIGHTS.serviceability, note: why });
  }

  if (Number.isFinite(lead.monthlyFootfall) && lead.monthlyFootfall > 0) {
    const frac = clamp(lead.monthlyFootfall / (TYPICAL_MONTHLY_FOOTFALL * 2), 0, 1);
    dimensions.push({
      name: 'footfall',
      available: true,
      earned: Math.round(LEAD_WEIGHTS.footfall * frac),
      of: LEAD_WEIGHTS.footfall,
      note: `${lead.monthlyFootfall.toLocaleString('en-IN')} a month, self-reported, against a typical ${TYPICAL_MONTHLY_FOOTFALL.toLocaleString('en-IN')}.`,
    });
  } else {
    dimensions.push({
      name: 'footfall',
      available: false,
      earned: 0,
      of: LEAD_WEIGHTS.footfall,
      note: 'Nobody has recorded footfall for this shop.',
    });
  }

  // Not a quality signal — a reachability one. A promising shop with no phone
  // number cannot be pursued this week, and that is worth knowing before
  // somebody plans a route around it.
  const reachable = [lead.phone, lead.email, lead.contactName].filter(Boolean).length;
  dimensions.push({
    name: 'actionability',
    available: true,
    earned: Math.round(LEAD_WEIGHTS.actionability * clamp(reachable / 2, 0, 1)),
    of: LEAD_WEIGHTS.actionability,
    note: reachable === 0 ? 'No contact details — cannot be followed up as recorded.' : `${reachable} way(s) to make contact.`,
  });

  const availablePoints = dimensions.filter((d) => d.available).reduce((t, d) => t + d.of, 0);
  const earned = dimensions.reduce((t, d) => t + d.earned, 0);
  // Out of what could be judged, then stated as a percentage so two leads with
  // different missing fields can still be compared — with the confidence
  // alongside so a 90 from one dimension is never mistaken for a 90 from four.
  const score = availablePoints > 0 ? Math.round((earned / availablePoints) * 100) : 0;

  return {
    score,
    confidence: round2(availablePoints / 100),
    earned,
    availablePoints,
    dimensions,
    site,
    missing: dimensions.filter((d) => !d.available).map((d) => d.name),
  };
}

// ---------------------------------------------------------------------------
// The pitch
// ---------------------------------------------------------------------------

/**
 * Build a pitch from what the network can actually evidence.
 *
 * Every number here is traceable to a row somebody entered. `evidence` names
 * the shops and the date range it came from, because a pitch that cites
 * "average store revenue" without saying which stores or when is a pitch the
 * retailer is right to distrust — and because the answer today is seed data,
 * which the reader has to be able to see.
 */
export function buildPitch({ retailerName, retailerLocation, comparableStores, network, site, dataQuality }) {
  const comparables = comparableStores.filter((s) => (s.dailyRevenue || 0) > 0);
  const meanDaily = comparables.length
    ? comparables.reduce((t, s) => t + s.dailyRevenue, 0) / comparables.length
    : 0;
  const monthly = meanDaily * 30;

  const slides = [
    {
      title: `Grillexa × ${retailerName}`,
      body: [
        `A proposal to stock Grillexa products at ${retailerName}${retailerLocation ? `, ${retailerLocation}` : ''}.`,
        'Know Your Food Better.',
      ],
    },
    {
      title: 'You pay for what sells, not for what we deliver',
      body: [
        'Stock arrives on consignment. It stays ours until a customer buys it.',
        'You settle only on what sold. Anything that does not sell goes back to us at no cost to you.',
        'No upfront purchase, no money tied up in shelf stock, no dead inventory to discount.',
      ],
    },
    {
      title: 'What comparable shops are taking',
      body:
        comparables.length > 0
          ? [
              `Rs.${Math.round(meanDaily).toLocaleString('en-IN')} a day on average across ${comparables.length} shop(s) in the network.`,
              `That is about Rs.${Math.round(monthly).toLocaleString('en-IN')} a month of extra counter turnover.`,
              ...(network.topProducts?.length
                ? [`Best movers: ${network.topProducts.map((p) => `${p.name} (${p.units} units)`).join(', ')}.`]
                : []),
            ]
          : ['No comparable shop has recorded sales yet, so there is no revenue figure to quote here honestly.'],
    },
    {
      title: 'Your catchment',
      body: site
        ? [
            site.reason,
            site.verdict === 'GAP'
              ? 'No Grillexa shelf currently serves this catchment — the trade here is entirely new.'
              : 'There is some overlap with shops we already supply, noted above.',
          ]
        : ['No coordinates were supplied for this shop, so its catchment has not been assessed.'],
    },
    {
      title: 'How it works',
      body: [
        'We deliver and restock on a fixed run. You do nothing but sell.',
        'Settlement on an agreed cycle against what actually sold, itemised.',
        'Returns collected on the same run — damaged or unsold, we take it back.',
      ],
    },
    {
      title: 'What we are asking',
      body: [
        `A trial: one shelf at ${retailerName}, one delivery cycle, no commitment past it.`,
        'If it does not sell, we collect the stock and you are out nothing.',
      ],
    },
  ];

  return {
    slides,
    evidence: {
      comparableStores: comparables.map((s) => ({ name: s.name, dailyRevenue: round2(s.dailyRevenue) })),
      salesWindow: network.salesWindow ?? null,
      salesCount: network.salesCount ?? 0,
    },
    dataQuality,
    markdown: slidesToMarkdown(retailerName, slides, comparables, network, dataQuality),
  };
}

function slidesToMarkdown(retailerName, slides, comparables, network, dataQuality) {
  const parts = slides.map((s, i) => `## ${i + 1}. ${s.title}\n\n${s.body.map((b) => `- ${b}`).join('\n')}`);
  const ev = [
    '---',
    '',
    '### Where these numbers come from',
    '',
    comparables.length
      ? `Sales recorded against ${comparables.map((s) => s.name).join(', ')}` +
        (network.salesWindow ? ` between ${network.salesWindow.from} and ${network.salesWindow.to}` : '') +
        ` (${network.salesCount} sales).`
      : 'No sales records were available.',
  ];
  if (dataQuality?.warnings?.length) {
    ev.push('', ...dataQuality.warnings.map((w) => `> **Before sending this:** ${w}`));
  }
  return [`# Grillexa × ${retailerName}`, '', ...parts, '', ...ev].join('\n');
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

export function median(numbers) {
  const xs = numbers.filter(Number.isFinite).sort((a, b) => a - b);
  if (xs.length === 0) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

const round2 = (n) => Math.round(n * 100) / 100;
const round6 = (n) => Math.round(n * 1e6) / 1e6;
const pct = (frac) => `${Math.round(frac * 100)}%`;
const fmtKm = (m) => (m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`);
const listNames = (rows) => rows.map((r) => r.name).join(', ');

export { clamp, fmtKm };
