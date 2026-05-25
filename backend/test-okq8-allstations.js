// Try GetAllStations with POST and look at OKQ8 station finder in detail
(async () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';
  const h = {
    'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest', 'Referer': 'https://www.okq8.se/hitta-macken/', 'Origin': 'https://www.okq8.se',
  };

  // POST GetAllStations
  const r1 = await fetch('https://www.okq8.se/station/GetAllStations/', {
    method: 'POST', headers: h, body: JSON.stringify({ language: 'sv-SE', siteId: 'okq8' }),
    signal: AbortSignal.timeout(15000)
  });
  const b1 = await r1.text();
  console.log('POST GetAllStations:', r1.status, b1.substring(0, 300));

  await new Promise(r => setTimeout(r, 500));

  // Fetch the hitta-macken page and look for server-rendered station data
  const hmPage = await fetch('https://www.okq8.se/hitta-macken/', {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000)
  }).then(r => r.text()).catch(e => { console.log('err:', e.message); return ''; });
  console.log('\nhitta-macken page length:', hmPage.length);
  const nextData = hmPage.match(/id="__NEXT_DATA__"[^>]*>(\{[\s\S]*?)<\/script>/);
  if (nextData) {
    try {
      const nd = JSON.parse(nextData[1]);
      console.log('NEXT_DATA keys:', Object.keys(nd));
      const propsKeys = Object.keys(nd.props || {});
      console.log('Props keys:', propsKeys);
      console.log('Props preview:', JSON.stringify(nd.props).substring(0, 1000));
    } catch (e) {
      console.log('Parse err:', e.message);
    }
  }
  // Check for embedded station JSON in window vars
  const stationVars = [...hmPage.matchAll(/(?:stations|stationData)\s*[=:]\s*(\[[\s\S]{0,500}|\{[\s\S]{0,500})/gi)].map(m => m[1]).slice(0, 3);
  console.log('Station vars:', stationVars);

  // Also check for the OKQ8 API via different approaches
  // Try the endpoint with actual session cookie from the main page
  const mainResp = await fetch('https://www.okq8.se/hitta-macken/', {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000)
  });
  const sessionCookie = mainResp.headers.get('set-cookie') || '';
  const sessionHeaders = { ...h, Cookie: sessionCookie };

  // Wait a bit and then try the API with the session cookie
  await new Promise(r => setTimeout(r, 1000));
  const r2 = await fetch('https://www.okq8.se/station/GetStationsBasedOnFilter/', {
    method: 'POST', headers: sessionHeaders,
    body: JSON.stringify({ filters: [], location: 'Göteborg', stationId: '', type: '', language: 'sv-SE', siteId: 'okq8' }),
    signal: AbortSignal.timeout(15000)
  });
  const b2 = await r2.json();
  console.log('\nWith session cookie + Göteborg:', JSON.stringify(b2).substring(0, 200));
})();
