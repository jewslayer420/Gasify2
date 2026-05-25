// Analyze OKQ8 FindStationPage and StationPage chunks for API endpoints
(async () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';
  const base = 'https://www.okq8.se/dist/build-client/static/js/';

  const chunks = [
    'apps-web-pages-findStationPage-FindStationPage.a7ebacf7.chunk.js',
    'apps-web-pages-stationPage-StationPage.779bc9c0.chunk.js',
    '4769.52669fc6.chunk.js',  // referenced for StationCard
    '3325.53d28dbe.chunk.js',  // referenced for StationCard
  ];

  for (const chunk of chunks) {
    const js = await fetch(base + chunk, {
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000)
    }).then(r => r.text()).catch(e => { console.log(chunk + ' err:', e.message); return ''; });
    console.log(`\n=== ${chunk} (${js.length} bytes) ===`);

    // URLs
    const urls = [...js.matchAll(/["'`](https?:\/\/[^"'`\s]{10,120})/g)].map(m => m[1]).filter(u => !u.includes('w3.org') && !u.includes('schema.org') && !u.includes('reactjs.org'));
    if (urls.length) console.log('URLs:', [...new Set(urls)]);

    // API paths
    const apiPaths = [...js.matchAll(/["'`](\/[a-z][^"'`\n]{5,80})/g)].map(m => m[1]).filter(p => p.includes('api') || p.includes('station') || p.includes('fuel') || p.includes('price') || p.includes('bensin') || p.includes('pris'));
    if (apiPaths.length) console.log('API paths:', [...new Set(apiPaths)].slice(0, 20));

    // Fetch/axios calls
    const fetchCalls = [...js.matchAll(/(?:fetch|get|post|axios)\s*\(\s*["'`]([^"'`]{5,80})/g)].map(m => m[1]);
    if (fetchCalls.length) console.log('Fetch/get calls:', [...new Set(fetchCalls)].slice(0, 15));

    // baseURL/apiUrl patterns
    const baseUrls = [...js.matchAll(/(?:baseUrl|apiUrl|baseURL|apiURL|endpoint|API_URL|apiBase)\s*[:=]\s*["'`]([^"'`]{5,80})/g)].map(m => m[1]);
    if (baseUrls.length) console.log('BaseURL:', baseUrls);

    // GraphQL
    const gql = js.includes('graphql') || js.includes('GraphQL') || js.includes('gql`');
    if (gql) console.log('Uses GraphQL');

    await new Promise(r => setTimeout(r, 300));
  }
})();
