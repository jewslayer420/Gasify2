// Deep probe Norwegian and Swedish APIs
(async () => {
  const tests = [
    // Norwegian Consumer Council drivstoffpriser - try different paths
    { name: 'drivstoffpriser.no home', url: 'https://www.drivstoffpriser.no/' },
    { name: 'drivstoffpriser stations', url: 'https://www.drivstoffpriser.no/stasjoner' },
    { name: 'drivstoffpriser bensin', url: 'https://www.drivstoffpriser.no/bensinstasjoner' },
    // Preem internal API paths
    { name: 'Preem station v1', url: 'https://www.preem.se/services/station-finder' },
    { name: 'Preem sitemap', url: 'https://www.preem.se/sitemap.xml' },
    // OKQ8 internal
    { name: 'OKQ8 v3 stations', url: 'https://www.okq8.se/api/v3/stations' },
    { name: 'OKQ8 hitta', url: 'https://www.okq8.se/priser-och-erbjudanden/drivmedelspriser/' },
    // ST1 station list APIs
    { name: 'ST1 NO stations list', url: 'https://www.st1.no/stasjoner/' },
    { name: 'ST1 SE stations list', url: 'https://www.st1.se/hitta-macken/' },
    { name: 'ST1 NO GQL', url: 'https://www.st1.no/graphql?query={stations{id,name,lat,lng}}' },
    // Uno-X (YX rebrand in 2022)
    { name: 'Uno-X stasjonsfinner', url: 'https://www.uno-x.no/stasjonsfinner/' },
    { name: 'Uno-X API', url: 'https://www.uno-x.no/wp-json/unox/v1/stations' },
    // Aral / BP Norway
    { name: 'BP NO stations', url: 'https://www.bp.com/en_no/norway/home/products-and-services/stations.html' },
    // Shell Norway
    { name: 'Shell NO stations', url: 'https://www.shell.no/motorister/finn-bensinstasjon.html' },
    // Tankstation aggregators
    { name: 'gasstasjon.no', url: 'https://gasstasjon.no/api/stations' },
    { name: 'bensinpris.no', url: 'https://bensinpris.no/api/stations' },
    // Competitor apps
    { name: 'drivstoff.app', url: 'https://drivstoff.app/api/stations' },
    // Swedish specific
    { name: 'Preem priser page', url: 'https://www.preem.se/privat/drivmedel/prislista/' },
    { name: 'tankpriser.se', url: 'https://tankpriser.se/api/stations' },
    { name: 'bilpriser.se', url: 'https://bilpriser.se/api/stations' },
  ];

  for (const t of tests) {
    try {
      const r = await fetch(t.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', Accept: 'application/json, text/html' },
        signal: AbortSignal.timeout(8000),
        redirect: 'follow',
      });
      const body = await r.text();
      const isJson = body.trim().startsWith('{') || body.trim().startsWith('[');
      const snippet = isJson ? body.substring(0, 150) : `(HTML ${body.length}B)`;
      console.log(`${t.name}: ${r.status} | ${isJson ? 'JSON' : 'HTML'} | ${snippet}`);
    } catch (e) {
      console.log(`${t.name}: ERROR - ${e.message.substring(0, 60)}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
})();
