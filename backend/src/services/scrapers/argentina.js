// Argentina fuel prices — Secretaría de Energía open data (datos.energia.gob.ar)
//
// Dataset: "Precios en Surtidor - Resolución 314/2016" (current/vigentes prices).
//   Operators must report retail prices within 8h of any change.
//   CSV columns (parsed by header name, order-independent):
//     empresa, direccion, localidad, provincia, producto, precio,
//     idtipohorario/tipohorario, idempresabandera/empresabandera, latitud, longitud, …
//   producto values: "Nafta (súper) entre 92 y 95 Ron", "Nafta (premium) de más de 95 Ron",
//                    "Gas Oil Grado 2", "Gas Oil Grado 3", "GNC". Prices in ARS/litro.
//
// ⚠ The file host (datos.energia.gob.ar) appears geo-restricted to Argentina — it may not be
//   reachable from non-AR servers. On failure this returns [] harmlessly.
// ARS is volatile, so the EUR rate is fetched live (fallback constant) rather than hardcoded.

const CSV_URL = 'http://datos.energia.gob.ar/dataset/1c181390-5045-475e-94dc-410429be4b17/resource/80ac25de-a44a-4445-9215-090cf55cfda5/download/precios-en-surtidor-resolucin-3142016.csv';
const FX_URL = 'https://open.er-api.com/v6/latest/EUR';
const ARS_EUR_FALLBACK = 1 / 1500; // 1 EUR ≈ 1500 ARS (used only if live FX fails)
const UA = 'Mozilla/5.0 (compatible; Gasify/1.0)';

function mapProducto(producto) {
  const p = (producto || '').toLowerCase();
  if (p.includes('gas oil') && p.includes('grado 3')) return 'diesel_premium';
  if (p.includes('gas oil')) return 'diesel';
  if (p.includes('premium') && p.includes('nafta')) return 'sp98';
  if (p.includes('nafta')) return 'sp95';
  if (p.includes('gnc')) return 'cng';
  return null;
}

// Minimal CSV line splitter handling quoted fields with embedded commas.
function splitCSV(line) {
  const out = [];
  let field = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i + 1] === '"') { field += '"'; i++; } else inQ = !inQ; }
    else if (c === ',' && !inQ) { out.push(field); field = ''; }
    else field += c;
  }
  out.push(field);
  return out;
}

// Find a header index by trying several candidate names (case-insensitive).
function col(headers, ...names) {
  for (const n of names) {
    const i = headers.indexOf(n);
    if (i !== -1) return i;
  }
  return -1;
}

async function getArsRate() {
  try {
    const r = await fetch(FX_URL, { signal: AbortSignal.timeout(15000) });
    if (r.ok) {
      const j = await r.json();
      const ars = j?.rates?.ARS;
      if (ars && ars > 0) return 1 / ars;
    }
  } catch { /* fall through */ }
  return ARS_EUR_FALLBACK;
}

async function fetchArgentinaStations() {
  let text, arsEur;
  try {
    [text, arsEur] = await Promise.all([
      fetch(CSV_URL, { headers: { 'User-Agent': UA, Accept: 'text/csv,*/*' }, signal: AbortSignal.timeout(120000) })
        .then(r => { if (!r.ok) throw new Error(`CSV ${r.status}`); return r.text(); }),
      getArsRate(),
    ]);
  } catch (err) {
    console.error('[argentina] fetch error:', err.message);
    return [];
  }

  const arsToEur = (val) => {
    const n = parseFloat(String(val).replace(',', '.'));
    if (isNaN(n) || n <= 0) return null;
    const eur = +(n * arsEur).toFixed(3);
    return eur > 0.2 && eur < 6 ? eur : null;
  };

  const lines = text.split('\n');
  if (lines.length < 2) { console.error('[argentina] empty CSV'); return []; }
  const headers = splitCSV(lines[0].trim()).map(h => h.trim().toLowerCase());

  const iEmpresa  = col(headers, 'empresa', 'razon_social');
  const iDir      = col(headers, 'direccion');
  const iLoc      = col(headers, 'localidad');
  const iProducto = col(headers, 'producto');
  const iPrecio   = col(headers, 'precio');
  const iHorario  = col(headers, 'idtipohorario', 'tipohorario');
  const iBandera  = col(headers, 'empresabandera', 'idempresabandera', 'bandera');
  const iLat      = col(headers, 'latitud', 'lat');
  const iLng      = col(headers, 'longitud', 'lng');
  const iId       = col(headers, 'idempresa', 'cuit');

  if (iLat === -1 || iLng === -1 || iPrecio === -1 || iProducto === -1) {
    console.error('[argentina] unexpected CSV header:', headers.join(','));
    return [];
  }

  // One station = one (idempresa + lat/lng). Keep one price per fuel type (prefer daytime "1").
  const stationMap = new Map();
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (!row) continue;
    const f = splitCSV(row);
    const lat = parseFloat(f[iLat]);
    const lng = parseFloat(f[iLng]);
    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) continue;

    const fuelType = mapProducto(f[iProducto]);
    if (!fuelType) continue;
    const price = arsToEur(f[iPrecio]);
    if (!price) continue;

    const horario = iHorario !== -1 ? String(f[iHorario]).trim().toLowerCase() : '';
    const isNight = horario.includes('noct') || horario === '2';

    const key = `${iId !== -1 ? f[iId] : ''}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
    if (!stationMap.has(key)) {
      stationMap.set(key, {
        externalId: `AR-${(iId !== -1 ? f[iId] : '') || `${lat.toFixed(5)}_${lng.toFixed(5)}`}`,
        name: (iEmpresa !== -1 && f[iEmpresa]) || (iBandera !== -1 && f[iBandera]) || 'Estación de Servicio',
        brand: iBandera !== -1 ? (f[iBandera] || null) : null,
        lat, lng,
        address: iDir !== -1 ? (f[iDir]?.trim() || null) : null,
        city: iLoc !== -1 ? (f[iLoc]?.trim() || '') : '',
        country: 'AR',
        _prices: new Map(),
      });
    }
    const st = stationMap.get(key);
    // Prefer daytime price; only let a night price fill a gap.
    if (!st._prices.has(fuelType) || !isNight) st._prices.set(fuelType, price);
  }

  const stations = [];
  for (const st of stationMap.values()) {
    const prices = [...st._prices.entries()].map(([fuelType, price]) => ({ fuelType, price }));
    if (!prices.length) continue;
    const { _prices, ...rest } = st;
    stations.push({ ...rest, prices });
  }

  console.log(`[argentina] ${stations.length} stations (ARS/EUR=${(1 / arsEur).toFixed(0)})`);
  return stations;
}

module.exports = { fetchArgentinaStations };
