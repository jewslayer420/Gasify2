// Iceland fuel prices — Gasvaktin open-source aggregator
// Source: https://github.com/gasvaktin/gasvaktin
// JSON:   https://raw.githubusercontent.com/gasvaktin/gasvaktin/master/vaktin/gas.json
// Updated every 15 min by GitHub Actions — no auth required
// Companies: Atlantsolía, Costco Iceland, N1, ÓB, Olís, Orkan (~246 stations)

const ISK_EUR = 1 / 147; // 1 EUR ≈ 147 ISK (May 2026)
const UA = 'Mozilla/5.0 (compatible; Gasify/1.0; +https://gasify.app)';

function iskToEur(price) {
  if (!price || isNaN(price)) return null;
  const eur = +(price * ISK_EUR).toFixed(3);
  return eur > 0 && eur < 6 ? eur : null;
}

async function fetchIcelandStations() {
  let data;
  try {
    const r = await fetch(
      'https://raw.githubusercontent.com/gasvaktin/gasvaktin/master/vaktin/gas.json',
      { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) }
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    data = await r.json();
  } catch (err) {
    console.error('[iceland] fetch error:', err.message);
    return [];
  }

  const stations = [];
  for (const s of (data.stations || [])) {
    const lat = s.geo?.lat;
    const lng = s.geo?.lon;
    if (!lat || !lng) continue;

    const prices = [];
    // Use discount price when available (loyalty card / app price)
    const p95 = iskToEur(s.bensin95_discount ?? s.bensin95);
    const diesel = iskToEur(s.diesel_discount ?? s.diesel);
    if (p95) prices.push({ fuelType: 'sp95', price: p95 });
    if (diesel) prices.push({ fuelType: 'diesel', price: diesel });
    if (!prices.length) continue;

    stations.push({
      externalId: `IS-GV-${s.key}`,
      name: s.name,
      brand: s.company || null,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      address: null,
      city: '',
      country: 'IS',
      prices,
    });
  }

  console.log(`[iceland] ${stations.length} stations`);
  return stations;
}

module.exports = { fetchIcelandStations };
