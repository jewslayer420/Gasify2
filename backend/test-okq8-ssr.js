// Check OKQ8 server-rendered station data and sitemap
(async () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

  // Check the OKQ8 sitemap for station pages
  const sitemap = await fetch('https://www.okq8.se/sitemap.xml', {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000)
  }).then(r => r.text()).catch(() => '');
  // Find station sitemap index
  const sitemapIndex = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(m => m[1]).slice(0, 20);
  console.log('Main sitemap URLs:', sitemapIndex);

  // Check sitemapindex for station-specific sitemap
  const stationSitemap = sitemapIndex.find(u => u.includes('station') || u.includes('macken'));
  if (stationSitemap) {
    const stSm = await fetch(stationSitemap, {
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000)
    }).then(r => r.text()).catch(() => '');
    const stUrls = [...stSm.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(m => m[1]).slice(0, 5);
    console.log('Station sitemap URLs:', stUrls);
    if (stUrls.length > 0) {
      // Fetch first station page
      const stPage = await fetch(stUrls[0], {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000)
      }).then(r => r.text()).catch(() => '');
      const nextData = stPage.match(/id="__NEXT_DATA__"[^>]*>(\{[\s\S]*?)<\/script>/);
      if (nextData) {
        try {
          const nd = JSON.parse(nextData[1]);
          console.log('Station NEXT_DATA keys:', Object.keys(nd));
          console.log('Station props:', JSON.stringify(nd.props).substring(0, 500));
        } catch (e) {
          console.log('Parse err:', e.message);
        }
      }
    }
  }

  await new Promise(r => setTimeout(r, 500));

  // Check for another sitemap with station data
  const sitemaps = sitemapIndex.filter(u => u.includes('sitemap'));
  console.log('\nAll sitemaps:', sitemaps);

  // Also try the OKQ8 API endpoint for all stations (maybe there's a getAllStations endpoint)
  const allStTests = [
    'https://www.okq8.se/station/GetAllStations/',
    'https://www.okq8.se/station/GetStations/',
    'https://www.okq8.se/api/station/all',
    'https://www.okq8.se/api/stations',
    'https://www.okq8.se/api/GetAllStations',
    'https://www.okq8.se/station/GetAllStationsForMap/',
  ];
  for (const url of allStTests) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', Referer: 'https://www.okq8.se/' },
        signal: AbortSignal.timeout(6000)
      });
      const body = await r.text();
      const isJson = body.trim().startsWith('{') || body.trim().startsWith('[');
      console.log(`${url.split('okq8.se')[1]}: ${r.status} | ${isJson ? 'JSON: ' + body.substring(0, 150) : 'HTML ' + body.length}`);
    } catch (e) {
      console.log(`${url.split('okq8.se')[1]}: ERROR - ${e.message.substring(0, 50)}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
})();
