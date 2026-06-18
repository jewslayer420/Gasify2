// Shared Overpass helper — fetch amenity=fuel stations strictly INSIDE a country's
// administrative boundary (ISO 3166-1), not a bounding box.
//
// WHY: a bbox is a rectangle and overlaps neighbours, so the "Canada-model" scrapers
// were tagging border stations with the wrong country — e.g. Croatia's bbox stamped
// Koper (Slovenia) and Trieste (Italy) as "HR". Querying by the country's admin area
// makes Overpass do true point-in-polygon, so every station gets the right country.

const UA = 'Gasify/1.0 (fuel price aggregator; contact teo.karov@gmail.com)';
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Raw OSM elements (nodes/ways w/ center) for amenity=fuel inside country `iso`.
// Returns [] if the country genuinely has none; returns null on total failure
// (all mirrors down) so callers can skip rather than wipe the country's data.
async function overpassFuelByCountry(iso, label = iso) {
  const query = `[out:json][timeout:240];area["ISO3166-1"="${iso}"]["admin_level"="2"]->.a;nwr["amenity"="fuel"](area.a);out center;`;
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const mirror of OVERPASS_MIRRORS) {
      try {
        await sleep(1500);
        const r = await fetch(`${mirror}?` + new URLSearchParams({ data: query }), {
          headers: { Accept: '*/*', 'User-Agent': UA }, signal: AbortSignal.timeout(180000),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = await r.json();
        return json.elements || [];
      } catch (err) {
        console.warn(`[${label}] overpass ${mirror.split('/')[2]} failed: ${err.message}`);
      }
    }
  }
  console.error(`[${label}] all Overpass mirrors failed (area ${iso}) — skipping`);
  return null;
}

// Build our station shape from a raw OSM element. `prefix` + iso make the externalId.
function osmToStation(e, iso, prefix, priceList) {
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  if (!lat || !lng) return null;
  const t = e.tags || {};
  const name = t.name || t['name:en'] || t.brand || t.operator || 'Fuel Station';
  const addr = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
  return {
    externalId: `${prefix}-${iso}-OSM-${e.type}-${e.id}`,
    name, brand: t.brand || t.operator || null, lat, lng,
    address: addr || null,
    city: t['addr:city'] || t['addr:town'] || t['addr:place'] || t['addr:suburb'] || t['addr:province'] || '',
    country: iso, prices: priceList,
  };
}

module.exports = { overpassFuelByCountry, osmToStation, UA };
