// Taiwan fuel prices — CPC Corporation (中油) Open Data API
//
// Stations: GET https://vipmbr.cpc.com.tw/opendata/5typeservicestn
//   Fields: 站代號 (code), 站名 (name), 地址 (address), 經度 (lng), 緯度 (lat)
//
// Prices:  GET https://vipmbr.cpc.com.tw/opendata/MainProdListPrice_English
//   CPC sets uniform national prices — all stations share the same price list.
//   Relevant fuel types: 95/98 Unleaded Gasoline, Premium Diesel
//   Prices in TWD/L
//
// No auth required. Prices update weekly (CPC announces Thursdays).

const TWD_EUR = 1 / 35; // 1 EUR ≈ 35 TWD
const UA = 'Mozilla/5.0 (compatible; Gasify/1.0)';
const BASE = 'https://vipmbr.cpc.com.tw/opendata';

function twdToEur(val) {
  const n = parseFloat(val);
  if (isNaN(n) || n <= 0) return null;
  const eur = +(n * TWD_EUR).toFixed(3);
  return eur > 0.3 && eur < 6 ? eur : null;
}

function mapFuelType(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n.includes('98')) return 'sp98';
  if (n.includes('95') && !n.includes('e3') && !n.includes('gasohol')) return 'sp95';
  if (n.includes('premium diesel')) return 'diesel';
  return null;
}

async function fetchTaiwanStations() {
  let stations, priceList;
  try {
    [stations, priceList] = await Promise.all([
      fetch(`${BASE}/5typeservicestn`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      }).then(r => { if (!r.ok) throw new Error(`stations ${r.status}`); return r.json(); }),
      fetch(`${BASE}/MainProdListPrice_English`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      }).then(r => { if (!r.ok) throw new Error(`prices ${r.status}`); return r.json(); }),
    ]);
  } catch (err) {
    console.error('[taiwan] fetch error:', err.message);
    return [];
  }

  // Build national price list (same for all stations)
  const prices = [];
  const seenFuelTypes = new Set();
  for (const p of priceList) {
    const fuelType = mapFuelType(p['產品名稱']);
    if (!fuelType || seenFuelTypes.has(fuelType)) continue;
    // Only per-litre prices (skip per-kilolitre marine fuel)
    const unit = (p['計價單位'] || '').toLowerCase();
    if (unit.includes('kiloliter') || unit.includes('公秉')) continue;
    const price = twdToEur(p['參考牌價_金額']);
    if (!price) continue;
    seenFuelTypes.add(fuelType);
    prices.push({ fuelType, price });
  }

  if (!prices.length) {
    console.error('[taiwan] no valid prices found');
    return [];
  }

  const result = [];
  for (const s of stations) {
    const lat = parseFloat(s['緯度']);
    const lng = parseFloat(s['經度']);
    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) continue;
    result.push({
      externalId: `TW-CPC-${s['站代號']}`,
      name: s['站名'] || `Station ${s['站代號']}`,
      brand: 'CPC',
      lat,
      lng,
      address: s['地址'] || null,
      city: '',
      country: 'TW',
      prices,
    });
  }

  console.log(`[taiwan] ${result.length} stations, prices: ${prices.map(p => p.fuelType + '=€' + p.price).join(', ')}`);
  return result;
}

module.exports = { fetchTaiwanStations };
