// Mexico fuel prices — CRE (Comisión Reguladora de Energía) XML feeds
//
// Places:  GET https://publicacionexterna.azurewebsites.net/publicaciones/places
//   <place place_id="2039">
//     <name>ESTACION HIPODROMO SA DE CV</name>
//     <cre_id>PL/658/EXP/ES/2015</cre_id>
//     <location><x>-116.9214</x><y>32.47641</y></location>
//   </place>
//
// Prices:  GET https://publicacionexterna.azurewebsites.net/publicaciones/prices
//   <place place_id="11703">
//     <gas_price type="regular">22.95</gas_price>
//     <gas_price type="premium">27.9</gas_price>
//     <gas_price type="diesel">27.99</gas_price>
//   </place>
//
// Both feeds update every 4 hours. No auth required.
// Prices in MXN/L — converted to EUR at fixed rate below.

const MXN_EUR = 1 / 21.5; // 1 EUR ≈ 21.5 MXN
const UA = 'Mozilla/5.0 (compatible; Gasify/1.0)';

function mxnToEur(val) {
  const n = parseFloat(val);
  if (isNaN(n) || n <= 0) return null;
  const eur = +(n * MXN_EUR).toFixed(3);
  return eur > 0.3 && eur < 6 ? eur : null;
}

function mapFuelType(type) {
  switch (type) {
    case 'regular': return 'sp95';
    case 'premium': return 'sp98';
    case 'diesel':  return 'diesel';
    default:        return null;
  }
}

// Parse places XML into Map<place_id, {name, lat, lng}>
function parsePlaces(xml) {
  const places = new Map();
  const re = /<place place_id="(\d+)">([\s\S]*?)<\/place>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const id = m[1];
    const body = m[2];
    const nameM = body.match(/<name>([^<]*)<\/name>/);
    const xM    = body.match(/<x>([^<]+)<\/x>/);
    const yM    = body.match(/<y>([^<]+)<\/y>/);
    if (!nameM || !xM || !yM) continue;
    const lat = parseFloat(yM[1]);
    const lng = parseFloat(xM[1]);
    if (isNaN(lat) || isNaN(lng)) continue;
    places.set(id, { name: nameM[1].trim(), lat, lng });
  }
  return places;
}

// Parse prices XML into Map<place_id, [{fuelType, price}]>
function parsePrices(xml) {
  const prices = new Map();
  const re = /<place place_id="(\d+)">([\s\S]*?)<\/place>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const id = m[1];
    const body = m[2];
    const fuelRe = /<gas_price type="([^"]+)">([^<]+)<\/gas_price>/g;
    let fm;
    while ((fm = fuelRe.exec(body)) !== null) {
      const ft = mapFuelType(fm[1]);
      const price = mxnToEur(fm[2]);
      if (!ft || !price) continue;
      if (!prices.has(id)) prices.set(id, new Map());
      const existing = prices.get(id);
      // Keep first valid price per fuel type (some place_ids appear twice)
      if (!existing.has(ft)) existing.set(ft, price);
    }
  }
  return prices;
}

async function fetchMexicoStations() {
  let placesXml, pricesXml;
  try {
    [placesXml, pricesXml] = await Promise.all([
      fetch('https://publicacionexterna.azurewebsites.net/publicaciones/places', {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(60000),
      }).then(r => { if (!r.ok) throw new Error(`places ${r.status}`); return r.text(); }),
      fetch('https://publicacionexterna.azurewebsites.net/publicaciones/prices', {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(60000),
      }).then(r => { if (!r.ok) throw new Error(`prices ${r.status}`); return r.text(); }),
    ]);
  } catch (err) {
    console.error('[mexico] fetch error:', err.message);
    return [];
  }

  const placeMap = parsePlaces(placesXml);
  const priceMap = parsePrices(pricesXml);

  const stations = [];
  for (const [id, priceEntry] of priceMap) {
    const place = placeMap.get(id);
    if (!place) continue;
    const prices = [...priceEntry.entries()].map(([fuelType, price]) => ({ fuelType, price }));
    if (!prices.length) continue;
    stations.push({
      externalId: `MX-CRE-${id}`,
      name: place.name,
      brand: null,
      lat: place.lat,
      lng: place.lng,
      address: null,
      city: '',
      country: 'MX',
      prices,
    });
  }

  console.log(`[mexico] ${stations.length} stations`);
  return stations;
}

module.exports = { fetchMexicoStations };
