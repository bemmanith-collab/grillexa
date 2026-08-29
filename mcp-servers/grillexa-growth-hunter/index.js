#!/usr/bin/env node
// Grillexa Growth Hunter — an MCP server that looks for revenue the network is
// not yet taking.
//
// Four questions it exists to answer:
//   - is this spot a gap, or would we be buying our own trade back?
//   - where in a city are we not, that we should be?
//   - what can we honestly tell a retailer to get them to stock us?
//   - which of the leads sitting in the table is worth the drive?
//
// Two more tools exist because the first two are useless without them: a shop
// with no coordinates cannot be placed on a map, and a lead table with no rows
// cannot be ranked.
//
// Every tool returns a `dataQuality` block alongside its answer. That is not
// decoration. This network currently has one geocoded store and a fortnight of
// sales, and a confident number drawn from that would be worse than no number.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import {
  evaluateSite,
  scoreCandidate,
  scoreLead,
  gridCandidates,
  thinCandidates,
  buildPitch,
  median,
  haversineM,
  DEFAULT_CATCHMENT_M,
} from './src/analysis.js';
import {
  db,
  disconnect,
  loadStores,
  loadNetwork,
  assessData,
  cityBounds,
  geocodeAddress,
} from './src/queries.js';

const server = new McpServer({ name: 'grillexa-growth-hunter', version: '1.0.0' });

// Every tool answers in the same shape: a sentence a person can read, then the
// structured payload underneath it. The readable half matters — a wall of JSON
// gets summarised by whoever is reading, and the caveats are what gets dropped.
function reply(summary, payload) {
  return {
    content: [
      { type: 'text', text: summary },
      { type: 'text', text: JSON.stringify(payload, null, 2) },
    ],
  };
}

function warningsLine(dataQuality) {
  return dataQuality.warnings.length
    ? `\n\nWorth knowing:\n${dataQuality.warnings.map((w) => `  - ${w}`).join('\n')}`
    : '';
}

const rs = (n) => `Rs.${Math.round(n).toLocaleString('en-IN')}`;

// ---------------------------------------------------------------------------
// 1. Is this location a gap, or are we competing with ourselves?
// ---------------------------------------------------------------------------
server.registerTool(
  'evaluate_neighborhood_density',
  {
    title: 'Evaluate a location',
    description:
      'Given a point, say whether opening there fills a gap or cannibalises stores we already supply. ' +
      'Uses exact catchment-circle overlap against every geocoded store, and estimates the daily revenue that would move rather than grow.',
    inputSchema: {
      lat: z.number().min(-90).max(90).describe('Latitude of the candidate site'),
      lng: z.number().min(-180).max(180).describe('Longitude of the candidate site'),
      radius: z
        .number()
        .positive()
        .optional()
        .describe(`Catchment radius in metres to assume for every shop (default ${DEFAULT_CATCHMENT_M}, a walking trade)`),
    },
  },
  async ({ lat, lng, radius }) => {
    const [stores, network] = await Promise.all([loadStores(), loadNetwork()]);
    const dataQuality = assessData(stores, network);
    const catchmentM = radius || DEFAULT_CATCHMENT_M;
    const site = evaluateSite({ lat, lng }, stores, catchmentM);

    const verdictLine = {
      GAP: 'GAP — nothing we supply reaches this catchment.',
      INFILL: 'INFILL — some overlap, but mostly new ground.',
      CANNIBALISATION_RISK: 'CANNIBALISATION RISK — this would move trade, not add it.',
    }[site.verdict];

    // "Rs.0/day at risk" and "we cannot price the risk" are different answers,
    // and printing the first for the second is how a doorstep clone reads as
    // safe. Say which one this is.
    const money = site.revenueAtRiskKnown
      ? `Estimated revenue moved rather than added: ${rs(site.revenueAtRiskPerDay)}/day.`
      : `Revenue at risk cannot be estimated — the overlapping shop(s) have no recorded sales. Catchment overlap is ${Math.round(site.maxCatchmentOverlap * 100)}%.`;

    const summary = `${verdictLine}\n${site.reason}\n${money}` + warningsLine(dataQuality);

    return reply(summary, { site, catchmentM, dataQuality });
  }
);

