// Probe specific APIs for Norway/Sweden
(async () => {
  // Check Preem sitemap for any price/station URLs
  const preem = await fetch('https://www.preem.se/sitemap.xml', {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/xml,application/xml' },
    signal: AbortSignal.timeout(8000)
  }).then(r => r.text()).catch(() => '');
  const preemUrls = [...preem.matchAll(/<loc>([^<]*(?:station|macken|price|pris)[^<]*)<\/loc>/gi)].map(m => m[1]).slice(0, 5);
  console.log('Preem sitemap station URLs:', preemUrls);

  // drivstoff.app HTML source - look for API URL
  const app = await fetch('https://drivstoff.app/', {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
    signal: AbortSignal.timeout(8000)
  }).then(r => r.text()).catch(() => '');
  const apiRefs = [...app.matchAll(/["'](https?:\/\/[^"']*(?:api|stations|fuel|gas)[^"']*)/gi)].map(m => m[1]).slice(0, 10);
  console.log('drivstoff.app API refs:', apiRefs);

  // Try specific Norwegian government APIs
  const tests = [
    { name: 'Konkurransetilsynet data', url: 'https://data.norge.no/api/3/action/datastore_search?resource_id=drivstoff' },
    { name: 'Shell NO stasjon', url: 'https://www.shell.no/motorister/finn-bensinstasjon/_jcr_content/root/main/section/list.model.json' },
    { name: 'Circle K NO stasjon JSON', url: 'https://www.circlek.no/api/stations' },
    { name: 'Circle K NO stasjon v2', url: 'https://www.circlek.no/stasjoner/?format=json' },
    { name: 'Esso NO stasjon', url: 'https://www.esso.no/nb-no/motorist/stasjonsfinner.html' },
    { name: 'Uno-X no wp stations', url: 'https://www.uno-x.no/?rest_route=/unox/v1/stations' },
    { name: 'Uno-X stasjon API 2', url: 'https://www.uno-x.no/wp-admin/admin-ajax.php?action=get_stations' },
    // Swedish specific
    { name: 'St1 SE price XML', url: 'https://www.st1.se/tankstationer/priser/' },
    { name: 'OKQ8 sitemap', url: 'https://www.okq8.se/sitemap.xml' },
    { name: 'Preem XML prices', url: 'https://www.preem.se/xml/prices' },
  ];

  for (const t of tests) {
    try {
      const r = await fetch(t.url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json,text/html,text/xml' },
        signal: AbortSignal.timeout(6000), redirect: 'follow',
      });
      const body = await r.text();
      const isJson = body.trim().startsWith('{') || body.trim().startsWith('[');
      const isXml = body.trim().startsWith('<') && body.includes('xml');
      const snippet = body.substring(0, 100).replace(/\s+/g, ' ');
      console.log(`${t.name}: ${r.status} | ${isJson ? 'JSON' : isXml ? 'XML' : 'HTML'} | ${snippet}`);
    } catch (e) {
      console.log(`${t.name}: ERROR - ${e.message.substring(0, 60)}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
})();
