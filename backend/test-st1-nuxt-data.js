// Extract ST1 Nuxt SSR data and find stations
(async () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

  const st1Html = await fetch('https://www.st1.no/stasjoner/', {
    headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(15000)
  }).then(r => r.text()).catch(e => { console.log('err:', e.message); return ''; });

  // Extract __NUXT_DATA__
  const nuxtData = st1Html.match(/<script[^>]+id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nuxtData) {
    const data = nuxtData[1].trim();
    console.log('NUXT_DATA length:', data.length);
    console.log('NUXT_DATA first 500:', data.substring(0, 500));

    try {
      const arr = JSON.parse(data);
      console.log('Parsed array length:', arr.length);

      // Search for station-like objects
      const stationLike = [];
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          const keys = Object.keys(v);
          if (keys.some(k => ['lat', 'latitude', 'lng', 'longitude', 'name', 'address'].includes(k.toLowerCase()))) {
            stationLike.push({ i, obj: v });
          }
        }
      }
      console.log('Station-like objects found:', stationLike.length);
      if (stationLike.length > 0) {
        console.log('First station-like:', JSON.stringify(stationLike[0]));
        console.log('Second station-like:', JSON.stringify(stationLike[1]));
      }

      // Also search for coordinates (numbers in lat/lng range)
      const latLngs = [];
      for (let i = 0; i < Math.min(arr.length, 50000); i++) {
        const v = arr[i];
        if (typeof v === 'number' && v > 57 && v < 72) { // Norway lat range
          // check adjacent element for lng
          const next = arr[i + 1];
          if (typeof next === 'number' && next > 4 && next < 32) { // Norway lng range
            latLngs.push({ i, lat: v, lng: next });
          }
        }
      }
      console.log('Lat/lng pairs found:', latLngs.length);
      if (latLngs.length > 0) {
        console.log('First few coords:', JSON.stringify(latLngs.slice(0, 5)));
      }
    } catch (e) {
      console.log('Parse error:', e.message);
    }
  } else {
    console.log('No __NUXT_DATA__ found');
    // Check if there's another data pattern
    const alt = st1Html.match(/application\/json[^>]*>([\s\S]{0,200})/);
    console.log('Alt JSON:', alt ? alt[1] : 'none');
  }

  // Also check the 404 JSON response from /api/stations
  const apiResp = await fetch('https://www.st1.no/api/stations', {
    headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(5000)
  }).then(r => r.text()).catch(() => '');
  console.log('\n/api/stations 404 body:', apiResp);
})();
