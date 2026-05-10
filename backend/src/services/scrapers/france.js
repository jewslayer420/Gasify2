const BASE = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records';
const PAGE_SIZE = 100;

const FUEL_MAP = {
  'Gazole': 'diesel',
  'SP95': 'sp95',
  'SP98': 'sp98',
  'E10': 'e10',
  'GPLc': 'lpg',
  'E85': 'e85',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchFranceStations() {
  const stations = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const url = `${BASE}?limit=${PAGE_SIZE}&offset=${offset}`;
    let data;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(url, { headers: { 'User-Agent': 'Gasify/1.0' }, signal: AbortSignal.timeout(20000) });
      if (res.status === 429) { await sleep(5000); continue; }
      if (!res.ok) throw new Error(`France API fetch failed: ${res.status}`);
      data = await res.json();
      break;
    }
    if (!data) break;
    total = data.total_count ?? 0;

    for (const item of data.results) {
      const lat = item.geom?.lat ?? item.latitude;
      const lon = item.geom?.lon ?? item.longitude;
      if (!lat || !lon) continue;

      // prix is returned as a JSON string by the API
      let pricesRaw = [];
      try {
        let parsed = item.prix ? (typeof item.prix === 'string' ? JSON.parse(item.prix) : item.prix) : [];
        pricesRaw = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      } catch { pricesRaw = []; }
      const prices = [];

      for (const entry of pricesRaw) {
        const fuelType = FUEL_MAP[entry['@nom']];
        const price = parseFloat(entry['@valeur']);
        if (fuelType && !isNaN(price) && price > 0) {
          prices.push({ fuelType, price });
        }
      }

      if (!prices.length) continue;

      stations.push({
        externalId: `FR-${item.id}`,
        name: item.nom || `Station ${item.id}`,
        brand: item.enseignes ?? null,
        lat,
        lng: lon,
        address: item.adresse ?? null,
        city: item.ville || item.cp || '',
        country: 'FR',
        prices,
      });
    }

    offset += PAGE_SIZE;
    if (offset % 1000 === 0) console.log(`[france] Fetched ${offset}/${total} stations so far`);
    if (data.results.length < PAGE_SIZE) break;
    await sleep(300);
  }

  return stations;
}

module.exports = { fetchFranceStations };