// ---------------------------------------------------------------------------
// 2. Where in this city should we be, that we are not?
// ---------------------------------------------------------------------------
server.registerTool(
  'find_gap_opportunities',
  {
    title: 'Find underserved areas',
    description:
      'Grid a city and rank the areas we do not cover. Scores each candidate on how clear it is of our existing catchments AND how well the nearest shops trade — ' +
      'uncovered ground next to failing shops is not an opportunity. Candidates outside delivery range score zero.',
    inputSchema: {
      city: z.string().min(2).describe('City to search, e.g. "Chennai"'),
      minDemandScore: z.number().min(0).max(100).optional().describe('Only return candidates scoring at least this (default 30)'),
      limit: z.number().int().positive().max(50).optional().describe('How many to return (default 10)'),
      stepM: z.number().positive().optional().describe('Grid spacing in metres (default 750)'),
    },
  },
  async ({ city, minDemandScore = 30, limit = 10, stepM = 750 }) => {
    const [stores, network] = await Promise.all([loadStores(), loadNetwork()]);
    const dataQuality = assessData(stores, network);
    const geocoded = stores.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));

    if (geocoded.length === 0) {
      return reply(
        'Cannot search: no store has coordinates, so there is nothing to measure a gap against. Run backfill_store_coordinates first.',
        { candidates: [], dataQuality }
      );
    }

    const bounds = await cityBounds(city);
    if (!bounds) {
      return reply(`Could not find a boundary for "${city}".`, { candidates: [], dataQuality });
    }

    const networkMedianDailyRevenue = median(geocoded.map((s) => s.dailyRevenue).filter((n) => n > 0));
    const all = gridCandidates(bounds, stepM).map((point) => ({
      ...point,
      ...scoreCandidate(point, geocoded, { networkMedianDailyRevenue }),
    }));

    // Ground we cannot deliver to is not an opportunity at any threshold, so it
    // never enters the shortlist — asking for minDemandScore 0 should not fill
    // the answer with the far edge of the city. Counted, not silently dropped.
    const outOfServiceRange = all.filter((c) => !c.serviceable).length;
    const candidates = thinCandidates(all.filter((c) => c.serviceable && c.score >= minDemandScore)).slice(0, limit);

    // The honest caveat: with a thin network the strength half of the score is
    // barely informed, and a reader deserves to be told that here rather than
    // discovering it after a site visit.
    if (geocoded.length < 3) {
      dataQuality.warnings.push(
        `Candidate scores blend "how uncovered" with "how well do neighbours trade", but with ${geocoded.length} geocoded store(s) the second half is barely evidenced.`
      );
    }
    if (networkMedianDailyRevenue === 0) {
      dataQuality.warnings.push('No geocoded store has recorded sales, so every candidate scores zero on neighbour strength.');
    }

    const summary = candidates.length
      ? `${candidates.length} area(s) in ${bounds.label.split(',')[0]} scoring at least ${minDemandScore}:\n` +
        candidates.map((c, i) => `  ${i + 1}. ${c.lat}, ${c.lng} — score ${c.score}. ${c.reason}`).join('\n') +
        warningsLine(dataQuality)
      : `No area in ${city} within delivery range scored ${minDemandScore} or above ` +
        `(${all.length} cells checked, ${outOfServiceRange} of them outside the service radius).` +
        warningsLine(dataQuality);

    return reply(summary, {
      city: bounds.label,
      bounds,
      candidates,
      gridCells: all.length,
      outOfServiceRange,
      networkMedianDailyRevenue,
      dataQuality,
    });
  }
);

