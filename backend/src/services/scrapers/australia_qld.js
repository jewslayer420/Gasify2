// Queensland (AU) fuel prices — FuelPricesQLD (Informed Sources aggregator)
// Docs:  https://www.fuelpricesqld.com.au (requires free subscriber sign-up)
// Auth:  Authorization: FPDAPI SubscriberToken=<token>
// env:   QLD_FUEL_API_KEY
// ~1800+ stations, countryId=21 (Queensland), geoRegionLevel=3 geoRegionId=1 (whole state)
//
// Site details response: { S: [{ S: siteId, N: name, A: address, B: brandId, P: postcode, Lat, Lng }] }
// Price response:        { SitePrices: [{ SiteId, FuelId, Price }] }
// Price unit: 10ths of cents/L  →  Price/1000 = AUD/L  (e.g. 1750 = 175.0 c/L = A$1.75/L)

const AUD_EUR = 0.59;
const BASE = 'https://fppdirectapi-prod.fuelpricesqld.com.au';
const UA = 'Mozilla/5.0 (compatible; Gasify/1.0; +https://gasify.app)';

function qldToEur(tenthCents) {
  const aud = tenthCents / 1000;
  if (isNaN(aud) || aud <= 0) return null;
  const eur = +(aud * AUD_EUR).toFixed(3);
  return eur > 0 && eur < 6 ? eur : null;
}

function mapQldFuel(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('premium diesel') || n.includes('prem diesel')) return 'diesel_premium';
  if (n.includes('diesel')) return 'diesel';
  if (n.includes('e10') || n.includes('ethanol 10')) return 'e10';
  if (n.includes('lpg') || n.includes('autogas')) return 'lpg';
  if (n.includes('98') || n.includes('ultimate') || n.includes('vortex 98')) return 'sp98';
  if (n.includes('95') || n.includes('premium unleaded') || n.includes('pul')) return 'sp95';
  if (n.includes('unleaded') || n.includes('ulp') || n.includes('91')) return 'sp95';
  return null;
}

function parseQldSuburb(address) {
  if (!address) return '';
  const m = address.match(/,\s*([^,]+?)\s+QLD\s+\d{4}/i);
  return m ? m[1].trim() : '';
}

async function apiFetch(token, path) {
  const r = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `FPDAPI SubscriberToken=${token}`,
      'Content-Type': 'application/json',
      'User-Agent': UA,
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`QLD API ${r.status} on ${path}`);
  return r.json();
}

async function fetchQLDStations() {
  const token = process.env.QLD_FUEL_API_KEY;
  if (!token) {
    console.log('[australia_qld] skipped — QLD_FUEL_API_KEY not set (sign up at fuelpricesqld.com.au)');
    return [];
  }

  // Fetch fuel types, site details, and prices in parallel
  let fuels, sitesData, pricesData;
  try {
    [fuels, sitesData, pricesData] = await Promise.all([
      apiFetch(token, '/Subscriber/GetCountryFuelTypes?countryId=21'),
      apiFetch(token, '/Subscriber/GetFullSiteDetails?countryId=21&geoRegionLevel=3&geoRegionId=1'),
      apiFetch(token, '/Price/GetSitesPrices?countryId=21&geoRegionLevel=3&geoRegionId=1'),
    ]);
  } catch (err) {
    console.error('[australia_qld] API error:', err.message);
    return [];
  }

  // Build fuel type lookup: FuelId → internal fuelType
  const fuelMap = new Map();
  for (const f of (fuels.Fuels || [])) {
    const ft = mapQldFuel(f.Name);
    if (ft) fuelMap.set(f.FuelId, ft);
  }

  // Group prices by SiteId
  const pricesBysite = new Map();
  for (const p of (pricesData.SitePrices || [])) {
    const ft = fuelMap.get(p.FuelId);
    if (!ft) continue;
    const price = qldToEur(p.Price);
    if (!price) continue;
    if (!pricesBysite.has(p.SiteId)) pricesBysite.set(p.SiteId, []);
    const existing = pricesBysite.get(p.SiteId);
    if (!existing.find(x => x.fuelType === ft)) {
      existing.push({ fuelType: ft, price });
    }
  }

  // Build station list
  const stations = [];
  for (const s of (sitesData.S || [])) {
    const siteId = s.S;
    const lat = parseFloat(s.Lat);
    const lng = parseFloat(s.Lng);
    if (isNaN(lat) || isNaN(lng)) continue;

    const prices = pricesBysite.get(siteId);
    if (!prices || !prices.length) continue;

    stations.push({
      externalId: `AU-QLD-${siteId}`,
      name: s.N || `Station ${siteId}`,
      brand: null, // brand name needs separate /Subscriber/GetCountryBrands call if needed
      lat,
      lng,
      address: s.A || null,
      city: parseQldSuburb(s.A),
      country: 'AU',
      prices,
    });
  }

  console.log(`[australia_qld] ${stations.length} stations`);
  return stations;
}

module.exports = { fetchQLDStations };
