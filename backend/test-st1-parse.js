// Parse ST1 Nuxt SSR data to extract stations with coords and fuel prices
(async () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

  const st1Html = await fetch('https://www.st1.no/stasjoner/', {
    headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(15000)
  }).then(r => r.text()).catch(e => { console.log('err:', e.message); return ''; });

  const nuxtData = st1Html.match(/<script[^>]+id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!nuxtData) { console.log('No NUXT_DATA'); return; }

  const arr = JSON.parse(nuxtData[1].trim());
  console.log('Array length:', arr.length);

  // Nuxt serializes as a flat array where objects have values as index references
  // Resolve: if value is a number that's a valid array index, it points to arr[value]
  function resolve(idx, depth = 0) {
    if (depth > 20) return null;
    if (idx === null || idx === undefined) return null;
    const v = arr[idx];
    if (v === null || v === undefined) return null;
    if (typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') return v; // primitive numbers are inline
    if (Array.isArray(v)) {
      // Check if it's a special ["ShallowReactive", idx] type
      if (v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number') {
        return resolve(v[1], depth + 1);
      }
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

  // Find all stations: objects with 'fuels' and 'location' keys
  const stations = [];
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      if ('fuels' in v && 'location' in v && 'name' in v && 'countryCode' in v) {
        const station = resolve(i);
        if (station) stations.push(station);
      }
    }
  }
  console.log('Stations found:', stations.length);

  // Show first few stations
  if (stations.length > 0) {
    console.log('\nFirst station:');
    console.log(JSON.stringify(stations[0], null, 2).substring(0, 1000));
  }

  // Count by country
  const byCo = {};
  for (const s of stations) {
    const cc = s.countryCode || 'unknown';
    byCo[cc] = (byCo[cc] || 0) + 1;
  }
  console.log('\nBy country:', byCo);

  // Show a Norway station with fuel prices
  const no = stations.find(s => s.countryCode === 'NO' && s.fuels && Array.isArray(s.fuels) && s.fuels.length > 0);
  if (no) {
    console.log('\nNorway station sample:');
    console.log(JSON.stringify(no, null, 2).substring(0, 1500));
  }
})();
