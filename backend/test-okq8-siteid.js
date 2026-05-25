// Find correct OKQ8 siteId by looking at module 47111 and trying variations
(async () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';
  const base = 'https://www.okq8.se/dist/build-client/static/js/';

  // Look at the chunks that could contain siteId configuration
  // Module 47111 is Pe which has Pe.O5() that returns siteId
  // This is likely in a shared chunk
  const sharedChunks = [
    '6794.ca6f1ba5.chunk.js',
    '2687.5ca828d7.chunk.js',
    '7116.d4f32aa6.chunk.js',
    '1397.f2ec05c7.chunk.js',
    '6420.3caae82d.chunk.js',
  ];

  for (const chunk of sharedChunks) {
    const js = await fetch(base + chunk, {
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000)
    }).then(r => r.text()).catch(e => { console.log(chunk + ' err:', e.message); return ''; });
    console.log(`\n=== ${chunk} (${js.length}b) ===`);

    // Find siteId references
    const siteIdRefs = [...js.matchAll(/siteId[^;,)]{0,120}/g)].map(m => m[0]);
    if (siteIdRefs.length) console.log('siteId refs:', siteIdRefs.slice(0, 5));

    // Find string values that might be siteId
    const siteStrings = [...js.matchAll(/["'](?:okq8|OKQ8|q8|Q8|f24|F24)[^"']*["']/g)].map(m => m[0]);
    if (siteStrings.length) console.log('Site strings:', siteStrings.slice(0, 10));

    // Find configurable values
    const configRefs = [...js.matchAll(/(?:brand|site|tenant|instance)\s*[:=]\s*["']([^"']{2,20})/gi)].map(m => m[1]);
    if (configRefs.length) console.log('Config refs:', configRefs.slice(0, 10));

    await new Promise(r => setTimeout(r, 200));
  }

  // Try GetStationsBasedOnFilter with different siteId values
  const h = {
    'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest', 'Referer': 'https://www.okq8.se/', 'Origin': 'https://www.okq8.se',
  };

  const siteIds = ['OKQ8', 'okq8se', 'okq8-se', 'se-okq8', '1', 'hitta-macken', 'prod', 'production'];
  for (const siteId of siteIds) {
    const r = await fetch('https://www.okq8.se/station/GetStationsBasedOnFilter/', {
      method: 'POST', headers: h,
      body: JSON.stringify({ filters: [], location: 'Malmö', stationId: '', type: '', language: 'sv-SE', siteId }),
      signal: AbortSignal.timeout(10000)
    });
    const j = await r.json();
    const count = j?.data?.stations?.length || 0;
    console.log(`siteId=${siteId}: ${r.status} | stations=${count} | ${JSON.stringify(j).substring(0, 100)}`);
    await new Promise(r => setTimeout(r, 400));
  }
})();
