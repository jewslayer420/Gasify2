// Test Norway and Sweden fuel price APIs
(async () => {
  const tests = [
    // Norwegian government / consumer council
    { name: 'Forbrukerradet drivstoff', url: 'https://www.drivstoffpriser.no/api/stations' },
    { name: 'Forbrukerradet drivstoff2', url: 'https://api.drivstoffpriser.no/v1/stations' },
    { name: 'bensinpriser.no API', url: 'https://bensinpriser.no/api/stations' },
    { name: 'bensinpriser.no prices', url: 'https://api.bensinpriser.no/prices' },
    // Norwegian chains — alternate API paths
    { name: 'YX/Uno-X stations', url: 'https://www.uno-x.no/api/stations' },
    { name: 'YX stationfinder', url: 'https://www.yx.no/stasjoner/' },
    { name: 'Preem SE stations', url: 'https://www.preem.se/privat/drivmedel/prissida/' },
    { name: 'Preem SE API', url: 'https://api.preem.se/stations' },
    // Circle K Norway/Sweden app APIs (different from EU prices endpoint)
    { name: 'CK NO app', url: 'https://app.circlek.no/api/stations' },
    { name: 'CK SE app', url: 'https://app.circlek.se/api/stations' },
    { name: 'CK Nordic prices', url: 'https://www.circlek.no/api/stations' },
    // ST1 alternative paths
    { name: 'ST1 NO find', url: 'https://www.st1.no/api/find-stations' },
    { name: 'ST1 SE find', url: 'https://www.st1.se/api/find-stations' },
    // OKQ8
    { name: 'OKQ8 find', url: 'https://www.okq8.se/hitta-macken/' },
    { name: 'OKQ8 API v2', url: 'https://www.okq8.se/api/v2/stations' },
    // Swedish authority
    { name: 'Drivmedelspriser SE', url: 'https://www.drivmedelspriser.se/api/stations' },
    // Waze/HERE/Google station aggregators for NO/SE - skip (require API keys)
    // Tankservice.no
    { name: 'tankservice.no', url: 'https://www.tankservice.no/api/stations' },
    // Norwegian fuel price report (Drivstoffpriser fra NAF)
    { name: 'NAF drivstoff', url: 'https://www.naf.no/verktoy-og-tjenester/drivstoffpriser/api/' },
    // MobilePay/Vipps fuel integrations
    { name: 'esso NO API', url: 'https://www.esso.no/api/stations' },
  ];

  for (const t of tests) {
    try {
      const r = await fetch(t.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Gasify/1.0)', Accept: 'application/json, text/html' },
        signal: AbortSignal.timeout(6000),
        redirect: 'follow',
      });
      const body = await r.text();
      const isJson = body.trim().startsWith('{') || body.trim().startsWith('[');
      const snippet = isJson ? body.substring(0, 120) : body.substring(0, 60).replace(/\s+/g, ' ');
      console.log(`${t.name}: ${r.status} | ${isJson ? 'JSON len=' + body.length : 'HTML'} | ${snippet}`);
    } catch (e) {
      console.log(`${t.name}: ERROR - ${e.message.substring(0, 60)}`);
    }
    await new Promise(r => setTimeout(r, 400));
  }
})();
