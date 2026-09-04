// The sales zones a store can belong to. The page offers exactly these; the
// API refuses anything else so a typo can never become a fifth zone.
const ZONES = ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4'];

// What a request may write for `zone`. An absent key is left out, so a PATCH
// that only renames a store never touches its zone; '' and null both clear it.
function readZone(body) {
  if (!('zone' in body)) return { ok: true, data: {} };
  const zone = body.zone == null || body.zone === '' ? null : body.zone;
  if (zone !== null && !ZONES.includes(zone)) {
    return { ok: false, error: `zone must be one of ${ZONES.join(', ')}` };
  }
  return { ok: true, data: { zone } };
}

module.exports = { ZONES, readZone };
