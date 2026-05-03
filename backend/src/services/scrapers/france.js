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

async function fetchFranceStations() {
  const stations = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const url = `${BASE}?limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Gasify/1.0' } });
    if (!res.ok) throw new Error(`France API fetch failed: ${res.status}`);
    const data = await res.json();
    total = data.total_count ?? 0;

    for (const item of data.results) {
      if (!item.geom?.lat || !item.geom?.lon) continue;

      const pricesRaw = item.prix ?? [];
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
        lat: item.geom.lat,
        lng: item.geom.lon,
        address: item.adresse ?? null,
        city: item.ville || item.cp || '',
        country: 'FR',
        prices,
      });
    }

    offset += PAGE_SIZE;
    if (data.results.length < PAGE_SIZE) break;
  }

  return stations;
}

module.exports = { fetchFranceStations };
