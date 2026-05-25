// Deep dive into ST1 Nuxt app to find station locator API
(async () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

  // Get the stations page to find the full NUXT config
  const st1Html = await fetch('https://www.st1.no/stasjoner/', {
    headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(15000)
  }).then(r => r.text()).catch(e => { console.log('err:', e.message); return ''; });

  // Extract full nuxt config
  const nuxtConfig = st1Html.match(/window\.__NUXT__\.config\s*=\s*(\{[^<]{0,3000})/s);
  if (nuxtConfig) console.log('Full NUXT config:', nuxtConfig[1].substring(0, 2000));

  // Find ALL script chunks
  const allScripts = [...st1Html.matchAll(/src="(\/_nuxt\/[^"]+\.js)"/gi)].map(m => 'https://www.st1.no' + m[1]);
  console.log('All script chunks:', allScripts);

  // Also check preloads
  const preloads = [...st1Html.matchAll(/href="(\/_nuxt\/[^"]+\.js)"/gi)].map(m => 'https://www.st1.no' + m[1]);
  console.log('Preloaded scripts:', preloads);

  // Check payload for static station data
  const payload = st1Html.match(/window\.__NUXT__\s*=\s*(\{[\s\S]{0,5000})/);
  if (payload) {
    const p = payload[1].substring(0, 2000);
    console.log('NUXT payload:', p);
  }

  // Try ST1 API routes that Nuxt might generate
  const apiTests = [
    'https://www.st1.no/api/stations',
    'https://www.st1.no/api/stationlocator',
    'https://www.st1.no/api/find-stations',
    'https://www.st1.no/_api/stations',
    'https://www.st1.no/stasjoner.json',
    'https://www.st1.no/stasjoner/?format=json',
    // ST1 might use Contentful CMS for station data
    'https://cdn.contentful.com/spaces/st1-no',
    // ST1 Group API
    'https://api.st1.com/stations',
    'https://stationapi.st1.com/stations/NO',
    // Nordic-specific APIs
    'https://stationsapi.st1.no/api/stations',
    'https://locatorapi.st1.no/api/stations',
  ];

  for (const url of apiTests) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(5000), redirect: 'follow'
      });
      const body = await r.text();
      const isJson = body.trim().startsWith('{') || body.trim().startsWith('[');
      console.log(`${url.replace('https://', '')}: ${r.status} | ${isJson ? 'JSON len=' + body.length : 'HTML'}`);
    } catch (e) {
      console.log(`${url.replace('https://', '')}: ERROR - ${e.message.substring(0, 50)}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }
})();
