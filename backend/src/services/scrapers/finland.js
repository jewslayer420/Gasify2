// Finland fuel prices — ST1 chain public station API (prices in EUR)
// ST1 is a Finnish-headquartered chain with ~300 stations across Finland
// Accepts coordsCache (Map externalId→{lat,lng}) to skip re-geocoding known stations

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const UA = 'Mozilla/5.0 (compatible; Gasify/1.0; +https://gasify.app)';

// ST1 station list — public JSON used by their store locator
const ST1_STATIONS_URL = 'https://www.st1.fi/api/public/stations';
// ST1 prices — public JSON used by their fuel price widget
const ST1_PRICES_URL   = 'https://www.st1.fi/api/public/fuelprices';

function eur(price) {
  const n = parseFloat(price);
  return isNaN(n) || n <= 0 ? 0 : +n.toFixed(3);
}

function mapFuel(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('hvo') || n.includes('cng') || n.includes('lpg') || n.includes('kaasu') || n.includes('electric') || n.includes('sähkö')) return null;
  if (n.includes('diesel') && (n.includes('+') || n.includes('premium') || n.includes('plus'))) return 'diesel_premium';
  if (n.includes('diesel') || n.includes('gasoil')) return 'diesel';
  if (n.includes('e10') || n.includes('95 e10')) return 'e10';
  if (n.includes('95') || n.includes('bensiini') || n.includes('95e5')) return 'sp95';
  if (n.includes('98') || n.includes('super plus')) return 'sp98';
  return null;
}

async function geocode(query) {
  await new Promise(r => setTimeout(r, 1150));
  try {
    const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&countrycodes=fi&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.length ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : null;
  } catch { return null; }
}

async function fetchST1() {
  try {
    // Try fetching station list with coordinates
    const res = await fetch(ST1_STATIONS_URL, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      console.log('[finland] ST1 stations failed:', res.status);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.log('[finland] ST1 stations error:', e.message);
    return null;
  }
}

async function fetchST1Prices() {
  try {
    const res = await fetch(ST1_PRICES_URL, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      console.log('[finland] ST1 prices failed:', res.status);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.log('[finland] ST1 prices error:', e.message);
    return null;
  }
}

async function fetchFinlandStations(coordsCache = new Map()) {
  const [stationsData, pricesData] = await Promise.all([fetchST1(), fetchST1Prices()]);

  if (!stationsData && !pricesData) {
    console.log('[finland] All sources failed');
    return [];
  }

  const result = [];

  // If ST1 returns a list with lat/lng + prices directly
  const stations = Array.isArray(stationsData) ? stationsData :
                   (stationsData?.stations || stationsData?.data || []);
  const prices   = Array.isArray(pricesData)  ? pricesData  :
                   (pricesData?.prices   || pricesData?.data  || []);

  // Build price lookup by station id/code
  const priceMap = new Map();
  for (const p of prices) {
    const id = p.stationId || p.id || p.code;
    if (!id) continue;
    if (!priceMap.has(id)) priceMap.set(id, []);
    const ft = mapFuel(p.fuelName || p.name || p.fuelType || '');
    const price = eur(p.price || p.value);
    if (ft && price > 0) priceMap.get(id).push({ fuelType: ft, price });
  }

  let geocoded = 0;
  for (const s of stations) {
    const id = s.id || s.stationId || s.code;
    if (!id) continue;

    const stationPrices = priceMap.get(String(id)) || priceMap.get(id) || [];

    // Some APIs embed prices in the station object
    if (!stationPrices.length && (s.fuelPrices || s.prices)) {
      const embedded = s.fuelPrices || s.prices || [];
      for (const p of embedded) {
        const ft = mapFuel(p.fuelName || p.name || p.fuelType || '');
        const price = eur(p.price || p.value);
        if (ft && price > 0) stationPrices.push({ fuelType: ft, price });
      }
    }

    if (!stationPrices.length) continue;

    const externalId = `FI-ST1-${id}`;
    const cached = coordsCache.get(externalId);
    let coords = cached ? { lat: Number(cached.lat), lng: Number(cached.lng) } : null;

    if (!coords) {
      const lat = parseFloat(s.lat || s.latitude || s.y);
      const lng = parseFloat(s.lng || s.longitude || s.lon || s.x);
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        coords = { lat, lng };
      }
    }

    if (!coords) {
      const addr = [s.address || s.street, s.postalCode || s.zip, s.city || s.municipality, 'Finland']
        .filter(Boolean).join(', ');
      if (addr.replace(/, /g, '').trim()) {
        coords = await geocode(addr);
        if (coords) geocoded++;
      }
    }

    if (!coords) continue;

    result.push({
      externalId,
      name: s.name || s.title || 'ST1',
      brand: (s.brand || s.name || 'ST1').includes('Shell') ? 'Shell' : 'ST1',
      lat: coords.lat,
      lng: coords.lng,
      address: s.address || s.street || null,
      city: s.city || s.municipality || '',
      country: 'FI',
      prices: stationPrices,
    });
  }

  console.log(`[finland] ST1: ${result.length} stations (${geocoded} geocoded)`);
  return result;
}

module.exports = { fetchFinlandStations };
