// Dig into Preem prices page and OKQ8 sitemap, plus try more Nordic APIs
(async () => {
  // OKQ8 sitemap - find station/price related URLs
  const okq8xml = await fetch('https://www.okq8.se/sitemap.xml', {
    headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000)
  }).then(r => r.text()).catch(() => '');
  const okq8urls = [...okq8xml.matchAll(/<loc>([^<]*(?:station|macken|price|pris|tank)[^<]*)<\/loc>/gi)].map(m => m[1]).slice(0, 10);
  console.log('OKQ8 sitemap station URLs:', okq8urls);

  // Preem prices page - look for JSON or API calls
  const preemPrices = await fetch('https://www.preem.se/pa-stationen/drivmedel/drivmedelspriser/', {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' }, signal: AbortSignal.timeout(8000)
  }).then(r => r.text()).catch(() => '');
  const preemApis = [...preemPrices.matchAll(/["'](https?:\/\/[^"']*(?:api|price|station|fuel)[^"']{0,80})/gi)].map(m => m[1]).slice(0, 10);
  console.log('Preem prices API refs:', preemApis);
  // Also look for JSON data embedded
  const preemJson = preemPrices.match(/window\.__(?:INITIAL|NEXT|STATE|DATA)__\s*=\s*(\{.{0,500})/);
  if (preemJson) console.log('Preem embedded JSON:', preemJson[1].substring(0, 200));

  // Check drivstoffpriser.no source for API calls
  const drivstoff = await fetch('https://www.drivstoffpriser.no/', {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' }, signal: AbortSignal.timeout(8000)
  }).then(r => r.text()).catch(() => '');
  const drivstoffApis = [...drivstoff.matchAll(/["'](https?:\/\/[^"']*(?:api|station|price|data)[^"']{0,80})/gi)].map(m => m[1]).slice(0, 10);
  console.log('drivstoffpriser.no API refs:', drivstoffApis);
  // Find scripts
  const scripts = [...drivstoff.matchAll(/<script[^>]+src="([^"]+)"/gi)].map(m => m[1]).slice(0, 5);
  console.log('drivstoffpriser.no scripts:', scripts);

  await new Promise(r => setTimeout(r, 500));

  // Additional specific tests
  const tests = [
    // Spritpriser aggregators
    { name: 'spritpriser.se', url: 'https://www.spritpriser.se/api/stations' },
    { name: 'spritmonitor.de SE', url: 'https://www.spritmonitor.de/se/api/stations' },
    // Norwegian open data portal
    { name: 'data.norge.no fuel', url: 'https://data.norge.no/api/3/action/package_search?q=drivstoff' },
    // Forbrukerradet API (used by drivstoffpriser.no)
    { name: 'forbrukerradet api', url: 'https://api.forbrukerradet.no/drivstoff/v1/stations' },
    { name: 'forbrukerradet api2', url: 'https://api.forbrukerradet.no/fuel/stations' },
    // Norwegian power/fuel
    { name: 'tibber fuel', url: 'https://api.tibber.com/v1-beta/gql' },
    // Preem station locator (might return JSON with station coords)
    { name: 'Preem station locator', url: 'https://www.preem.se/api/station-locator' },
    // Commonly used Nordic aggregator
    { name: 'gasoil.no', url: 'https://gasoil.no/api/stations' },
    { name: 'billigstbensin.no', url: 'https://www.billigstbensin.no/api/stations' },
    // IDS Nordic (price comparison)
    { name: 'Ingo SE prices', url: 'https://www.ingo.se/priser/' },
    { name: 'MER SE', url: 'https://api.mer.eco/stations' },
  ];

  for (const t of tests) {
    try {
      const r = await fetch(t.url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json,text/html' },
        signal: AbortSignal.timeout(6000), redirect: 'follow',
      });
      const body = await r.text();
      const isJson = body.trim().startsWith('{') || body.trim().startsWith('[');
      const snippet = body.substring(0, 100).replace(/\s+/g, ' ');
      console.log(`${t.name}: ${r.status} | ${isJson ? 'JSON' : 'HTML'} | ${snippet}`);
    } catch (e) {
      console.log(`${t.name}: ERROR - ${e.message.substring(0, 60)}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
})();
