// Luxembourg fuel prices via carbu.com — all stations, prices scraped from HTML data-attributes
// Luxembourg has government-regulated maximum prices; carbu.com reflects these.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const BASE = 'https://carbu.com';

// 5 query hubs spread across Luxembourg to maximise coverage
const LOCATIONS = [
  { city: 'Luxembourg',       pc: '1009', id: 'LU_lx_2879' },
  { city: 'Esch-sur-alzette', pc: '4001', id: 'LU_lx_4313' },
  { city: 'Ettelbruck',       pc: '9001', id: 'LU_di_6718' },
  { city: 'Echternach',       pc: '6401', id: 'LU_gr_5543' },
  { city: 'Wiltz',            pc: '9501', id: 'LU_di_7030' },
];

// carbu.com fuel codes → our internal types
const FUEL_MAP = { GO: 'diesel', E10: 'sp95', SP98: 'sp98' };

const BRAND_MAP = {
  esso: 'Esso', shell: 'Shell', total: 'Total', totalfit: 'Total',
  q8: 'Q8', bp: 'BP', texaco: 'Texaco', avia: 'Avia', tamoil: 'Tamoil',
  jet: 'JET', api: 'API', intermarche: 'Intermarché', carrefour: 'Carrefour',
  cora: 'Cora', louis: 'Louis',
};

function brandFromLogo(logo) {
  const key = (logo || '').replace('.gif', '').toLowerCase();
  return BRAND_MAP[key] || null;
}

function parseAddress(raw) {
  const clean = raw.replace(/<br\s*\/?>/gi, '|').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&apos;/g, "'");
  const parts = clean.split('|');
  const street = (parts[0] || '').trim() || null;
  const rest = (parts[1] || '').trim();
  const spaceIdx = rest.indexOf(' ');
  const city = spaceIdx > 0 ? rest.slice(spaceIdx + 1).trim() : rest;
  return { street, city };
}

function parseItems(html) {
  const items = [];
  // Match each id="item_XXXX" block up to its closing class="stationItem" attr
  const blockRe = /id="item_(\d+)"([\s\S]*?)class="stationItem/g;
  let m;
  while ((m = blockRe.exec(html)) !== null) {
    const id = m[1];
    const block = m[2];
    const get = (attr) => { const a = block.match(new RegExp(`data-${attr}="([^"]*)"`)); return a ? a[1] : ''; };
    const lat = parseFloat(get('lat'));
    const lng = parseFloat(get('lng'));
    const price = parseFloat(get('price'));
    if (isNaN(lat) || isNaN(lng) || isNaN(price) || price <= 0) continue;
    items.push({ id, lat, lng, name: get('name'), logo: get('logo'), price, address: get('address') });
  }
  return items;
}

async function fetchPage(loc, fuelCode) {
  const url = `${BASE}/luxembourg/liste-stations-service/${fuelCode}/${encodeURIComponent(loc.city)}/${loc.pc}/${loc.id}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: BASE + '/luxembourg/', Accept: 'text/html' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return '';
    return res.text();
  } catch { return ''; }
}

async function fetchLuxembourgStations() {
  // Map: stationId → { base info + Map<fuelType, price> }
  const stationMap = new Map();

  for (const loc of LOCATIONS) {
    for (const [fuelCode, fuelType] of Object.entries(FUEL_MAP)) {
      const html = await fetchPage(loc, fuelCode);
      for (const item of parseItems(html)) {
        if (!stationMap.has(item.id)) {
          const { street, city } = parseAddress(item.address);
          stationMap.set(item.id, {
            externalId: `LU-CARBU-${item.id}`,
            name: item.name || 'Station',
            brand: brandFromLogo(item.logo),
            lat: item.lat,
            lng: item.lng,
            address: street,
            city,
            country: 'LU',
            prices: new Map(),
          });
        }
        stationMap.get(item.id).prices.set(fuelType, +item.price.toFixed(3));
      }
      await new Promise(r => setTimeout(r, 400));
    }
  }

  const result = [];
  for (const s of stationMap.values()) {
    const prices = [...s.prices.entries()].map(([fuelType, price]) => ({ fuelType, price }));
    if (!prices.length) continue;
    result.push({ ...s, prices });
  }

  console.log(`[luxembourg] carbu.com: ${result.length} stations`);
  return result;
}

module.exports = { fetchLuxembourgStations };
