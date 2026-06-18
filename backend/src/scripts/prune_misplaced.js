// Prune mis-tagged border stations created by the old bbox Overpass queries.
//
// For each area-fixed "Canada-model" country, fetch the OSM fuel stations strictly
// INSIDE its admin boundary and delete any of that country's rows whose OSM element
// isn't actually in the area (border-bleed — e.g. Koper/SI & Trieste/IT tagged "HR").
//
//   node src/scripts/prune_misplaced.js          # dry run (counts only)
//   node src/scripts/prune_misplaced.js --apply   # delete the bleed
require('dotenv').config();
const prisma = require('../lib/prisma');
const { overpassFuelByCountry } = require('../services/scrapers/_overpass');

// [iso, externalId-prefix] for every source whose stations use `...-OSM-<type>-<id>`.
const TARGETS = [
  ...['DE','BE','BG','CZ','EE','GR','HR','HU','IE','LT','LV','NL','PL','RO','SK','CY','MT','DK']
      .map(iso => [iso, `EUB-${iso}-OSM-`]),
  ...['MK','RS','ME','AL','CH','BA','AE','SA','KE','DO','UY','QA','KW','OM','BH','BN','EC']
      .map(iso => [iso, `REG-${iso}-OSM-`]),
  ['TR', 'EPDK-TR-OSM-'],
];

// 'EUB-HR-OSM-node-12345' -> 'node/12345'
function osmKey(extId) {
  const i = extId.indexOf('OSM-');
  if (i < 0) return null;
  const rest = extId.slice(i + 4);
  const dash = rest.indexOf('-');
  return dash < 0 ? null : `${rest.slice(0, dash)}/${rest.slice(dash + 1)}`;
}

(async () => {
  const apply = process.argv.includes('--apply');
  console.log(`[prune] mode: ${apply ? 'APPLY' : 'DRY RUN'} — ${TARGETS.length} countries`);
  let grand = 0, skipped = 0;
  for (const [iso, prefix] of TARGETS) {
    const els = await overpassFuelByCountry(iso, `prune ${iso}`);
    if (els === null) { console.warn(`  ${iso.padEnd(3)} area fetch FAILED — skip`); skipped++; continue; }
    const valid = new Set(els.map(e => `${e.type}/${e.id}`));
    const rows = await prisma.station.findMany({ where: { externalId: { startsWith: prefix } }, select: { id: true, externalId: true } });
    const stale = rows.filter(r => { const k = osmKey(r.externalId); return k && !valid.has(k); });
    // Safety: a near-empty area result would flag everything as bleed — almost certainly
    // an Overpass hiccup, not real. Skip pruning that country.
    if (valid.size < 5 || (rows.length > 50 && stale.length > rows.length * 0.97)) {
      console.warn(`  ${iso.padEnd(3)} ${prefix}: SUSPICIOUS (area=${valid.size}, rows=${rows.length}, stale=${stale.length}) — skip`);
      skipped++; continue;
    }
    console.log(`  ${iso.padEnd(3)} ${prefix}: rows ${rows.length}, in-area ${valid.size}, bleed ${stale.length}`);
    grand += stale.length;
    if (apply && stale.length) {
      for (let i = 0; i < stale.length; i += 500) {
        await prisma.station.deleteMany({ where: { id: { in: stale.slice(i, i + 500).map(s => s.id) } } });
      }
    }
  }
  console.log(`[prune] ${apply ? 'deleted' : 'would delete'} ${grand} mis-tagged stations (${skipped} countries skipped)`);
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
