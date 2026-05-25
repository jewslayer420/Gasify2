// Sweden fuel prices — Circle K chain API (prices in SEK, converted to EUR)
// NOTE: api.circlek.com/eu/prices/v1/fuel/countries/SE returns 400 (not supported on EU endpoint).
//       This scraper will return [] until a working Sweden data source is found.
// Accepts coordsCache (Map externalId→{lat,lng}) to skip re-geocoding known stations

const SEK_EUR = 1 / 11.53;
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const UA = 'Mozilla/5.0 (compatible; Gasify/1.0; +https://gasify.app)';

function sek(price) {
  const n = parseFloat(price) * SEK_EUR;
  return isNaN(n) || n <= 0 ? 0 : +n.toFixed(3);
}

function mapFuel(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('hvo') || n.includes('cng') || n.includes('lpg') || n.includes('kwh') || n.includes('electric')) return null;
  if ((n.includes('diesel') || n.startsWith('miles d') || n.startsWith('milesplus')) && (n.includes('+') || n.includes('plus') || n.includes('premium') || n.includes('upgrade'))) return 'diesel_premium';
  if (n.includes('diesel') || n.startsWith('miles d')) return 'diesel';
  if (n.includes('e10')) return 'e10';
  if (n.includes('95')) return 'sp95';
  if (n.includes('98')) return 'sp98';
  return null;
}

async function geocode(query) {
  await new Promise(r => setTimeout(r, 1150));
  try {
    const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&countrycodes=se&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.length ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : null;
  } catch { return null; }
}

async function fetchSwedenStations(coordsCache = new Map()) {
  let sites = [];
  try {
    const res = await fetch('https://api.circlek.com/eu/prices/v1/fuel/countries/SE', {
      headers: { 'User-Agent': UA, 'X-App-Name': 'PRICES' },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) { console.log('[sweden] Circle K failed:', res.status); return []; }
    sites = (await res.json()).sites || [];
  } catch (e) { console.log('[sweden] Circle K error:', e.message); return []; }

  const result = [];
  let geocoded = 0;
  for (const s of sites) {
    const prices = [];
    for (const p of (s.fuelPrices || [])) {
      const ft = mapFuel(p.displayName || '');
      if (!ft) continue;
      const price = sek(p.price);
      if (price > 0) prices.push({ fuelType: ft, price });
    }
    if (!prices.length) continue;

    const externalId = `SE-CK-${s.id}`;
    const cached = coordsCache.get(externalId);
    let coords = cached ? { lat: Number(cached.lat), lng: Number(cached.lng) } : null;
    if (!coords) {
      const addr = s.address || {};
      const query = [addr.street, addr.postalCode, addr.city, 'Sweden'].filter(Boolean).join(', ');
      coords = await geocode(query);
      if (coords) geocoded++;
    }
    if (!coords) continue;

    const addr = s.address || {};
    result.push({
      externalId,
      name: s.name || 'Circle K',
      brand: 'Circle K',
      lat: coords.lat, lng: coords.lng,
      address: addr.street || null,
      city: addr.city || '',
      country: 'SE',
      prices,
    });
  }
  console.log(`[sweden] Circle K: ${result.length} stations (${geocoded} new geocoded)`);
  return result;
}

module.exports = { fetchSwedenStations };
