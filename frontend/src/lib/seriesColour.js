// Slice colours for the one chart where colour means identity: the Product mix
// doughnut on Reports.
//
// The categorical set. Fixed order, never cycled. Validated as a set for
// colour-blind separation (worst adjacent pair ΔE 9.1 under protanopia) — the
// three lighter hues sit under 3:1 on this app's white cards, which is why
// every slice is also named in the legend and the tooltip rather than
// identified by colour alone.
export const SERIES = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
  '#e34948',
];

// The "Other" bucket is a remainder, not an identity, so it gets grey and is
// never one of the eight.
export const OTHER = '#98a9ad';

/**
 * Colour follows the product, never its rank.
 *
 * The rows arrive sorted by amount, so indexing the palette by array position
 * repainted the whole chart whenever a filter changed which product sold most:
 * green was sprouts last week and bananas this week, and the two doughnuts
 * could not be compared. The slot comes from the product id instead, so a
 * product keeps its hue across every filter, page and session.
 *
 * Two products wanting the same slot take the next free one. Eight slots and up
 * to eight products means collisions are the normal case, not the rare one, and
 * two identical slices in one doughnut is the worse failure — stability is
 * preserved for whichever product the chart lists first, which is the one with
 * the most money behind it.
 */
export function sliceColours(rows) {
  const taken = new Set();
  return rows.map((row) => {
    if (row.id == null) return OTHER;
    let slot = Math.abs(Number(row.id) || 0) % SERIES.length;
    // Bounded: once every slot is taken the preferred one is reused rather
    // than spun on. withOther() caps the doughnut at eight named slices, so
    // that only happens if a caller ignores the cap.
    for (let tries = 0; tries < SERIES.length && taken.has(slot); tries++) {
      slot = (slot + 1) % SERIES.length;
    }
    taken.add(slot);
    return SERIES[slot];
  });
}