// ---------------------------------------------------------------------------
// 3. What can we honestly tell a retailer?
// ---------------------------------------------------------------------------
server.registerTool(
  'generate_b2b_pitch_deck',
  {
    title: 'Generate a retailer pitch',
    description:
      'Build a pitch for a specific retailer from real network numbers — what comparable shops take per day, the best-moving products, and the catchment around them. ' +
      'Quotes only shops that actually recorded sales, names them, and stamps the pitch with any reason to distrust the figures.',
    inputSchema: {
      retailerName: z.string().min(1).describe('The shop being pitched'),
      retailerLocation: z.string().optional().describe('Where it is — an address or area name, geocoded to assess the catchment'),
      nearbyStores: z
        .array(z.string())
        .optional()
        .describe('Names of stores to quote as comparables. Defaults to every store with recorded sales.'),
    },
  },
  async ({ retailerName, retailerLocation, nearbyStores }) => {
    const [stores, network] = await Promise.all([loadStores(), loadNetwork()]);
    const dataQuality = assessData(stores, network);

    let comparableStores = stores.filter((s) => s.salesCount > 0);
    if (nearbyStores?.length) {
      const wanted = new Set(nearbyStores.map((n) => n.toLowerCase().trim()));
      const picked = stores.filter((s) => wanted.has(s.name.toLowerCase().trim()));
      const missing = nearbyStores.filter((n) => !stores.some((s) => s.name.toLowerCase().trim() === n.toLowerCase().trim()));
      if (missing.length) dataQuality.warnings.push(`No store named ${missing.join(', ')} — those were left out of the comparables.`);
      if (picked.length) comparableStores = picked;
    }

    // A comparable that traded for two days is not a comparable. Say so in the
    // document rather than letting a run rate rest on it.
    const thin = comparableStores.filter((s) => s.salesCount > 0 && s.tradingDays < 5);
    if (thin.length) {
      dataQuality.warnings.push(`${thin.map((s) => `${s.name} (${s.tradingDays} trading days)`).join(', ')} — too few days to read as a daily average.`);
    }

    let site = null;
    if (retailerLocation) {
      const geocoded = stores.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
      const anchor = geocoded[0] || null;
      const hit = await geocodeAddress(retailerLocation, anchor);
      if (hit && geocoded.length) site = evaluateSite(hit, geocoded);
      else if (!hit) dataQuality.warnings.push(`Could not place "${retailerLocation}" on a map, so the catchment slide is unassessed.`);
    }

    const pitch = buildPitch({ retailerName, retailerLocation, comparableStores, network, site, dataQuality });

    return reply(
      `Pitch for ${retailerName}, built from ${pitch.evidence.comparableStores.length} comparable shop(s).` +
        warningsLine(dataQuality) +
        `\n\n${pitch.markdown}`,
      pitch
    );
  }
);

// ---------------------------------------------------------------------------
// 4. Which leads are worth the drive?
// ---------------------------------------------------------------------------
server.registerTool(
  'score_retailer_lead',
  {
    title: 'Score a retailer lead',
    description:
      'Rank a lead on location (is it a gap?), serviceability (can a van reach it cheaply?), footfall and whether anyone can actually be contacted. ' +
      'Missing information lowers confidence, never the score — a lead nobody has visited is unknown, not bad. Omit leadId to score the whole pipeline.',
    inputSchema: {
      leadId: z.number().int().positive().optional().describe('Lead to score. Omit to score and rank every open lead.'),
      persist: z.boolean().optional().describe('Write the score back to the lead row (default true)'),
    },
  },
  async ({ leadId, persist = true }) => {
    const p = db();
    const [stores, network] = await Promise.all([loadStores(), loadNetwork()]);
    const dataQuality = assessData(stores, network);

    const leads = leadId
      ? await p.retailerLead.findMany({ where: { id: leadId } })
      : await p.retailerLead.findMany({ where: { status: { notIn: ['WON', 'LOST'] } } });

    if (leads.length === 0) {
      return reply(
        leadId ? `No lead with id ${leadId}.` : 'No open leads to score. Add one with add_retailer_lead.',
        { scored: [], dataQuality }
      );
    }

    const scored = leads
      .map((lead) => ({ lead, result: scoreLead(lead, stores) }))
      .sort((a, b) => b.result.score - a.result.score || b.result.confidence - a.result.confidence);

    if (persist) {
      const now = new Date();
      await Promise.all(
        scored.map(({ lead, result }) =>
          p.retailerLead.update({ where: { id: lead.id }, data: { score: result.score, scoredAt: now } })
        )
      );
    }

    const summary =
      scored
        .map(({ lead, result }, i) => {
          const conf = `confidence ${Math.round(result.confidence * 100)}%`;
          const gaps = result.missing.length ? ` (unknown: ${result.missing.join(', ')})` : '';
          return `  ${i + 1}. #${lead.id} ${lead.name} — ${result.score}/100, ${conf}${gaps}`;
        })
        .join('\n') + warningsLine(dataQuality);

    return reply(
      `${scored.length} lead(s), best first:\n${summary}`,
      {
        scored: scored.map(({ lead, result }) => ({
          id: lead.id,
          name: lead.name,
          status: lead.status,
          score: result.score,
          confidence: result.confidence,
          dimensions: result.dimensions,
          missing: result.missing,
          site: result.site,
        })),
        dataQuality,
      }
    );
  }
);

