// Find correct OKQ8 location format to get stations
(async () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';
  const headers = {
    'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest', 'Referer': 'https://www.okq8.se/hitta-macken/', 'Origin': 'https://www.okq8.se',
  };

  async function post(body) {
    const r = await fetch('https://www.okq8.se/station/GetStationsBasedOnFilter/', {
      method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    return r.json();
  }

  // Try location as city name
  const loc1 = await post({ filters: [], location: 'Stockholm', stationId: '', type: '', language: 'sv-SE', siteId: 'okq8' });
  console.log('location=Stockholm:', JSON.stringify(loc1).substring(0, 200));
  await new Promise(r => setTimeout(r, 500));

  // Try location as coords string
  const loc2 = await post({ filters: [], location: '59.329,18.068', stationId: '', type: '', language: 'sv-SE', siteId: 'okq8' });
  console.log('location=59.329,18.068:', JSON.stringify(loc2).substring(0, 200));
  await new Promise(r => setTimeout(r, 500));

  // Try lat/lon string with space
  const loc3 = await post({ filters: [], location: '59.329 18.068', stationId: '', type: '', language: 'sv-SE', siteId: 'okq8' });
  console.log('location=59.329 18.068:', JSON.stringify(loc3).substring(0, 200));
  await new Promise(r => setTimeout(r, 500));

  // Try stationId to get a specific station
  const loc4 = await post({ filters: [], location: '', stationId: '1', type: '', language: 'sv-SE', siteId: 'okq8' });
  console.log('stationId=1:', JSON.stringify(loc4).substring(0, 200));
  await new Promise(r => setTimeout(r, 500));

  // Try type=all
  const loc5 = await post({ filters: [], location: '', stationId: '', type: 'all', language: 'sv-SE', siteId: 'okq8' });
  console.log('type=all:', JSON.stringify(loc5).substring(0, 200));
  await new Promise(r => setTimeout(r, 500));

  // Try with no type or stationId, just location
  const loc6 = await post({ filters: [], location: 'Göteborg', language: 'sv-SE', siteId: 'okq8' });
  console.log('location=Göteborg:', JSON.stringify(loc6).substring(0, 200));
  await new Promise(r => setTimeout(r, 500));

  // Try all stations (no location, no filters)
  const loc7 = await post({ language: 'sv-SE', siteId: 'okq8' });
  console.log('minimal (just lang+site):', JSON.stringify(loc7).substring(0, 300));
  await new Promise(r => setTimeout(r, 500));

  // Also look at the FindStationPage chunk more carefully for how location is built
  const chunk = await fetch('https://www.okq8.se/dist/build-client/static/js/apps-web-pages-findStationPage-FindStationPage.a7ebacf7.chunk.js', {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000)
  }).then(r => r.text()).catch(() => '');

  // Find the mutation call
  const mutationCtx = [...chunk.matchAll(/useSWRMutation|mutate|trigger\([^)]{0,200}/g)].map(m => m[0]).slice(0, 5);
  console.log('\nmutation calls:', mutationCtx);

  // Find how location is set
  const locationSet = [...chunk.matchAll(/location[^;,]{0,120}/g)].map(m => m[0]).slice(0, 10);
  console.log('location usage:', locationSet.slice(0, 5));
})();
