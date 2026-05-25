// Test ST1 (operates in both NO + SE), OKQ8 (SE), YX/Uno-X (NO)
(async () => {
  const tests = [
    // ST1 - operates in Norway and Sweden
    { name: 'ST1 NO stations', url: 'https://www.st1.no/api/stations' },
    { name: 'ST1 SE stations', url: 'https://www.st1.se/api/stations' },
    { name: 'ST1 NO stationfinder', url: 'https://www.st1.no/stationfinder' },
    // OKQ8 Sweden
    { name: 'OKQ8 stations', url: 'https://www.okq8.se/api/v1/stations' },
    { name: 'OKQ8 priser', url: 'https://www.okq8.se/api/v1/prices' },
    // Preem Sweden
    { name: 'Preem stations', url: 'https://www.preem.se/api/stations' },
    // YX Norway
    { name: 'YX stations', url: 'https://yx.no/api/stations' },
    // Ingo Sweden (low-cost chain)
    { name: 'Ingo SE', url: 'https://www.ingo.se/api/stations' },
  ];
  for (const t of tests) {
    try {
      const r = await fetch(t.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Gasify/1.0)', Accept: 'application/json' },
        signal: AbortSignal.timeout(6000)
      });
      const body = await r.text();
      const isJson = body.trim().startsWith('{') || body.trim().startsWith('[');
      console.log(t.name + ':', r.status, isJson ? 'JSON len=' + body.length : 'HTML');
    } catch (e) {
      console.log(t.name + ': ERROR -', e.message.substring(0, 50));
    }
    await new Promise(r => setTimeout(r, 300));
  }
})();