// ---------------------------------------------------------------------------
// 5. Getting leads in, so there is something to rank
// ---------------------------------------------------------------------------
server.registerTool(
  'add_retailer_lead',
  {
    title: 'Add a retailer lead',
    description:
      'Record a shop worth approaching. Only a name is required — a name and a phone number scribbled at a market is a real lead. ' +
      'If an address is given but no coordinates, it is geocoded so the lead can be scored on location.',
    inputSchema: {
      name: z.string().min(1),
      source: z.enum(['WALK_IN', 'REFERRAL', 'FIELD_VISIT', 'INBOUND_CALL', 'OTHER']).optional(),
      contactName: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      monthlyFootfall: z.number().int().positive().optional(),
      shelfSpaceCm: z.number().int().positive().optional(),
      notes: z.string().optional(),
    },
  },
  async (args) => {
    const p = db();
    const data = { ...args };

    if (!Number.isFinite(data.lat) && data.address) {
      const stores = await loadStores();
      const anchor = stores.find((s) => Number.isFinite(s.lat)) || null;
      const hit = await geocodeAddress(data.address, anchor);
      if (hit) {
        data.lat = hit.lat;
        data.lng = hit.lng;
      }
    }

    const lead = await p.retailerLead.create({ data });
    const stores = await loadStores();
    const result = scoreLead(lead, stores);
    await p.retailerLead.update({ where: { id: lead.id }, data: { score: result.score, scoredAt: new Date() } });

    return reply(
      `Lead #${lead.id} ${lead.name} recorded` +
        (Number.isFinite(lead.lat) ? ` and placed at ${lead.lat.toFixed(4)}, ${lead.lng.toFixed(4)}` : ' without coordinates') +
        `. Scores ${result.score}/100 at ${Math.round(result.confidence * 100)}% confidence.`,
      { lead, score: result }
    );
  }
);

// ---------------------------------------------------------------------------
// 6. Putting the network on the map at all
// ---------------------------------------------------------------------------
server.registerTool(
  'backfill_store_coordinates',
  {
    title: 'Geocode stores that have no pin',
    description:
      'Look up coordinates from the address for every store that has none, using the same free geocoder the app uses (one request per second). ' +
      'Defaults to a dry run: nothing is written until you pass apply=true, because a wrong pin silently poisons every distance afterwards.',
    inputSchema: {
      apply: z.boolean().optional().describe('Write the coordinates. Default false — preview only.'),
      storeIds: z.array(z.number().int().positive()).optional().describe('Limit to these stores'),
    },
  },
  async ({ apply = false, storeIds }) => {
    const p = db();
    const stores = await loadStores();
    let pending = stores.filter((s) => !Number.isFinite(s.lat) && s.address?.trim());
    if (storeIds?.length) pending = pending.filter((s) => storeIds.includes(s.id));

    const noAddress = stores.filter((s) => !Number.isFinite(s.lat) && !s.address?.trim());
    if (pending.length === 0) {
      return reply(
        `Nothing to geocode. ${stores.filter((s) => Number.isFinite(s.lat)).length} of ${stores.length} stores already have pins` +
          (noAddress.length ? `; ${noAddress.length} have neither pin nor address (${noAddress.map((s) => s.name).join(', ')}) and need one typed in.` : '.'),
        { resolved: [], unresolved: noAddress.map((s) => ({ id: s.id, name: s.name, reason: 'no address to search' })) }
      );
    }

    const anchor = stores.find((s) => Number.isFinite(s.lat)) || null;
    const resolved = [];
    const unresolved = [];
    for (const s of pending) {
      try {
        const hit = await geocodeAddress(s.address, anchor);
        if (hit) resolved.push({ id: s.id, name: s.name, address: s.address, lat: hit.lat, lng: hit.lng, matched: hit.label });
        else unresolved.push({ id: s.id, name: s.name, address: s.address, reason: 'no match' });
      } catch (err) {
        unresolved.push({ id: s.id, name: s.name, address: s.address, reason: err.message });
      }
    }

    if (apply) {
      await Promise.all(
        // accuracyM stays null: a geocoded address is not a sensor reading, and
        // writing a fake radius would make a rooftop guess look like a GPS fix.
        resolved.map((r) => p.store.update({ where: { id: r.id }, data: { lat: r.lat, lng: r.lng, accuracyM: null } }))
      );
    }

    const lines = resolved.map((r) => `  ${r.name} (${r.address}) -> ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}  [${r.matched.split(',').slice(0, 3).join(',')}]`);
    return reply(
      `${apply ? 'Wrote' : 'Would write'} ${resolved.length} pin(s):\n${lines.join('\n')}` +
        (unresolved.length ? `\n\nUnresolved:\n${unresolved.map((u) => `  ${u.name} — ${u.reason}`).join('\n')}` : '') +
        (apply ? '' : '\n\nCheck these against what you know, then re-run with apply=true.'),
      { applied: apply, resolved, unresolved }
    );
  }
);

