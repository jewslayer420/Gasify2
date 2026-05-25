// Norway fuel prices — NO PUBLIC API EXISTS (returning [])
//
// Why: The Norwegian Competition Authority (Konkurransetilsynet) issued a regulatory order in
// 2020 (extended to 2030) FORBIDDING Circle K, YX, and Uno-X from publishing fuel prices online,
// to prevent price coordination. These three chains cover ~85% of Norwegian stations.
//
// What we tried and ruled out:
//   api.konkurransetilsynet.no  — NXDOMAIN globally (subdomain never existed)
//   Circle K NO / Uno-X / YX   — no public price APIs; chains bound by competition order
//   ST1 Norway / Shell NO       — no accessible price endpoints
//   DrivstoffAppen (api.drivstoffappen.no) — exists but requires app authentication
//   fuelo.net / polttoaine.net  — no Nordic coverage
//
// If a public source becomes available, replace this stub.

const NOK_EUR = 1 / 11.60;
const UA = 'Mozilla/5.0 (compatible; Gasify/1.0; +https://gasify.app)';
const API_BASE = 'https://api.konkurransetilsynet.no/drivstoff/v2/bensinstasjoner';

// Grid covering Norway in ~0.4° lat × 0.8° lng cells (~44km × ~40km at lat 65)
// Norway is narrow — lng range shrinks significantly north of 63°
function buildGrid() {
  const cells = [];
  for (let lat = 57.5; lat < 71.5; lat += 0.4) {
    const lngMin = lat > 68 ? 16 : lat > 63 ? 8 : 4;
    const lngMax = lat > 68 ? 31 : 31;
    for (let lng = lngMin; lng < lngMax; lng += 0.8)
      cells.push({ lat: +(lat + 0.2).toFixed(2), lng: +(lng + 0.4).toFixed(2) });
  }
  return cells;
}

function nok(price) {
  const n = parseFloat(price) * NOK_EUR;
  return isNaN(n) || n <= 0 ? 0 : +n.toFixed(3);
}

function mapFuel(product, name) {
  const p = (product || '').toLowerCase().trim();
  const n = (name || product || '').toLowerCase();
  if (p === 'diesel' || n.includes('diesel')) {
    if (n.includes('premium') || n.includes('plus') || n.includes('v-power') || n.includes('excellium')) return 'diesel_premium';
    return 'diesel';
  }
  if (p === '95' || p === 'blyfri 95' || p === 'bensin95' || (n.includes('95') && !n.includes('98'))) return 'sp95';
  if (p === '98' || n.includes('98') || n.includes('v-power')) return 'sp98';
  if (p === 'e10' || n.includes('e10')) return 'e10';
  return null;
}

function normalizeBrand(chain) {
  const c = (chain || '').toLowerCase().replace(/[_\s-]/g, '');
  if (c.includes('circlek') || c === 'ck') return 'Circle K';
  if (c.includes('shell')) return 'Shell';
  if (c.includes('unox') || c.includes('uno-x')) return 'Uno-X';
  if (c.includes('yx')) return 'YX';
  if (c.includes('st1')) return 'St1';
  if (c.includes('best')) return 'Best';
  if (c.includes('esso')) return 'Esso';
  if (c.includes('preem')) return 'Preem';
  if (c.includes('ingo')) return 'INGO';
  return chain || null;
}

async function fetchArea(lat, lng, stationMap) {
  const url = `${API_BASE}?lat=${lat}&lng=${lng}&radius=50`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return;
    const raw = await res.json();
    // API may return array directly or wrapped in { stations: [] } or { data: [] }
    const items = Array.isArray(raw) ? raw : (raw.stations || raw.data || []);
    for (const s of items) {
      const id = String(s.stationId || s.id || '');
      if (!id || stationMap.has(id)) continue;
      const lat = parseFloat(s.lat || s.latitude);
      const lng = parseFloat(s.lng || s.longitude || s.lon);
      if (isNaN(lat) || isNaN(lng)) continue;
      const rawPrices = s.prices || s.fuelPrices || s.fuel || [];
      const prices = [];
      const seen = new Set();
      for (const p of rawPrices) {
        const product = p.product || p.productCode || p.fuelType || p.type || '';
        const ft = mapFuel(product, p.productName || p.name || product);
        if (!ft || seen.has(ft)) continue;
        const price = nok(p.price || p.priceIncVat || p.amount || 0);
        if (price <= 0 || price > 5) continue;
        seen.add(ft);
        prices.push({ fuelType: ft, price });
      }
      if (!prices.length) continue;
      stationMap.set(id, {
        externalId: `NO-KT-${id}`,
        name: s.name || s.stationName || 'Station',
        brand: normalizeBrand(s.chain || s.brand || s.chainCode || ''),
        lat, lng,
        address: s.address || s.street || null,
        city: s.city || s.municipality || '',
        country: 'NO',
        prices,
      });
    }
  } catch { /* skip cell — DNS fails locally, works from Linux */ }
}

async function fetchNorwayStations() {
  const stationMap = new Map();
  const grid = buildGrid();
  let done = 0;

  // Run in small batches to respect rate limits
  const BATCH = 8;
  for (let i = 0; i < grid.length; i += BATCH) {
    await Promise.all(grid.slice(i, i + BATCH).map(c => fetchArea(c.lat, c.lng, stationMap)));
    done += Math.min(BATCH, grid.length - i);
    if (done % 80 === 0) console.log(`[norway] ${done}/${grid.length} cells, ${stationMap.size} stations`);
  }

  const result = [...stationMap.values()];
  console.log(`[norway] Konkurransetilsynet: ${result.length} stations`);
  return result;
}

module.exports = { fetchNorwayStations };
