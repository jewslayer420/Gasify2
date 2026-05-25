// Parse large HTML pages for embedded station data and try mobile app APIs
(async () => {
  // ST1 Norway stations page - look for embedded JSON
  const st1 = await fetch('https://www.st1.no/stasjoner/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', Accept: 'text/html' },
    signal: AbortSignal.timeout(15000)
  }).then(r => r.text()).catch(e => { console.log('ST1 fetch err:', e.message); return ''; });
  const st1Json = st1.match(/window\.__(?:INITIAL|NEXT|STATE|DATA|NUXT)__\s*=\s*(\{.{0,1000})/s);
  if (st1Json) console.log('ST1 embedded JSON:', st1Json[1].substring(0, 300));
  const st1Stations = st1.match(/"stations"\s*:\s*\[[\s\S]{0,500}/);
  if (st1Stations) console.log('ST1 stations:', st1Stations[0].substring(0, 300));
  const st1ApiCalls = [...st1.matchAll(/["'](https?:\/\/[^"']*(?:api|station|price)[^"']{0,80})/gi)].map(m => m[1]).slice(0, 8);
  console.log('ST1 API refs:', st1ApiCalls);

  // bensinpris.no - 14KB small page, might have price list embedded
  const bens = await fetch('https://www.bensinpris.no/', {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' }, signal: AbortSignal.timeout(8000)
  }).then(r => r.text()).catch(() => '');
  const bensJson = bens.match(/(?:stations|prices|data)\s*[=:]\s*(\[[\s\S]{0,500}|\{[\s\S]{0,500})/i);
  if (bensJson) console.log('bensinpris.no data:', bensJson[1].substring(0, 300));
  const bensApis = [...bens.matchAll(/["'](https?:\/\/[^"']*(?:api|station|price|fuel)[^"']{0,80})/gi)].map(m => m[1]).slice(0, 8);
  console.log('bensinpris.no API refs:', bensApis);

  console.log('---');

  // Mobile app API patterns - different user agents
  const mobileTests = [
    // Circle K Nordic app (iOS/Android internal API - different from EU web API)
    { name: 'CK NO mobile v1', url: 'https://api.circlek.com/no/prices/v1/fuel' },
    { name: 'CK SE mobile v1', url: 'https://api.circlek.com/se/prices/v1/fuel' },
    { name: 'CK Nordic stations', url: 'https://api.circlek.com/nordic/stations' },
    { name: 'CK NO app stations', url: 'https://api.circlek.com/no/stations' },
    { name: 'CK SE app stations', url: 'https://api.circlek.com/se/stations' },
    // OKQ8 app API
    { name: 'OKQ8 app v1', url: 'https://app.okq8.se/api/v1/stations' },
    { name: 'OKQ8 app prices', url: 'https://app.okq8.se/api/v1/prices' },
    // ST1 Nordic app
    { name: 'ST1 Nordic API', url: 'https://api.st1.com/stations/no' },
    { name: 'ST1 Nordic API SE', url: 'https://api.st1.com/stations/se' },
    // YX Uno-X app
    { name: 'Uno-X app API', url: 'https://api.uno-x.no/v1/stations' },
    { name: 'Uno-X app prices', url: 'https://api.uno-x.no/v1/fuel-prices' },
    // Preem app
    { name: 'Preem app API', url: 'https://api.preem.se/v1/stations' },
    // drivstoff.app API
    { name: 'drivstoff.app API v1', url: 'https://api.drivstoff.app/v1/stations' },
    { name: 'drivstoff.app API', url: 'https://drivstoff.app/api/stations' },
    // WordPress REST for drivstoffpriser.no
    { name: 'drivstoffpriser WP REST', url: 'https://www.drivstoffpriser.no/wp-json/wp/v2/posts?per_page=1' },
    { name: 'drivstoffpriser WP types', url: 'https://www.drivstoffpriser.no/wp-json/wp/v2/types' },
  ];

  for (const t of mobileTests) {
    try {
      const r = await fetch(t.url, {
        headers: { 'User-Agent': 'Gasify/1.0 (iOS; iPhone)', Accept: 'application/json', 'X-App-Name': 'PRICES' },
        signal: AbortSignal.timeout(6000), redirect: 'follow',
      });
      const body = await r.text();
      const isJson = body.trim().startsWith('{') || body.trim().startsWith('[');
      const snippet = body.substring(0, 120).replace(/\s+/g, ' ');
      console.log(`${t.name}: ${r.status} | ${isJson ? 'JSON' : 'HTML'} | ${snippet}`);
    } catch (e) {
      console.log(`${t.name}: ERROR - ${e.message.substring(0, 60)}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
})();