// ---------------------------------------------------------------------------
// Resources — the standing picture, readable without calling a tool
// ---------------------------------------------------------------------------
server.registerResource(
  'network-overview',
  'grillexa://network/overview',
  { title: 'Store network overview', description: 'Every store with its trade, coverage and pin status', mimeType: 'application/json' },
  async (uri) => {
    const [stores, network] = await Promise.all([loadStores(), loadNetwork()]);
    const dataQuality = assessData(stores, network);
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({ network, stores, dataQuality }, null, 2),
        },
      ],
    };
  }
);

server.registerResource(
  'geocoded-stores',
  'grillexa://stores/geocoded',
  { title: 'Stores that can be placed on a map', description: 'The subset every location answer is actually drawn from', mimeType: 'application/json' },
  async (uri) => {
    const stores = await loadStores();
    const geocoded = stores.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
    // The pairwise distances are the whole reason this resource exists: they
    // show at a glance whether the network is a cluster or a spread.
    const pairs = [];
    for (let i = 0; i < geocoded.length; i += 1) {
      for (let j = i + 1; j < geocoded.length; j += 1) {
        pairs.push({ a: geocoded[i].name, b: geocoded[j].name, distanceM: Math.round(haversineM(geocoded[i], geocoded[j])) });
      }
    }
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            { geocoded, missingPins: stores.filter((s) => !Number.isFinite(s.lat)).map((s) => ({ id: s.id, name: s.name, address: s.address })), pairwiseDistances: pairs },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.registerResource(
  'lead-pipeline',
  'grillexa://leads/pipeline',
  { title: 'Retailer lead pipeline', description: 'Leads with their last score, best first', mimeType: 'application/json' },
  async (uri) => {
    const leads = await db().retailerLead.findMany({ orderBy: [{ score: 'desc' }, { createdAt: 'desc' }] });
    return {
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ count: leads.length, leads }, null, 2) }],
    };
  }
);

server.registerResource(
  'data-quality',
  'grillexa://data-quality',
  { title: 'What these answers are standing on', description: 'Coverage and evidence behind every number this server returns', mimeType: 'application/json' },
  async (uri) => {
    const [stores, network] = await Promise.all([loadStores(), loadNetwork()]);
    return {
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(assessData(stores, network), null, 2) }],
    };
  }
);

// ---------------------------------------------------------------------------

async function main() {
  await server.connect(new StdioServerTransport());
  // stdout is the protocol channel — anything written there that is not a
  // JSON-RPC frame corrupts the stream and the client drops the connection.
  console.error('grillexa-growth-hunter ready on stdio');
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await disconnect();
    process.exit(0);
  });
}

main().catch(async (err) => {
  console.error('grillexa-growth-hunter failed to start:', err.message);
  await disconnect();
  process.exit(1);
});
