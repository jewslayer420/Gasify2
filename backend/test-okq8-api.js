// Test OKQ8 GetStationsBasedOnFilter API
(async () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

  // Try different parameter combinations
  const tests = [
    // GET with no params
    { method: 'GET', url: 'https://www.okq8.se/station/GetStationsBasedOnFilter/', body: null },
    // POST with empty body
    { method: 'POST', url: 'https://www.okq8.se/station/GetStationsBasedOnFilter/', body: '{}' },
    // POST with location/filter params
    { method: 'POST', url: 'https://www.okq8.se/station/GetStationsBasedOnFilter/', body: JSON.stringify({ location: { lat: 59.3, lng: 18.0 }, filters: [] }) },
    // GET with query params
    { method: 'GET', url: 'https://www.okq8.se/station/GetStationsBasedOnFilter/?location[lat]=59.3&location[lng]=18.0', body: null },
    // Try the Q8 subdomain
    { method: 'GET', url: 'https://www.q8.se/station/GetStationsBasedOnFilter/', body: null },
  ];

  for (const t of tests) {
    try {
      const opts = {
        method: t.method,
        headers: { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        signal: AbortSignal.timeout(8000),
      };
      if (t.body) opts.body = t.body;
      const r = await fetch(t.url, opts);
      const body = await r.text();
      const isJson = body.trim().startsWith('{') || body.trim().startsWith('[');
      const snippet = body.substring(0, 300).replace(/\s+/g, ' ');
      console.log(`${t.method} ${t.url.split('okq8.se')[1] || t.url.split('q8.se')[1]}: ${r.status} | ${isJson ? 'JSON' : 'HTML'} | ${snippet}`);
    } catch (e) {
      console.log(`${t.method} ${t.url.split('okq8.se')[1] || t.url}: ERROR - ${e.message.substring(0, 60)}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // Also check the FindStationPage chunk for more context around the API call
  const chunk = await fetch('https://www.okq8.se/dist/build-client/static/js/apps-web-pages-findStationPage-FindStationPage.a7ebacf7.chunk.js', {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000)
  }).then(r => r.text()).catch(() => '');

  // Find context around GetStationsBasedOnFilter
  const idx = chunk.indexOf('GetStationsBasedOnFilter');
  if (idx >= 0) {
    console.log('\nContext around API call:');
    console.log(chunk.substring(Math.max(0, idx - 300), idx + 300));
  }
})();
