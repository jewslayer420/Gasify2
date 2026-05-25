// Investigate OKQ8 API auth and location format
(async () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

  // Step 1: Get cookies from main OKQ8 page
  const mainResp = await fetch('https://www.okq8.se/', {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000)
  });
  const cookies = mainResp.headers.get('set-cookie') || '';
  console.log('Main page cookies:', cookies.substring(0, 200));

  // Step 2: Look for CSRF token in HTML
  const mainHtml = await mainResp.text();
  const csrf = mainHtml.match(/(?:csrf|_token|XSRF)[^>]{0,100}/i);
  console.log('CSRF:', csrf ? csrf[0].substring(0, 100) : 'none');
  const antiforgery = mainHtml.match(/RequestVerificationToken[^>]{0,100}/i);
  console.log('AntiForgery:', antiforgery ? antiforgery[0] : 'none');

  // Step 3: Try chunk 42629 (qH function)
  const chunkUrl = 'https://www.okq8.se/dist/build-client/static/js/9629.ba531658.chunk.js';
  const chunk42 = await fetch(chunkUrl, {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000)
  }).then(r => r.text()).catch(e => { console.log('chunk err:', e.message); return ''; });
  console.log('\nChunk 9629 size:', chunk42.length);
  const urls42 = [...chunk42.matchAll(/["'`](https?:\/\/[^"'`\s]{10,80})/g)].map(m => m[1]).filter(u => !u.includes('w3.org'));
  console.log('URLs in 9629:', urls42);
  const paths42 = [...chunk42.matchAll(/["'`](\/[a-z][^"'`\n\s]{5,60})/g)].map(m => m[1]).filter(p => p.includes('api') || p.includes('station') || p.includes('fuel'));
  console.log('API paths in 9629:', paths42);

  // Step 4: Try the station page with cookies and various location formats
  const headers = {
    'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest', 'Referer': 'https://www.okq8.se/hitta-macken/', 'Origin': 'https://www.okq8.se',
    Cookie: cookies,
  };

  // Try with ALL stations parameter
  const testBodies = [
    { filters: [], location: 'Stockholm, Sweden', stationId: '', type: '', language: 'sv-SE', siteId: 'okq8' },
    { filters: null, location: null, stationId: null, type: null, language: 'sv-SE', siteId: 'okq8' },
    { language: 'sv-SE', siteId: 'okq8', page: 1, pageSize: 100 },
    { language: 'sv-SE', siteId: 'okq8', latitude: 59.329, longitude: 18.068, radius: 1000 },
    { language: 'sv-SE', siteId: 'okq8', userLocation: { lat: 59.329, lng: 18.068 } },
    { filters: [], language: 'sv-SE', siteId: 'okq8', coordinates: '59.329,18.068' },
  ];

  for (const body of testBodies) {
    try {
      const r = await fetch('https://www.okq8.se/station/GetStationsBasedOnFilter/', {
        method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
      });
      const resp = await r.json();
      const count = resp?.data?.stations?.length || 0;
      console.log(`\n[${JSON.stringify(body).substring(0, 70)}...]: ${r.status} | stations=${count} | ${JSON.stringify(resp).substring(0, 150)}`);
    } catch (e) {
      console.log(`ERROR: ${e.message.substring(0, 60)}`);
    }
    await new Promise(r => setTimeout(r, 800));
  }
})();
