// Last round: drivmedelskollen.se, Circle K NO Drupal, OKQ8 JS, ST1 station detail
(async () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

  // drivmedelskollen.se - Swedish aggregator
  const drivSE = await fetch('https://drivmedelskollen.se/', {
    headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(8000)
  }).then(r => r.text()).catch(e => { console.log('drivmedelskollen err:', e.message); return ''; });
  const drivApis = [...drivSE.matchAll(/["'](https?:\/\/[^"']*(?:api|station|price|fuel|pris)[^"']{0,80})/gi)].map(m => m[1]);
  console.log('drivmedelskollen.se API refs:', [...new Set(drivApis)].slice(0, 10));
  const drivScripts = [...drivSE.matchAll(/<script[^>]+src="([^"]+)"/gi)].map(m => m[1]).slice(0, 5);
  console.log('drivmedelskollen.se scripts:', drivScripts);

  // Circle K Norway - Drupal JSON API
  const ckDrupal = [
    'https://www.circlek.no/jsonapi/',
    'https://www.circlek.no/jsonapi/node/station',
    'https://www.circlek.no/api/',
    'https://www.circlek.no/api/v1/stations',
    'https://www.circlek.no/stasjoner?_format=json',
    'https://www.circlek.no/bensinstasjon?_format=json',
    'https://www.circlek.no/views/stations/ajax',
  ];
  for (const url of ckDrupal) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json,application/vnd.api+json' }, signal: AbortSignal.timeout(5000)
      });
      const body = await r.text();
      const isJson = body.trim().startsWith('{') || body.trim().startsWith('[');
      console.log(`CK NO ${url.split('circlek.no')[1]}: ${r.status} | ${isJson ? 'JSON len=' + body.length + ' ' + body.substring(0, 80) : 'HTML ' + body.length}`);
    } catch (e) {
      console.log(`CK NO ${url.split('circlek.no')[1]}: ERROR - ${e.message.substring(0, 40)}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // OKQ8 SE - look at their JS bundle for API patterns
  const okq8Html = await fetch('https://www.okq8.se/', {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000)
  }).then(r => r.text()).catch(() => '');
  const okq8Scripts = [...okq8Html.matchAll(/<script[^>]+src="([^"]+)"/gi)].map(m => m[1]).filter(s => s.includes('.js')).slice(0, 3);
  console.log('\nOKQ8 scripts:', okq8Scripts);
  for (const scriptSrc of okq8Scripts.slice(0, 1)) {
    const scriptUrl = scriptSrc.startsWith('http') ? scriptSrc : 'https://www.okq8.se' + scriptSrc;
    const js = await fetch(scriptUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) }).then(r => r.text()).catch(() => '');
    const apiRefs = [...js.matchAll(/["'](https?:\/\/[^"']*(?:api|station|fuel|price|pris|macken)[^"']{0,60})/gi)].map(m => m[1]);
    console.log('OKQ8 JS API refs:', [...new Set(apiRefs)].slice(0, 15));
  }

  // ST1 station detail - try different URL patterns
  const st1DetailUrls = [
    'https://www.st1.no/finn-stasjon/mastemyr/',
    'https://www.st1.no/finn-stasjon/st1-mastemyr/',
    'https://www.st1.no/stasjon/mastemyr/',
    'https://www.st1.no/stasjon/9162/',
  ];
  for (const url of st1DetailUrls) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) });
      const body = await r.text();
      const hasNuxt = body.includes('__NUXT_DATA__');
      console.log(`ST1 ${url.split('st1.no')[1]}: ${r.status} | hasNuxt=${hasNuxt} | len=${body.length}`);
      if (hasNuxt && r.status === 200) {
        const nuxtArr = JSON.parse((body.match(/<script[^>]+id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/) || ['', '{}'])[1]);
        const nokPrices = nuxtArr.filter(v => typeof v === 'number' && v > 13 && v < 28);
        console.log('  NOK-range prices:', nokPrices.slice(0, 10));
      }
    } catch (e) {
      console.log(`ST1 ${url.split('st1.no')[1]}: ERROR - ${e.message.substring(0, 40)}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
})();
