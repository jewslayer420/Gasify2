// Denmark fuel prices — three sources, all DKK converted to EUR at fixed peg
// Shell:    shellpumpepriser.geoapp.me/v1/prices          (coords + prices, no auth)
// Q8/F24:   q8.dk station list (coords) + beta.q8.dk prices, joined by address
// Circle K: api.circlek.com bulk endpoint (prices only)   → Nominatim geocoding

const DKK_EUR = 1 / 7.4604;
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const UA = 'Mozilla/5.0 (compatible; Gasify/1.0; +https://gasify.app)';

function dkk(price) {
  const n = parseFloat(price) * DKK_EUR;
  return isNaN(n) || n <= 0 ? 0 : +n.toFixed(3);
}

function mapShellFuel(fuelType, octane) {
  if (fuelType === 'Autodiesel') return 'diesel';
  if (fuelType === 'Autobenzin') return octane === '98' ? 'sp98' : 'sp95';
  return null;
}

function mapQ8Fuel(name) {
  const n = name.toLowerCase();
  if (n.includes('hvo') || n.includes('adblue') || n.includes('kwh') || n.includes('cng')) return null;
  if (n.includes('diesel') && (n.includes('extra') || n.includes('+'))) return 'diesel_premium';
  if (n.includes('diesel')) return 'diesel';
  if (n.includes('e10')) return 'e10';
  if (n.includes('95') && (n.includes('extra') || n.includes('e5'))) return 'sp95';
  if (n.includes('95')) return 'sp95';
  if (n.includes('98')) return 'sp98';
  return null;
}

function mapCircleKFuel(name) {
  const n = name.toLowerCase();
  if (n.includes('hvo') || n.includes('cng') || n.includes('lpg') || n.includes('kwh') || n.includes('electric')) return null;
  if ((n.includes('diesel') || n.startsWith('miles d') || n.startsWith('milesplu')) && (n.includes('+') || n.includes('plus') || n.includes('upgrade'))) return 'diesel_premium';
  if (n.includes('diesel') || n.startsWith('miles d') || n === 'miles di') return 'diesel';
  if (n.includes('e10')) return 'e10';
  if (n.includes('95')) return 'sp95';
  if (n.includes('98')) return 'sp98';
  return null;
}

