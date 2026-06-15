// North Macedonia fuel prices — ERC (Регулаторна комисија за енергетика, the
// official Energy Regulatory Commission, erc.org.mk) publishes the regulated
// MAXIMUM retail prices on its homepage ("CeniLista" / current-prices table),
// adjusted ~every two weeks. We read that official table and apply it over OSM
// fuel stations (the "Canada model").
//
// WHY: replaces the mk.fuelo.net scraper (a private aggregator — legal blocker)
// with the official regulator's published price (a regulated fact).
//
// Prices are MKD/litre → EUR via open.er-api.com (denar is pegged ~61.5/EUR).
// NOTE: the old mk.fuelo dataset also carried some Kosovo stations; this replaces
// North Macedonia only (OSM MK bbox). Kosovo (ZRRE) is tracked separately.

const { UA, eurRate, toEur, fetchRegulatedStations } = require('./_balkan_common');

const ERC_URL = 'https://www.erc.org.mk/Default_en.aspx';
const MK_BBOX = [40.85, 20.45, 42.37, 23.04]; // [latMin, lngMin, latMax, lngMax]

function mapFuel(name) {
  const n = (name || '').toUpperCase();
  if (n.includes('FUEL OIL') || n.includes('EL-1') || n.includes('MAZUT') || n.includes('EXTRA LIGHT')) return null;
  if (n.includes('DIZEL') || n.includes('DIESEL')) return 'diesel';
  if (n.includes('98')) return 'sp98';
  if (n.includes('95')) return 'sp95';
  return null;
}

function stripTags(s) { return (s || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim(); }

async function fetchPrices() {
  const r = await fetch(ERC_URL, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`ERC HTTP ${r.status}`);
  const html = await r.text();

  const i = html.search(/id=["']CeniLista["']/i);
  if (i < 0) throw new Error('CeniLista block not found');
  const block = html.slice(i, i + 3000); // generous window covers the whole table

  // Extract <td> cells in order → pair as [name, price, name, price, ...].
  const cells = [...block.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => stripTags(m[1]));

  const rate = await eurRate('MKD');
  const prices = new Map();
  for (let c = 0; c + 1 < cells.length; c += 2) {
    const ft = mapFuel(cells[c]);
    if (!ft || prices.has(ft)) continue;
    const num = parseFloat((cells[c + 1].match(/[\d.,]+/) || [''])[0].replace(',', '.'));
    const eur = toEur(num, rate);
    if (eur) prices.set(ft, eur);
  }

  const list = [...prices.entries()].map(([fuelType, price]) => ({ fuelType, price }));
  console.log(`[nmacedonia-erc] ${list.map(p => `${p.fuelType}=${p.price}`).join(' ')} EUR/L (rate ${rate} MKD/EUR)`);
  return list;
}

async function fetchNorthMacedoniaStations() {
  let prices;
  try { prices = await fetchPrices(); }
  catch (err) { console.error('[nmacedonia-erc] price fetch error:', err.message); return []; }
  if (!prices.length) { console.warn('[nmacedonia-erc] no prices, skipping stations'); return []; }
  return fetchRegulatedStations('MK', MK_BBOX, prices, 'nmacedonia-erc');
}

module.exports = { fetchNorthMacedoniaStations, fetchPrices };
