// Test OKQ8 GetStationsBasedOnFilter with proper params
(async () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

  const bodies = [
    { filters: [], location: '', stationId: '', type: '', language: 'sv-SE', siteId: 'okq8' },
    { filters: [], location: '', stationId: '', type: '', language: 'sv-SE', siteId: 'OKQ8' },
    { filters: [], location: '59.3,18.0', stationId: '', type: '', language: 'sv-SE', siteId: 'okq8' },
    { filters: [], location: { lat: 59.3, lng: 18.0 }, language: 'sv-SE', siteId: 'okq8' },
    { filters: [], location: { lat: 59.3, lng: 18.0, radius: 50000 }, language: 'sv-SE', siteId: 'okq8' },
  ];

  for (const body of bodies) {
    try {
      const r = await fetch('https://www.okq8.se/station/GetStationsBasedOnFilter/', {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': 'https://www.okq8.se/hitta-macken/',
          'Origin': 'https://www.okq8.se',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      const resp = await r.text();
      const isJson = resp.trim().startsWith('{') || resp.trim().startsWith('[');
      console.log(`POST ${JSON.stringify(body).substring(0, 60)}: ${r.status} | ${isJson ? 'JSON' : 'HTML'} | ${resp.substring(0, 200).replace(/\s+/g, ' ')}`);
    } catch (e) {
      console.log(`ERROR: ${e.message.substring(0, 60)}`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  // Also look at the chunk for siteId values
  const chunk = await fetch('https://www.okq8.se/dist/build-client/static/js/apps-web-pages-findStationPage-FindStationPage.a7ebacf7.chunk.js', {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000)
  }).then(r => r.text()).catch(() => '');

  // Find siteId references
  const siteIdRefs = [...chunk.matchAll(/siteId[^;,)]{0,100}/g)].map(m => m[0]);
  console.log('\nsiteId references:', siteIdRefs.slice(0, 10));

  // Find languageRoute references
  const langRefs = [...chunk.matchAll(/languageRoute[^;,)]{0,60}/g)].map(m => m[0]);
  console.log('languageRoute refs:', langRefs.slice(0, 5));
})();
