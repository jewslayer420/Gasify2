// Cross-country price-staleness classifier for the sync monitor.
// Auto countries are judged by newest FuelPrice.updatedAt (tiered threshold);
// manual/regulated countries are judged by their asOf date (price_freshness.js).
const { priceFreshness } = require('./price_freshness');

const VOLATILE_HOURS = 48;    // per-station gov APIs — prices move constantly
const WEEKLY_HOURS = 288;     // 12d — national-avg / weekly sources
// FuelPrice.updatedAt only moves when a price CHANGES, so slow-moving countries
// (monthly Canada, an unchanged weekly bulletin) look "stale" despite healthy syncs.
// When a CountrySyncStatus row shows the sync ran recently, only alert if prices
// have been frozen past this sanity window (broken price parsing, not staleness).
const PRICE_SANITY_HOURS = 45 * 24;

// ISO-2 codes of the FAST (per-station) countries. UK stations are stored as 'GB'.
const VOLATILE_CC = new Set([
  'FR', 'ES', 'IT', 'PT', 'AT', 'SI', 'IS', 'FI', 'GB', 'LU', 'CL', 'TW', 'MX', 'AU',
]);

// Per-country overrides. null = muted (never alert). Argentina is unreachable from
// GitHub runner IPs, so it would otherwise cry wolf forever.
const STALE_OVERRIDE = { AR: null };

function thresholdHoursFor(cc) {
  if (Object.prototype.hasOwnProperty.call(STALE_OVERRIDE, cc)) return STALE_OVERRIDE[cc];
  return VOLATILE_CC.has(cc) ? VOLATILE_HOURS : WEEKLY_HOURS;
}

// Pure: given auto DB rows + manual freshness list + per-country last-sync rows,
// return the stale entries.
function classifyStale({ autoRows, manual, syncRows = [], now = Date.now() }) {
  const manualCCs = new Set(manual.map(m => m.cc));
  const lastSyncByCc = new Map(syncRows.map(s => [s.country, s.lastSyncAt]));
  const stale = [];

  for (const r of autoRows) {
    const cc = r.country;
    if (manualCCs.has(cc)) continue;            // manual handled below
    const thr = thresholdHoursFor(cc);
    if (thr === null) continue;                 // muted
    const ageH = r.last == null ? Infinity : (now - new Date(r.last).getTime()) / 3600000;
    const lastSync = lastSyncByCc.get(cc);
    if (lastSync != null) {
      // Sync tracking available: alert on the sync going quiet, or on prices
      // frozen past the sanity window despite fresh syncs.
      const syncAgeH = (now - new Date(lastSync).getTime()) / 3600000;
      if (syncAgeH > thr) stale.push({ cc, kind: 'auto', ageH: syncAgeH });
      else if (ageH > PRICE_SANITY_HOURS) stale.push({ cc, kind: 'auto', ageH });
    } else if (ageH > thr) {
      stale.push({ cc, kind: 'auto', ageH }); // legacy price-age fallback
    }
  }

  for (const m of manual) {
    if (m.stale) stale.push({ cc: m.cc, kind: 'manual', ageDays: m.ageDays, label: m.label });
  }

  return stale;
}

function formatStaleMessage(stale) {
  const parts = stale.map(s =>
    s.kind === 'auto'
      ? `${s.cc} ${s.ageH === Infinity ? 'never' : Math.round(s.ageH) + 'h'}`
      : `${s.cc} ${s.ageDays}d`
  );
  return `⚠️ Gasify: ${stale.length} countr${stale.length === 1 ? 'y' : 'ies'} stale — ${parts.join(', ')}`;
}

// Impure: query Neon, combine with manual freshness, classify.
async function computeStaleness(prisma, now = Date.now()) {
  let autoRows;
  try {
    autoRows = await prisma.$queryRaw`
      SELECT s.country AS country, MAX(fp."updatedAt") AS last
      FROM "Station" s JOIN "FuelPrice" fp ON fp."stationId" = s.id
      GROUP BY s.country`;
  } catch (e) {
    return { dbOk: false, stale: [], error: e.message };
  }
  let syncRows = [];
  try {
    syncRows = await prisma.$queryRaw`SELECT country, "lastSyncAt" FROM "CountrySyncStatus"`;
  } catch {
    // table not created yet — legacy price-age logic still applies
  }
  const manual = priceFreshness(now);
  return { dbOk: true, stale: classifyStale({ autoRows, manual, syncRows, now }) };
}

module.exports = {
  thresholdHoursFor, classifyStale, formatStaleMessage, computeStaleness,
  VOLATILE_CC, VOLATILE_HOURS, WEEKLY_HOURS, PRICE_SANITY_HOURS, STALE_OVERRIDE,
};
