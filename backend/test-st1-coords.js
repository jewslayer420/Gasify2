// Check ST1 station coordinates and fuel prices from Nuxt data
(async () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';
  const st1Html = await fetch('https://www.st1.no/stasjoner/', {
    headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(15000)
  }).then(r => r.text()).catch(e => { console.log('err:', e.message); return ''; });

  const nuxtData = st1Html.match(/<script[^>]+id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  const arr = JSON.parse(nuxtData[1].trim());

  function resolve(idx, depth = 0) {
    if (depth > 20 || idx === null || idx === undefined) return null;
    const v = arr[idx];
    if (v === null || v === undefined) return null;
    if (typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') return v;
    if (Array.isArray(v)) {
      if (v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number') return resolve(v[1], depth + 1);
      return v.map(item => typeof item === 'number' ? resolve(item, depth + 1) : item);
    }
    if (typeof v === 'object') {
      const out = {};
      for (const [k, ref] of Object.entries(v)) {
        out[k] = typeof ref === 'number' ? resolve(ref, depth + 1) : ref;
      }
      return out;
    }
    return v;
  }

  // Find a station and show its raw data structure first (without full resolve)
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      if ('fuels' in v && 'location' in v && 'name' in v) {
        console.log('Station raw entry (index', i, '):', JSON.stringify(v));
        console.log('Location raw (index', v.location, '):', JSON.stringify(arr[v.location]));
        const locObj = arr[v.location];
        if (typeof locObj === 'object' && locObj !== null) {
          console.log('Lat raw:', locObj.lat, '→', arr[locObj.lat]);
          console.log('Lon raw:', locObj.lon, '→', arr[locObj.lon]);
        }
        console.log('Fuels raw (index', v.fuels, '):', JSON.stringify(arr[v.fuels]));
        const fuelsArr = arr[v.fuels];
        if (Array.isArray(fuelsArr) && fuelsArr.length > 0) {
          const firstFuel = fuelsArr[0];
          console.log('First fuel (index', firstFuel, '):', JSON.stringify(arr[firstFuel]));
          const fuelObj = arr[firstFuel];
          if (typeof fuelObj === 'object') {
            console.log('Fuel type:', fuelObj.type, '→', arr[fuelObj.type]);
            console.log('Fuel price:', fuelObj.price, '→', arr[fuelObj.price]);
            console.log('Fuel name:', fuelObj.name, '→', arr[fuelObj.name]);
          }
        }
        break;
      }
    }
  }

  // Full resolve of first station
  console.log('\n--- Full resolved first station ---');
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      if ('fuels' in v && 'location' in v && 'name' in v && 'countryCode' in v) {
        const station = resolve(i);
        // Print just the important fields
        console.log('name:', station.name);
        console.log('location:', JSON.stringify(station.location));
        console.log('fuels:', JSON.stringify(station.fuels));
        console.log('city:', station.city);
        break;
      }
    }
  }
})();
