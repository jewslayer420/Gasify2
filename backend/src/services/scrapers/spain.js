// Spain fuel prices via official government API — no API key needed
// Single call returns all ~11,400 stations with current prices
const API_URL = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';

function parsePrice(str) {
  if (!str) return null;
  const n = parseFloat(str.replace(',', '.'));
  return (!isNaN(n) && n > 0) ? n : null;
}

function parseCoord(str) {
  return parseFloat(str.replace(',', '.'));
}

const PRICE_FIELDS = [
  { field: 'Precio Gasoleo A',              db: 'diesel' },
  { field: 'Precio Gasoleo Premium',        db: 'diesel_premium' },
  { field: 'Precio Gasolina 95 E5',         db: 'sp95' },
  { field: 'Precio Gasolina 95 E10',        db: 'e10' },
  { field: 'Precio Gasolina 98 E5',         db: 'sp98' },
  { field: 'Precio Gases licuados del petróleo', db: 'lpg' },
  { field: 'Precio Gas Natural Comprimido', db: 'cng' },
];

async function fetchSpainStations() {
  const res = await fetch(API_URL, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`Spain API ${res.status}`);
  const data = await res.json();
  const list = data.ListaEESSPrecio || [];

  const stations = [];
  for (const s of list) {
    const lat = parseCoord(s['Latitud']);
    const lng = parseCoord(s['Longitud (WGS84)']);
    if (isNaN(lat) || isNaN(lng)) continue;

    const prices = [];
    for (const { field, db } of PRICE_FIELDS) {
      const p = parsePrice(s[field]);
      if (p) prices.push({ fuelType: db, price: p });
    }
    if (!prices.length) continue;

    stations.push({
      externalId: `ES-${s['IDEESS']}`,
      name: s['Rótulo'] || s['Localidad'] || `Station ${s['IDEESS']}`,
      brand: s['Rótulo'] || null,
      lat, lng,
      address: s['Dirección'] || null,
      city: s['Localidad'] || s['Municipio'] || '',
      country: 'ES',
      prices,
    });
  }

  console.log(`[spain] Done — ${stations.length} stations`);
  return stations;
}

module.exports = { fetchSpainStations };
