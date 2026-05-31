// Victoria (AU) fuel prices — Servo Saver Public API (Service Victoria)
// Apply:   https://service.vic.gov.au/find-services/transport-and-driving/servo-saver/help-centre/servo-saver-public-api
// Base URL: https://api.fuel.service.vic.gov.au/open-data/v1
// Auth:     x-consumer-id header + x-transactionid (UUID)
// env:      VIC_FUEL_API_KEY
// ~1500+ stations; prices update with 24h delay
//
// Response: { fuelPriceDetails: [{ fuelStation: { id, name, address, brandId, location: { latitude, longitude } },
//                                   fuelPrices: [{ fuelType, price, isAvailable, updatedAt }] }] }
// Price unit: cents/L  →  price/100 = AUD/L  (e.g. 199 = $1.99/L)

const AUD_EUR = 0.59;
const BASE = 'https://api.fuel.service.vic.gov.au/open-data/v1';
const UA = 'Mozilla/5.0 (compatible; Gasify/1.0; +https://gasify.app)';

function centsToEur(cents) {
  if (!cents || isNaN(cents) || cents <= 0 || cents >= 500) return null;
  const eur = +((cents / 100) * AUD_EUR).toFixed(3);
  return eur > 0 && eur < 6 ? eur : null;
}

function mapVicFuel(code) {
  switch ((code || '').toUpperCase()) {
    case 'U91':  return 'sp95';
    case 'P95':  return 'sp95';
    case 'P98':  return 'sp98';
    case 'DSL':  return 'diesel';
    case 'PDSL': return 'diesel_premium';
    case 'E10':  return 'e10';
    case 'LPG':  return 'lpg';
    case 'B20':  return 'diesel';
    default:     return null;
  }
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

async function fetchVICStations() {
  const consumerId = process.env.VIC_FUEL_API_KEY;
  if (!consumerId) {
    console.log('[australia_vic] skipped — VIC_FUEL_API_KEY not set (apply at service.vic.gov.au/servo-saver)');
    return [];
  }

  let data;
  try {
    const r = await fetch(`${BASE}/fuel/prices`, {
      headers: {
        'User-Agent': UA,
        'x-consumer-id': consumerId,
        'x-transactionid': uuid(),
      },
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) throw new Error(`VIC API ${r.status}`);
    data = await r.json();
  } catch (err) {
    console.error('[australia_vic] fetch error:', err.message);
    return [];
  }

  const stations = [];
  for (const detail of (data.fuelPriceDetails || [])) {
    const fs = detail.fuelStation;
    if (!fs) continue;
    const lat = fs.location?.latitude;
    const lng = fs.location?.longitude;
    if (!lat || !lng) continue;

    const prices = [];
    const seen = new Set();
    for (const p of (detail.fuelPrices || [])) {
      if (!p.isAvailable) continue;
      const ft = mapVicFuel(p.fuelType);
      if (!ft || seen.has(ft)) continue;
      const price = centsToEur(p.price);
      if (!price) continue;
      seen.add(ft);
      prices.push({ fuelType: ft, price });
    }
    if (!prices.length) continue;

    stations.push({
      externalId: `AU-VIC-${fs.id}`,
      name: fs.name || `Station ${fs.id}`,
      brand: null,
      lat,
      lng,
      address: fs.address || null,
      city: '',
      country: 'AU',
      prices,
    });
  }

  console.log(`[australia_vic] ${stations.length} stations`);
  return stations;
}

module.exports = { fetchVICStations };
