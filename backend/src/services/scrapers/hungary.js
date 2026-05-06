// Fuel type IDs used by holtankoljak.hu
const FUEL_MAP = {
  1: 'sp95',
  2: 'diesel',
  3: 'lpg',
  5: 'cng',
  6: 'diesel_premium',
};

// Cities spread across Hungary — each with 50km radius covers the whole country
const CITIES = [
  'Budapest XI',
  'Debrecen',
  'Miskolc',
  'Pécs',
  'Győr',
  'Szeged',
  'Nyíregyháza',
  'Kaposvár',
  'Szolnok',
  'Eger',
  'Keszthely',
  'Szombathely',
  'Dunaújváros',
  'Zalaegerszeg',
  'Veszprém',
  'Hatvan',
  'Székesfehérvár',
  'Nagykanizsa',
  'Tatabánya',
  'Berettyóújfalu',
];

// Approximate HUF → EUR rate (updated periodically)
const HUF_EUR = 400;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function hufToEur(huf) {
  return +(huf / HUF_EUR).toFixed(3);
}

function parseStations(html, fuelType, stationMap) {
  const blocks = html.split('<div class="d-flex mb-3">');

  for (const block of blocks.slice(1)) {
    // Station detail page link — slug like "mol_diosd_1092#tartalom"
    const slugMatch = block.match(/href="([a-z][a-z0-9_]*)#tartalom"/);
    if (!slugMatch) continue;
    const slug = slugMatch[1];

    const idMatch = slug.match(/_(\d+)$/);
    if (!idMatch) continue;
    const externalId = `HU-${idMatch[1]}`;

    // Coordinates from route link: addresses=[[,],[lng,lat]]
    const coordMatch = block.match(/addresses=%5B%5B%2C%5D%2C%5B([\d.]+)%2C([\d.]+)%5D%5D/);
    if (!coordMatch) continue;
    const lng = parseFloat(coordMatch[1]);
    const lat = parseFloat(coordMatch[2]);
    if (isNaN(lat) || isNaN(lng)) continue;

    // Price: <span class="ar">727.0 / liter</span>
    const priceMatch = block.match(/<span class="ar">\s*([\d.]+)\s*\/\s*liter/);
    if (!priceMatch) continue;
    const priceHuf = parseFloat(priceMatch[1]);
    if (isNaN(priceHuf) || priceHuf <= 0) continue;

    // Brand from first img title attribute
    const brandMatch = block.match(/title="([^"]{1,40})"\s*>/);
    const rawBrand = brandMatch ? brandMatch[1].trim() : null;
    // Skip tooltip helper strings
    const brand = rawBrand && !rawBrand.includes('<') && !rawBrand.includes('Útvonal') ? rawBrand : null;

    // Address: indented text line just before a </a> inside the ar_list span
    const addrMatch = block.match(/\n\s{4,}([A-ZÀ-ž][^\n<\r]{2,80})\r?\n\s*<\/a>/);
    const rawAddr = addrMatch ? addrMatch[1].trim() : null;
    const city = rawAddr ? (rawAddr.split(',')[0] || '').trim() : '';
    const address = rawAddr || null;

    const priceEur = hufToEur(priceHuf);

    if (!stationMap.has(externalId)) {
      const nameFromSlug = slug.replace(/_\d+$/, '').replace(/_/g, ' ');
      stationMap.set(externalId, {
        externalId,
        name: brand || nameFromSlug,
        brand: brand || null,
        lat,
        lng,
        address,
        city,
        country: 'HU',
        prices: {},
      });
    }

    stationMap.get(externalId).prices[fuelType] = priceEur;
  }
}

async function fetchCity(city, fuelTypeId, stationMap) {
  try {
    const body = `uatip=${fuelTypeId}&irsz=${encodeURIComponent(city)}&distance=50`;
    const res = await fetch('https://holtankoljak.hu/station_result', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; Gasify/1.0)',
        'Referer': 'https://holtankoljak.hu/',
      },
      body,
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return;
    const html = await res.text();
    parseStations(html, FUEL_MAP[fuelTypeId], stationMap);
  } catch {
    // skip silently — will be covered by overlapping city searches
  }
}

async function fetchHungaryStations() {
  const stationMap = new Map();
  const fuelTypeIds = Object.keys(FUEL_MAP).map(Number);
  const total = CITIES.length * fuelTypeIds.length;
  let done = 0;

  for (const city of CITIES) {
    for (const ftId of fuelTypeIds) {
      await fetchCity(city, ftId, stationMap);
      done++;
      if (done % 20 === 0) console.log(`[hungary] ${done}/${total} requests done, ${stationMap.size} unique stations`);
      await sleep(300);
    }
  }

  console.log(`[hungary] Done — ${stationMap.size} unique stations`);

  return [...stationMap.values()]
    .filter(s => Object.keys(s.prices).length > 0)
    .map(s => ({
      ...s,
      prices: Object.entries(s.prices).map(([fuelType, price]) => ({ fuelType, price })),
    }));
}

module.exports = { fetchHungaryStations };
