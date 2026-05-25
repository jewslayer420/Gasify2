// Check OKQ8 chunks for station API endpoints
(async () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

  // Fetch the FindStation chunk
  const chunk = await fetch('https://www.okq8.se/dist/build-client/static/js/1844.660281d5.chunk.js', {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000)
  }).then(r => r.text()).catch(e => { console.log('chunk err:', e.message); return ''; });
  console.log('Chunk size:', chunk.length);

  const urls = [...chunk.matchAll(/["'`](https?:\/\/[^"'`\s]{10,100})/g)].map(m => m[1]);
  console.log('URLs in chunk:', [...new Set(urls)]);

  const apiPaths = [...chunk.matchAll(/["'`](\/[a-z][^"'`\s]{5,60})/g)].map(m => m[1]).filter(p => !p.includes(' ') && p.includes('/'));
  console.log('API paths in chunk:', [...new Set(apiPaths)].filter(p => p.includes('api') || p.includes('station') || p.includes('fuel') || p.includes('pris')).slice(0, 20));

  const fetchCalls = [...chunk.matchAll(/fetch\s*\(\s*["'`]([^"'`]{5,80})/g)].map(m => m[1]);
  console.log('Fetch calls:', [...new Set(fetchCalls)]);

  // Also look for the runtime chunk that maps chunk IDs to filenames
  const okq8Html = await fetch('https://www.okq8.se/', {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000)
  }).then(r => r.text()).catch(() => '');
  const allChunks = [...okq8Html.matchAll(/\/dist\/build-client\/static\/js\/([^"]+\.chunk\.js)/g)].map(m => m[1]);
  console.log('\nAll OKQ8 chunks:', allChunks);

  // Fetch the runtime or webpack chunk map
  const runtimeScript = [...okq8Html.matchAll(/<script[^>]+src="(\/dist\/build-client\/static\/js\/runtime[^"]+)"/gi)].map(m => m[1]);
  console.log('Runtime scripts:', runtimeScript);
  if (runtimeScript.length > 0) {
    const rt = await fetch('https://www.okq8.se' + runtimeScript[0], {
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000)
    }).then(r => r.text()).catch(() => '');
    // Look for chunk hash mappings
    const chunkMap = [...rt.matchAll(/"([0-9a-f]{8,16})"/g)].map(m => m[1]).slice(0, 30);
    console.log('Runtime chunk hashes:', chunkMap);
    // Look for URLs in runtime
    const rtUrls = [...rt.matchAll(/["'`](https?:\/\/[^"'`\s]{10,80})/g)].map(m => m[1]);
    console.log('Runtime URLs:', rtUrls);
  }
})();
