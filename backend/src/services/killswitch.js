// On-demand kill-switch for the 🟡 "commercial-terms unconfirmed" data sources.
//
// These sources are used pending written commercial permission (see
// docs/COMMERCIAL_TERMS_OUTREACH.md). If a provider objects, you can remove a source
// in seconds instead of editing code + redeploying:
//
//   1. Purge its rows NOW  →  POST /api/admin/kill/<slug>   (gone from the live map
//      on the next /geojson refresh, ≤10 min)  — or: node src/scripts/kill_source.js <slug>
//   2. Stop the nightly sync re-adding it  →  add <token> to the DISABLED_SCRAPERS env
//      var and redeploy. runSync() skips any label/slug listed there.
//
// Status: GET /api/admin/kill   (rows + whether each is sync-disabled).

const prisma = require('../lib/prisma');

// slug → how to find its rows (externalId prefix, else country) + the DISABLED_SCRAPERS
// token(s) that stop it re-syncing.
const KILLABLE = {
  chile:    { prefix: 'CL-CNE-', disable: ['chile'],     label: 'Chile (CNE)' },
  finland:  { country: 'FI',     disable: ['finland'],   label: 'Finland (polttoaine.net)' },
  slovenia: { prefix: 'SI-',     disable: ['slovenia'],  label: 'Slovenia (goriva.si)' },
  uk:       { prefix: 'GB-',     disable: ['uk'],        label: 'UK (fuelcosts.co.uk)' },
  vic:      { prefix: 'AU-VIC-', disable: ['vic'],       label: 'Australia VIC (Servo Saver)' },
  qld:      { prefix: 'AU-QLD-', disable: ['qld'],       label: 'Australia QLD (Informed Sources)' },
  // NSW is bundled inside the combined `australia` scraper, so its rows purge cleanly by
  // prefix, but stopping re-adds disables ALL of Australia (WA/NSW/TAS).
  nsw:      { prefix: 'AU-NSW-', disable: ['australia'], label: 'Australia NSW (FuelCheck) — disabling re-add stops ALL of Australia' },
};

function disabledSet() {
  return new Set((process.env.DISABLED_SCRAPERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
}

// Is a sync label/slug currently disabled via DISABLED_SCRAPERS? (checked in runSync)
function isDisabled(labelOrSlug) {
  return disabledSet().has(String(labelOrSlug).trim().toLowerCase());
}

function whereFor(cfg) {
  return cfg.prefix ? { externalId: { startsWith: cfg.prefix } } : { country: cfg.country };
}

async function killStatus() {
  const dis = disabledSet();
  const out = [];
  for (const [slug, cfg] of Object.entries(KILLABLE)) {
    const rows = await prisma.station.count({ where: whereFor(cfg) });
    out.push({ slug, label: cfg.label, rows, syncDisabled: cfg.disable.some(d => dis.has(d)) });
  }
  return out;
}

async function killSource(slug) {
  const cfg = KILLABLE[slug];
  if (!cfg) throw new Error(`Unknown source '${slug}'. Killable: ${Object.keys(KILLABLE).join(', ')}`);
  const { count } = await prisma.station.deleteMany({ where: whereFor(cfg) });
  const stillSyncs = !cfg.disable.some(d => disabledSet().has(d));
  console.log(`[killswitch] purged ${slug} (${cfg.label}): ${count} stations`);
  return {
    slug, label: cfg.label, purged: count,
    preventReadd: stillSyncs
      ? `⚠️ STILL SYNCS — add "${cfg.disable.join(',')}" to DISABLED_SCRAPERS env + redeploy to stop re-adds`
      : 'sync already disabled — will not re-add',
  };
}

module.exports = { KILLABLE, isDisabled, killSource, killStatus };
