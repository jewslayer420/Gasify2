// Parse ST1 station detail page for prices
(async () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

  const html = await fetch('https://www.st1.no/stasjon/mastemyr/', {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000)
  }).then(r => r.text()).catch(e => { console.log('err:', e.message); return ''; });

  const nuxtData = html.match(/<script[^>]+id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!nuxtData) { console.log('No NUXT_DATA'); return; }
  const arr = JSON.parse(nuxtData[1].trim());
  console.log('Array length:', arr.length);

  // Resolve helper
  function resolve(idx, depth = 0, seen = new Set()) {
    if (depth > 20 || idx === null || idx === undefined || seen.has(idx)) return null;
    seen.add(idx);
    const v = arr[idx];
    if (v === null || v === undefined) return null;
    if (typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') return v;
    if (Array.isArray(v)) {
      if (v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number') return resolve(v[1], depth + 1, seen);
      return v.map(item => typeof item === 'number' ? resolve(item, depth + 1, new Set(seen)) : item);
    }
    if (typeof v === 'object') {
      const out = {};
      for (const [k, ref] of Object.entries(v)) {
        out[k] = typeof ref === 'number' ? resolve(ref, depth + 1, new Set(seen)) : ref;
      }
      return out;
    }
    return v;
  }

  // Find station object with fuels
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (typeof v === 'object' && v !== null && !Array.isArray(v) && 'fuels' in v && 'location' in v) {
      const station = resolve(i);
      console.log('Station name:', station?.name);
      console.log('Location:', JSON.stringify(station?.location));
      console.log('Fuels (raw):', JSON.stringify(arr[v.fuels]));

      // Check each fuel entry
      const fuelsArr = arr[v.fuels];
      if (Array.isArray(fuelsArr)) {
        for (const fuelIdx of fuelsArr) {
          const fuelObj = arr[fuelIdx];
          console.log('\nFuel raw:', JSON.stringify(fuelObj));
          if (typeof fuelObj === 'object' && fuelObj !== null) {
            for (const [k, val] of Object.entries(fuelObj)) {
              console.log(`  ${k}: ${val} → ${arr[val]}`);
            }
          } else {
            console.log('Fuel string:', fuelObj, '→', typeof fuelObj === 'number' ? arr[fuelObj] : fuelObj);
          }
        }
      }
      break;
    }
  }

  // Also look for any objects with 'price' key
  console.log('\n--- Objects with price key ---');
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (typeof v === 'object' && v !== null && !Array.isArray(v) && 'price' in v) {
      const resolved = resolve(i);
      console.log(`Index ${i}:`, JSON.stringify(resolved));
      break; // just first one
    }
  }

  // Look for numbers that could be NOK prices (15-25 range)
  console.log('\n--- All NOK-range numbers with context ---');
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (typeof v === 'number' && v > 13 && v < 28 && Math.floor(v) !== v) {
      // Float in NOK range - show surrounding context
      console.log(`Index ${i}: ${v}, prev: ${JSON.stringify(arr[i-1])}, next: ${JSON.stringify(arr[i+1])}`);
    }
  }
})();
