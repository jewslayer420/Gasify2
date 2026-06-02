// South Korea fuel prices — OpenStreetMap stations + Opinet national average prices
//
// Prices: Opinet (Korea National Oil Corporation) — national daily average prices
//   GET https://www.opinet.co.kr/api/avgAllPrice.do?code=F231013281&out=json
//   Returns: national average price in KRW/L for each fuel product
//   Products: B027=휘발유(gasoline), B034=고급휘발유(premium), D047=경유(diesel), K015=부탄(LPG)
//   Updated daily.
//
// Stations: Overpass API — amenity=fuel nodes in South Korea
//   POST https://overpass-api.de/api/interpreter
//
// Opinet API key F231013281 is Opinet's publicly indexed demo key.

const KRW_EUR = 1 / 1500; // 1 EUR ≈ 1500 KRW
const UA = 'Gasify/1.0 (fuel price aggregator; contact teo.karov@gmail.com)';
const OVERPASS_MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

const PRODCD_MAP = {
  B027: 'sp95',    // 휘발유 — regular unleaded
  B034: 'sp98',    // 고급휘발유 — premium
  D047: 'diesel',  // 자동차용경유 — automotive diesel
  K015: 'lpg',     // 자동차용부탄 — LPG/autogas
};

function krwToEur(val) {
  const n = parseFloat(val);
  if (isNaN(n) || n <= 0) return null;
  const eur = +(n * KRW_EUR).toFixed(3);
  return eur > 0.1 && eur < 6 ? eur : null;
}

async function fetchSouthKoreaStations() {
  // 1. Fetch national average fuel prices from Opinet
  let priceList = [];
  try {
    const r = await fetch(
      'https://www.opinet.co.kr/api/avgAllPrice.do?code=F231013281&out=json',
      { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) }
    );
    if (!r.ok) throw new Error(`Opinet HTTP ${r.status}`);
    const json = await r.json();
    const oils = json?.RESULT?.OIL;
    if (!Array.isArray(oils) || !oils.length) throw new Error('empty Opinet response');

    for (const item of oils) {
      const fuelType = PRODCD_MAP[item.PRODCD];
      if (!fuelType) continue;
      const price = krwToEur(item.PRICE);
      if (price) priceList.push({ fuelType, price });
    }
    console.log(`[southkorea] prices: ${priceList.map(p => p.fuelType + '=€' + p.price).join(', ')}`);
  } catch (err) {
    console.error('[southkorea] price fetch error:', err.message);
    return [];
  }
  if (!priceList.length) return [];

  // 2. Fetch stations from OSM Overpass API
  // bbox: [latMin,lngMin,latMax,lngMax] — covers South Korea
  const query = `[out:json][timeout:90][bbox:33.0,124.5,38.7,129.6];(node["amenity"="fuel"];way["amenity"="fuel"];);out center body;`;
  let elements = [];
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const r = await fetch(`${mirror}?` + new URLSearchParams({ data: query }), {
        headers: { Accept: '*/*', 'User-Agent': UA },
        signal: AbortSignal.timeout(150000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      elements = json.elements || [];
      break;
    } catch (err) {
      console.warn(`[southkorea] ${mirror} failed:`, err.message);
    }
  }
  if (!elements.length) { console.error('[southkorea] all Overpass mirrors failed'); return []; }

  const stations = [];
  for (const e of elements) {
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    if (!lat || !lng) continue;
    const tags = e.tags || {};
    const name = tags.name || tags['name:en'] || tags['name:ko'] || tags.brand || tags.operator || 'Fuel Station';
    const brand = tags['brand:en'] || tags.brand || tags['operator:en'] || tags.operator || null;
    const city = tags['addr:city'] || tags['addr:suburb'] || '';
    const addrParts = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean);

    stations.push({
      externalId: `KR-OSM-${e.id}`,
      name,
      brand,
      lat,
      lng,
      address: addrParts.length ? addrParts.join(' ') : null,
      city,
      country: 'KR',
      prices: priceList,
    });
  }

  console.log(`[southkorea] ${stations.length} stations from OSM`);
  return stations;
}

module.exports = { fetchSouthKoreaStations };
