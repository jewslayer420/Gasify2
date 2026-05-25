// Dig into ST1 Norway Nuxt app to find station API
(async () => {
  const st1Html = await fetch('https://www.st1.no/stasjoner/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Accept: 'text/html' },
    signal: AbortSignal.timeout(15000)
  }).then(r => r.text()).catch(e => { console.log('err:', e.message); return ''; });

  // Extract the full Nuxt config
  const nuxtConfig = st1Html.match(/window\.__NUXT__\.config=(\{[\s\S]*?\});window\.__NUXT__\.push/);
  if (nuxtConfig) {
    console.log('NUXT config (first 1000 chars):', nuxtConfig[1].substring(0, 1000));
  }

  // Extract all script src URLs
  const scripts = [...st1Html.matchAll(/<script[^>]+src="([^"]+)"/gi)].map(m => m[1]);
  console.log('ST1 NO scripts:', scripts.slice(0, 10));

  // Look for API-like URLs in the HTML
  const apiUrls = [...st1Html.matchAll(/["'](https?:\/\/[a-z0-9.-]+\.[a-z]{2,}\/[^"']{5,80})/gi)]
    .map(m => m[1])
    .filter(u => !u.includes('google') && !u.includes('font') && !u.includes('.css') && !u.includes('.png') && !u.includes('.jpg'))
    .slice(0, 20);
  console.log('ST1 NO non-google URLs:', [...new Set(apiUrls)]);

  // Try the JS bundle to find station API endpoint
  const mainScript = scripts.find(s => s.includes('_nuxt') || s.includes('app') || s.includes('main'));
  if (mainScript) {
    const scriptUrl = mainScript.startsWith('http') ? mainScript : 'https://www.st1.no' + mainScript;
    console.log('Fetching main script:', scriptUrl);
    const js = await fetch(scriptUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000)
    }).then(r => r.text()).catch(e => { console.log('script fetch err:', e.message); return ''; });

    // Look for API base URLs
    const apiBase = [...js.matchAll(/["'](https?:\/\/[a-z0-9.-]+(?:\/api|\/v[0-9])[^"']{0,60})/gi)].map(m => m[1]);
    console.log('API refs in JS:', [...new Set(apiBase)].slice(0, 15));

    // Look for station-related API calls
    const stationApi = [...js.matchAll(/["'](https?:\/\/[^"']*station[^"']{0,80})/gi)].map(m => m[1]);
    console.log('Station API in JS:', [...new Set(stationApi)].slice(0, 10));
  }

  // Also check drivstoffpriser.no for station custom post type
  const wpTypes = await fetch('https://www.drivstoffpriser.no/wp-json/wp/v2/types', {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, signal: AbortSignal.timeout(8000)
  }).then(r => r.json()).catch(() => ({}));
  console.log('drivstoffpriser WP types:', Object.keys(wpTypes));

  // Check if there's a stasjon or bensinpris custom type
  if (wpTypes['stasjon'] || wpTypes['gasstation'] || wpTypes['bensinpris']) {
    console.log('Found station custom type!');
  }
})();