async function geocode(query) {
  await new Promise(r => setTimeout(r, 1150));
  try {
    const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&countrycodes=dk&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { return null; }
}

async function fetchShell() {
  try {
    const res = await fetch('https://shellpumpepriser.geoapp.me/v1/prices', {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) { console.log('[denmark] Shell failed:', res.status); return []; }
    const stations = await res.json();
    const result = [];
    for (const s of stations) {
      if (!s.coordinates) continue;
      const lat = parseFloat(s.coordinates.latitude);
      const lng = parseFloat(s.coordinates.longitude);
      if (isNaN(lat) || isNaN(lng)) continue;
      const prices = [];
      for (const p of (s.prices || [])) {
        const ft = mapShellFuel(p.fuelType, p.octane);
        if (!ft) continue;
        const price = dkk(p.price);
        if (price > 0) prices.push({ fuelType: ft, price });
      }
      if (!prices.length) continue;
      result.push({
        externalId: `DK-SHELL-${s.stationId}`,
        name: 'Shell',
        brand: 'Shell',
        lat, lng,
        address: [s.street, s.houseNumber].filter(Boolean).join(' ') || null,
        city: s.city || '',
        country: 'DK',
        prices,
      });
    }
    console.log(`[denmark] Shell: ${result.length} stations`);
    return result;
  } catch (e) { console.log('[denmark] Shell error:', e.message); return []; }
}

async function fetchQ8() {
  // Station list → build address+city key → coords map
  const coordMap = new Map();
  try {
    const res = await fetch(
      'https://www.q8.dk/-/Station/GetGlobalMapStations?appDataSource=bbe79579-212c-498a-b51c-b76702a2cbfe',
      { headers: { 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest' }, signal: AbortSignal.timeout(30000) }
    );
    if (res.ok) {
      const data = await res.json();
      for (const s of (data.stations || [])) {
        if (!s.position?.lat || !s.address || !s.city) continue;
        const key = (s.address + ' ' + s.city).toLowerCase().replace(/\s+/g, ' ').trim();
        coordMap.set(key, { lat: s.position.lat, lng: s.position.lng, city: s.city });
      }
    }
  } catch { /* proceed without coord map */ }

  // Prices
  let priceStations = [];
  try {
    const res = await fetch('https://beta.q8.dk/Station/GetStationPrices?page=1&pageSize=2000', {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) priceStations = (await res.json())?.data?.stationsPrices || [];
  } catch { console.log('[denmark] Q8 prices error'); return []; }

  const result = [];
  let geocoded = 0;
  for (const s of priceStations) {
    const prices = [];
    for (const p of (s.products || [])) {
      if (p.unit !== 'L') continue;
      const ft = mapQ8Fuel(p.productName || '');
      if (!ft) continue;
      const price = dkk(p.price);
      if (price > 0) prices.push({ fuelType: ft, price });
    }
    if (!prices.length) continue;

    // Strip postal code + country from address to get "Street City"
    const rawAddr = (s.address || '')
      .replace(/\s+Danmark\s*$/i, '')
      .replace(/\s+DK\s*$/i, '')
      .replace(/\s+\d{4}\s*$/, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

    let coords = null;
    if (rawAddr) {
      for (const [key, val] of coordMap) {
        if (key === rawAddr || key.startsWith(rawAddr)) { coords = val; break; }
      }
    }
    if (!coords && s.address) {
      coords = await geocode(s.address + ' Denmark');
      if (coords) geocoded++;
    }
    if (!coords) continue;

    result.push({
      externalId: `DK-Q8-${s.stationId}`,
      name: s.stationName || 'Q8',
      brand: (s.stationName || '').includes('F24') ? 'F24' : 'Q8',
      lat: coords.lat, lng: coords.lng,
      address: rawAddr || null,
      city: coords.city || '',
      country: 'DK',
      prices,
    });
  }
  console.log(`[denmark] Q8/F24: ${result.length} stations (${geocoded} geocoded via Nominatim)`);
  return result;
}

async function fetchCircleK() {
  let sites = [];
  try {
    const res = await fetch('https://api.circlek.com/eu/prices/v1/fuel/countries/DK', {
      headers: { 'User-Agent': UA, 'X-App-Name': 'PRICES' },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) { console.log('[denmark] Circle K failed:', res.status); return []; }
    sites = (await res.json()).sites || [];
  } catch (e) { console.log('[denmark] Circle K error:', e.message); return []; }

  const result = [];
  let geocoded = 0;
  for (const s of sites) {
    const prices = [];
    for (const p of (s.fuelPrices || [])) {
      const ft = mapCircleKFuel(p.displayName || '');
      if (!ft) continue;
      const price = dkk(p.price);
      if (price > 0) prices.push({ fuelType: ft, price });
    }
    if (!prices.length) continue;

    const addr = s.address || {};
    const query = [addr.street, addr.postalCode, addr.city, 'Denmark'].filter(Boolean).join(', ');
    const coords = await geocode(query);
    if (!coords) continue;
    geocoded++;

    const isIngo = (s.name || '').toLowerCase().includes('ingo');
    result.push({
      externalId: `DK-CK-${s.id}`,
      name: s.name || 'Circle K',
      brand: isIngo ? 'INGO' : 'Circle K',
      lat: coords.lat, lng: coords.lng,
      address: addr.street || null,
      city: addr.city || '',
      country: 'DK',
      prices,
    });
  }
  console.log(`[denmark] Circle K/INGO: ${result.length} stations (${geocoded} geocoded)`);
  return result;
}

async function fetchDenmarkStations() {
  // Shell runs independently; Q8 and Circle K geocode sequentially to respect Nominatim rate limit
  const shell = await fetchShell();
  const q8 = await fetchQ8();
  const circleK = await fetchCircleK();
  const all = [...shell, ...q8, ...circleK];
  console.log(`[denmark] Total: ${all.length} stations`);
  return all;
}

module.exports = { fetchDenmarkStations };
