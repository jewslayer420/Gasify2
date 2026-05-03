const path = require('path');
const fs = require('fs');
const { reverseGeocodeCity } = require('../../utils/geo');

const CACHE_FILE = path.join(__dirname, '../../../.city-cache.json');

// Load persistent zip→city cache from disk
let cityCache = {};
try { cityCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch {}

function saveCache() {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cityCache)); } catch {}
}

async function resolveCity(zipCode, lat, lng) {
  if (cityCache[zipCode]) return cityCache[zipCode];
  try {
    await new Promise(r => setTimeout(r, 1100)); // Nominatim: max 1 req/sec
    const city = await reverseGeocodeCity(lat, lng);
    cityCache[zipCode] = city || zipCode;
    saveCache();
    return cityCache[zipCode];
  } catch {
    cityCache[zipCode] = zipCode;
    return zipCode;
  }
}

const FUEL_MAP = {
  '95': 'sp95',
  '98': 'sp98',
  '100': 'sp100',
  'dizel': 'diesel',
  'dizel-premium': 'diesel_premium',
  'avtoplin-lpg': 'lpg',
};

async function fetchSloveniaStations() {
  const stations = [];
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

      const city = await resolveCity(item.zip_code, item.lat, item.lng);

      stations.push({
        externalId: `SI-${item.pk}`,
        name: item.name,
        brand: null,
        lat: item.lat,
        lng: item.lng,
        address: item.address || null,
        city,
        country: 'SI',
        prices,
      });
    }

    url = data.next;
  }

  return stations;
}

module.exports = { fetchSloveniaStations };
