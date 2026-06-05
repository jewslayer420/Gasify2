// Chile fuel prices — CNE "Bencina en Línea" official API (api.cne.cl)
//
// Auth:  POST https://api.cne.cl/api/login  { email, password }  → { token }
//        Then send  Authorization: Bearer <token>  on subsequent calls.
//        No static API key exists — a registered account's credentials mint a token.
// env:   CL_CNE_EMAIL, CL_CNE_PASSWORD  (free registration at https://api.cne.cl/register)
//
// Stations: GET https://api.cne.cl/api/v4/estaciones
//   [ { codigo, razon_social, distribuidor: { marca },
//       ubicacion: { nombre_region, nombre_comuna, direccion, latitud, longitud },
//       precios: { "93": { precio: "1664.000", unidad_cobro: "$/L" }, "95": {...},
//                  "97": {...}, "DI": {...diesel}, "KE": {...kerosene},
//                  "A93"/"A95"/"A97"/"ADI": self-service variants, "GLP"/"GNC": $/m3 } } ]
//   ~2,056 stations, all georeferenced. Prices in CLP/L (e.g. 1502.0 = $1502/L).
//
// Chile gasoline grades are 93/95/97 RON — mapped to the app's sp95/sp98/sp100 buckets
// (93 = the common base grade → sp95). Kerosene/GLP/GNC are skipped (no app bucket / m3 unit).

const CLP_EUR = 1 / 1050; // 1 EUR ≈ 1050 CLP
const BASE = 'https://api.cne.cl';
const UA = 'Mozilla/5.0 (compatible; Gasify/1.0)';

// CNE precio key → internal fuelType (preferring attended price, falling back to A* self-service)
const FUEL_MAP = [
  { keys: ['DI', 'ADI'],  fuelType: 'diesel' },
  { keys: ['93', 'A93'],  fuelType: 'sp95'   },
  { keys: ['95', 'A95'],  fuelType: 'sp98'   },
  { keys: ['97', 'A97'],  fuelType: 'sp100'  },
];

function clpToEur(val) {
  const n = parseFloat(val);
  if (isNaN(n) || n <= 0) return null;
  const eur = +(n * CLP_EUR).toFixed(3);
  return eur > 0.2 && eur < 6 ? eur : null;
}

async function login(email, password) {
  const r = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`login ${r.status}`);
  const data = await r.json();
  if (!data.token) throw new Error('login returned no token');
  return data.token;
}

async function fetchChileStations() {
  const email = process.env.CL_CNE_EMAIL;
  const password = process.env.CL_CNE_PASSWORD;
  if (!email || !password) {
    console.log('[chile] skipped — CL_CNE_EMAIL / CL_CNE_PASSWORD not set (register at api.cne.cl)');
    return [];
  }

  let list;
  try {
    const token = await login(email, password);
    const r = await fetch(`${BASE}/api/v4/estaciones`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(90000),
    });
    if (!r.ok) throw new Error(`estaciones ${r.status}`);
    list = await r.json();
  } catch (err) {
    console.error('[chile] API error:', err.message);
    return [];
  }

  if (!Array.isArray(list)) {
    console.error('[chile] unexpected response shape');
    return [];
  }

  // codigo repeats across records (~128 dups) — dedupe by codigo, merging prices.
  const stationMap = new Map();
  for (const s of list) {
    const u = s.ubicacion || {};
    const lat = parseFloat(u.latitud);
    const lng = parseFloat(u.longitud);
    if (isNaN(lat) || isNaN(lng)) continue;

    let st = stationMap.get(s.codigo);
    if (!st) {
      st = {
        externalId: `CL-CNE-${s.codigo}`,
        name: s.razon_social || s.distribuidor?.marca || 'Estación de Servicio',
        brand: s.distribuidor?.marca || null,
        lat,
        lng,
        address: (u.direccion || '').trim() || null,
        city: u.nombre_comuna || '',
        country: 'CL',
        _prices: new Map(),
      };
      stationMap.set(s.codigo, st);
    }

    const precios = s.precios || {};
    for (const { keys, fuelType } of FUEL_MAP) {
      if (st._prices.has(fuelType)) continue;
      for (const k of keys) {
        if (precios[k]?.precio != null) {
          const price = clpToEur(precios[k].precio);
          if (price) { st._prices.set(fuelType, price); break; }
        }
      }
    }
  }

  const stations = [];
  for (const st of stationMap.values()) {
    const prices = [...st._prices.entries()].map(([fuelType, price]) => ({ fuelType, price }));
    if (!prices.length) continue;
    const { _prices, ...rest } = st;
    stations.push({ ...rest, prices });
  }

  console.log(`[chile] ${stations.length} stations`);
  return stations;
}

module.exports = { fetchChileStations };
