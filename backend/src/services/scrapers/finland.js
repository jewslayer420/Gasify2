// Finland fuel prices via polttoaine.net/api — free XML feed covering all chains
const API_URL = 'https://polttoaine.net/api/';
const UA = 'Mozilla/5.0 (compatible; Gasify/1.0)';

function getTag(xml, tag) {
  const m = xml.match(new RegExp('<' + tag + '>([^<]*)<\/' + tag + '>'));
  return m ? m[1].trim() : '';
}

function mapFuelType(type) {
  const t = (type || '').toLowerCase().trim();
  if (t === '95e10') return 'sp95'; // 95E10 IS Finland's standard 95 petrol — 'e10' hid it from the app's 95 view
  if (t === '98e5') return 'sp98';
  if (t === 'diesel') return 'diesel';
  if (t.includes('diesel+') || t.includes('dieselplus')) return 'diesel_premium';
  if (t === 'vpower') return 'sp98';
  return null;
}

function normalizeBrand(chain) {
  const c = (chain || '').toLowerCase();
  if (c.includes('shell')) return 'Shell';
  if (c.includes('st1')) return 'St1';
  if (c.includes('neste')) return 'Neste';
  if (c.startsWith('abc')) return 'ABC';
  if (c.includes('teboil')) return 'Teboil';
  if (c.includes('seo')) return 'SEO';
  if (c.includes('gulf')) return 'Gulf';
  if (c.includes('esso')) return 'Esso';
  return chain || null;
}

function makeExternalId(name, city, address) {
  const key = (name + city + address).toLowerCase().replace(/[^a-z0-9]/g, '');
  return 'FI-PT-' + key.slice(0, 40);
}

async function fetchFinlandStations() {
  let xml = '';
  try {
    const res = await fetch(API_URL, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) { console.log('[finland] polttoaine.net failed:', res.status); return []; }
    xml = await res.text();
  } catch (e) {
    console.log('[finland] polttoaine.net error:', e.message);
    return [];
  }

  const stationBlocks = xml.match(/<station>[\s\S]*?<\/station>/g) || [];
  const result = [];

  for (const block of stationBlocks) {
    const name = getTag(block, 'name');
    const city = getTag(block, 'city');
    const address = getTag(block, 'address');
    const chain = getTag(block, 'chain');
    const lat = parseFloat(getTag(block, 'lat'));
    const lon = parseFloat(getTag(block, 'lon'));

    if (isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) continue;

    const fuelBlocks = block.match(/<fuel>[\s\S]*?<\/fuel>/g) || [];
    const prices = [];
    const seen = new Set();

    for (const fuel of fuelBlocks) {
      const type = getTag(fuel, 'type');
      const priceStr = getTag(fuel, 'price');
      const ft = mapFuelType(type);
      const price = parseFloat(priceStr);
      if (!ft || isNaN(price) || price <= 0 || price > 5 || seen.has(ft)) continue;
      seen.add(ft);
      prices.push({ fuelType: ft, price: +price.toFixed(3) });
    }

    if (!prices.length) continue;

    result.push({
      externalId: makeExternalId(name, city, address),
      name: name || chain || 'Station',
      brand: normalizeBrand(chain),
      lat,
      lng: lon,
      address: address || null,
      city: city || '',
      country: 'FI',
      prices,
    });
  }

  console.log(`[finland] polttoaine.net: ${result.length} stations`);
  return result;
}

module.exports = { fetchFinlandStations };
