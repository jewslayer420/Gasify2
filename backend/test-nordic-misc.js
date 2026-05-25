// Try Norwegian/Swedish aggregator services and Preem price page
(async () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

  // Preem price page - Next.js/React - look for JSON
  const preemPage = await fetch('https://www.preem.se/pa-stationen/drivmedel/drivmedelspriser/', {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000)
  }).then(r => r.text()).catch(e => { console.log('Preem err:', e.message); return ''; });
  const preemNextData = preemPage.match(/id="__NEXT_DATA__"[^>]*>(\{[\s\S]*?)<\/script>/);
  if (preemNextData) {
    console.log('Preem NEXT_DATA length:', preemNextData[1].length);
    console.log('Preem NEXT_DATA first 500:', preemNextData[1].substring(0, 500));
  } else {
    console.log('No Preem NEXT_DATA, checking for JSON...');
    const apiCalls = [...preemPage.matchAll(/["'](https?:\/\/[^"']+(?:price|station|api)[^"']{0,60})/gi)].map(m => m[1]);
    console.log('Preem API refs:', [...new Set(apiCalls)].slice(0, 10));
  }

  // Check drivstoff.no (Norwegian fuel price aggregator)
  const drivstoffNo = await fetch('https://drivstoff.no/', {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000)
  }).then(r => r.text()).catch(e => { console.log('drivstoff.no err:', e.message); return ''; });
  if (drivstoffNo) {
    const apiCalls = [...drivstoffNo.matchAll(/["'](https?:\/\/[^"']+(?:price|station|api|fuel)[^"']{0,60})/gi)].map(m => m[1]);
    console.log('drivstoff.no API refs:', [...new Set(apiCalls)].slice(0, 10));
    const nextData = drivstoffNo.match(/id="__NEXT_DATA__"[^>]*>(\{[\s\S]*?)<\/script>/);
    if (nextData) console.log('drivstoff.no NEXT_DATA:', nextData[1].substring(0, 300));
  }

  await new Promise(r => setTimeout(r, 500));

  const tests = [
    // Norwegian aggregators
    { name: 'drivstoff.no', url: 'https://drivstoff.no/api/stations' },
    { name: 'drivstoff.no bensin', url: 'https://drivstoff.no/api/bensinstasjoner' },
    { name: 'tankappen.no', url: 'https://tankappen.no/api/stations' },
    { name: 'bensinsnitten.no', url: 'https://bensinsnitten.no/api/stations' },
    // Swedish aggregators
    { name: 'drivmedelskollen.se', url: 'https://drivmedelskollen.se/api/stations' },
    { name: 'tanker.se', url: 'https://tanker.se/api/stations' },
    { name: 'billigastbensinen.se', url: 'https://billigastbensinen.se/api/stations' },
    // Competition/government
    { name: 'konkurransetilsynet API', url: 'https://api.konkurransetilsynet.no/drivstoff/v1/stations' },
    { name: 'konkurransetilsynet data', url: 'https://data.konkurransetilsynet.no/api/stations' },
    // Preem station finder
    { name: 'Preem tankstationer', url: 'https://www.preem.se/tankstationer/' },
    { name: 'Preem find JSON', url: 'https://www.preem.se/api/tankstationer' },
    // OKQ8 hitta macken (find station)
    { name: 'OKQ8 hitta macken', url: 'https://www.okq8.se/hitta-macken/' },
    { name: 'OKQ8 station list JSON', url: 'https://www.okq8.se/priser-och-erbjudanden/drivmedelspriser/?' },
    // Uno-X Norway new site
    { name: 'Uno-X NO API wp', url: 'https://www.uno-x.no/wp-json/unox/v1/stations?per_page=100' },
    { name: 'Uno-X NO wp v2 pages', url: 'https://www.uno-x.no/wp-json/wp/v2/pages?per_page=5' },
  ];

  for (const t of tests) {
    try {
      const r = await fetch(t.url, {
        headers: { 'User-Agent': UA, Accept: 'application/json,text/html' },
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
