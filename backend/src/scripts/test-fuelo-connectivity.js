// Diagnostic: test which fuelo.net subdomains are reachable and return data
const SUBDOMAINS = ['me', 'mk', 'al', 'ba', 'bg', 'gr'];

async function testSubdomain(sub) {
  const url = `https://${sub}.fuelo.net/ajax/get_gasstations_within_bounds_mysql_clustering`;
  const body = 'lat_min=41&lat_max=42&lon_min=19&lon_max=21&zoom=14';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
      body, signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let stationCount = 0;
    try { stationCount = JSON.parse(text)?.gasstations?.length ?? 0; } catch {}
    console.log(`[${sub}.fuelo.net] HTTP ${res.status} — ${stationCount} stations in test cell`);
  } catch (err) {
    console.log(`[${sub}.fuelo.net] FAILED: ${err.message}`);
  }
}

(async () => {
  for (const sub of SUBDOMAINS) await testSubdomain(sub);
})();
