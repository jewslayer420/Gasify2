const FUEL_MAP = {
  '95': 'sp95',
  '98': 'sp98',
  '100': 'sp100',
  'dizel': 'diesel',
  'dizel-premium': 'diesel_premium',
  'avtoplin-lpg': 'lpg',
};

const DELAY_MS = 1100;

// Module-level cache: persists across sync calls within the same process
const zipCache = new Map();

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function resolveZip(zip) {
  if (zipCache.has(zip)) return zipCache.get(zip);

  const url = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(zip)}&countrycodes=si&format=json&limit=1`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Gasify/1.0 (teo.karov@gmail.com)' },
    });
    if (!res.ok) { zipCache.set(zip, zip); return zip; }
    const data = await res.json();
    if (!data.length) { zipCache.set(zip, zip); return zip; }
    // display_name: "1290, Grosuplje, Upravna Enota Grosuplje, Slovenija" — city is index 1
    const parts = data[0].display_name.split(',').map(s => s.trim());
    const city = parts[1] || parts[0];
    zipCache.set(zip, city);
    return city;
  } catch {
    zipCache.set(zip, zip);
    return zip;
  }
}

async function fetchSloveniaStations() {
  // 1. Collect all raw station records (fast, no geocoding)
  const rawStations = [];
  let url = 'https://goriva.si/api/v1/search/?format=json&page_size=100';

  while (url) {
    const res = await fetch(url, { headers: { 'User-Agent': 'Gasify/1.0' } });
    if (!res.ok) throw new Error(`goriva.si fetch failed: ${res.status}`);
    const data = await res.json();

    for (const item of data.results) {
      const prices = [];
      for (const [key, price] of Object.entries(item.prices || {})) {
        if (price !== null && price > 0 && FUEL_MAP[key]) {
          prices.push({ fuelType: FUEL_MAP[key], price });
        }
      }
      if (!prices.length) continue;

      rawStations.push({
        externalId: `SI-${item.pk}`,
        name: item.name,
        brand: null,
        lat: item.lat,
        lng: item.lng,
        address: item.address || null,
        zip: item.zip_code || '',
        country: 'SI',
        prices,
      });
    }

    url = data.next;
  }

  // 2. Resolve only new zip codes not already in the module-level cache
  const uniqueZips = [...new Set(rawStations.map(s => s.zip).filter(z => z && /^\d+$/.test(z)))];
  const toResolve = uniqueZips.filter(z => !zipCache.has(z));

  for (let i = 0; i < toResolve.length; i++) {
    await resolveZip(toResolve[i]);
    if (i < toResolve.length - 1) await sleep(DELAY_MS);
  }

  // 3. Build final station list with resolved city names
  return rawStations.map(s => ({
    externalId: s.externalId,
    name: s.name,
    brand: s.brand,
    lat: s.lat,
    lng: s.lng,
    address: s.address,
    city: zipCache.get(s.zip) ?? s.zip,
    country: s.country,
    prices: s.prices,
  }));
}

module.exports = { fetchSloveniaStations };
