// Diagnostic: test Phase 1 + Phase 2 for each fuelo.net subdomain
const TESTS = [
  { sub: 'me', lat1: 42.2, lat2: 42.4, lng1: 19.2, lng2: 19.6 },
  { sub: 'mk', lat1: 41.9, lat2: 42.1, lng1: 21.3, lng2: 21.7 },
  { sub: 'al', lat1: 41.2, lat2: 41.5, lng1: 19.7, lng2: 20.1 },
];

async function test(sub, lat1, lat2, lng1, lng2) {
  const phase1Url = `https://${sub}.fuelo.net/ajax/get_gasstations_within_bounds_mysql_clustering`;
  const phase2Base = `https://${sub}.fuelo.net/ajax/get_infowindow_content`;
  const body = `lat_min=${lat1}&lat_max=${lat2}&lon_min=${lng1}&lon_max=${lng2}&zoom=14`;

  // Phase 1
  let stationId = null;
  try {
    const r1 = await fetch(phase1Url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
      body, signal: AbortSignal.timeout(15000),
    });
    const t1 = await r1.text();
    let stations = [];
    try { stations = JSON.parse(t1)?.gasstations ?? []; } catch {}
    console.log(`[${sub}] Phase 1: HTTP ${r1.status}, ${stations.length} stations`);
    if (stations.length > 0) stationId = String(stations[0].id ?? '');
  } catch (err) {
    console.log(`[${sub}] Phase 1 FAILED: ${err.message}`);
    return;
  }

  if (!stationId) { console.log(`[${sub}] No station ID to test Phase 2`); return; }

  // Phase 2
  try {
    const r2 = await fetch(`${phase2Base}/${stationId}?lang=en`, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    const t2 = await r2.text();
    console.log(`[${sub}] Phase 2: HTTP ${r2.status}, response length ${t2.length}`);
    console.log(`[${sub}] Phase 2 first 300 chars: ${t2.slice(0, 300)}`);
  } catch (err) {
    console.log(`[${sub}] Phase 2 FAILED: ${err.message}`);
  }
}

(async () => {
  for (const { sub, lat1, lat2, lng1, lng2 } of TESTS) {
    await test(sub, lat1, lat2, lng1, lng2);
    console.log('---');
  }
})();
