// Check ST1 individual station pages for price data, and test other Norway APIs
(async () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

  // First, get a station slug from list page
  const listHtml = await fetch('https://www.st1.no/stasjoner/', {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000)
  }).then(r => r.text()).catch(() => '');

  const arr = JSON.parse((listHtml.match(/<script[^>]+id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/) || ['',''])[1] || '[]');

  // Find first station slug
  let slug = null;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (typeof v === 'object' && v !== null && !Array.isArray(v) && 'fuels' in v && 'slug' in v) {
      slug = arr[arr[v.slug]?.charAt ? v.slug : v.slug]; // resolve slug
      if (typeof arr[v.slug] === 'string') slug = arr[v.slug];
      console.log('Found slug index:', v.slug, '→', arr[v.slug]);
      break;
    }
  }
  console.log('Station slug:', slug);

  // Try station detail pages
  const slugUrls = [
    'https://www.st1.no/stasjoner/st1-mastemyr/',
    'https://www.st1.no/stasjon/9162/',
    'https://www.st1.no/finn-stasjon/9162/',
  ];
  if (slug) slugUrls.unshift(`https://www.st1.no/stasjoner/${slug}/`);

  for (const url of slugUrls) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000)
      });
      const body = await r.text();
      const nuxtData = body.match(/<script[^>]+id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (nuxtData) {
        const arr2 = JSON.parse(nuxtData[1].trim());
        // Look for price-like numbers in NOK range (15-25)
        const nokPrices = arr2.filter(v => typeof v === 'number' && v > 14 && v < 30);
        const priceLike = arr2.filter((v, i) => typeof v === 'string' && v.includes('price'));
        console.log(`${url}: ${r.status} | nuxt_len=${arr2.length} | NOK-range numbers: ${JSON.stringify(nokPrices.slice(0, 10))} | price keys: ${JSON.stringify(priceLike.slice(0, 5))}`);
      } else {
        console.log(`${url}: ${r.status} | no nuxt data | HTML ${body.length}B`);
      }
    } catch (e) {
      console.log(`${url}: ERROR - ${e.message.substring(0, 50)}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // Test ST1 proxy endpoints for fuel prices
  const proxyTests = [
    'https://www.st1.no/proxy/cms-view/v1/fuel-prices',
    'https://www.st1.no/proxy/cms-view/v1/prices',
    'https://www.st1.no/proxy/cms-view/v1/content/fuel-prices',
    'https://www.st1.no/proxy/cms-view/v1/stations/9162',
    'https://www.st1.no/proxy/cms-view/v1/stations/9162/prices',
    // ST1 API endpoints
    'https://www.st1.no/api/v1/stations',
    'https://www.st1.no/api/v1/stations/9162',
    'https://www.st1.no/api/v1/fuel-prices',
  ];

  for (const url of proxyTests) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(5000)
      });
      const body = await r.text();
      const isJson = body.trim().startsWith('{') || body.trim().startsWith('[');
      console.log(`${url.replace('https://www.st1.no', '')}: ${r.status} | ${isJson ? 'JSON: ' + body.substring(0, 150) : 'HTML ' + body.length + 'B'}`);
    } catch (e) {
      console.log(`${url.replace('https://www.st1.no', '')}: ERROR - ${e.message.substring(0, 50)}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }
})();
