// Analyze OKQ8 React bundle for API endpoints
(async () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

  const js = await fetch('https://www.okq8.se/dist/build-client/static/js/main.d105f0fe.js', {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000)
  }).then(r => r.text()).catch(e => { console.log('err:', e.message); return ''; });
  console.log('Bundle size:', js.length, 'bytes');

  // Extract URLs
  const urls = [...js.matchAll(/["'`](https?:\/\/[^"'`\s]{10,100})/g)].map(m => m[1]);
  const uniqueUrls = [...new Set(urls)];
  console.log('All URLs:', uniqueUrls.length);

  // Filter for API-like URLs
  const apiUrls = uniqueUrls.filter(u => !u.includes('google') && !u.includes('font') && !u.includes('.css') && !u.includes('.png') && !u.includes('.jpg') && !u.includes('facebook') && !u.includes('twitter') && !u.includes('cookiebot'));
  console.log('\nAPI-like URLs:');
  apiUrls.forEach(u => console.log(' ', u));

  // Also look for endpoint path patterns
  const paths = [...js.matchAll(/["'`](\/api\/[^"'`\s]{2,60})/g)].map(m => m[1]);
  const uniquePaths = [...new Set(paths)];
  console.log('\nAPI paths:', uniquePaths);

  // Look for fetch/axios calls with URLs
  const fetchCalls = [...js.matchAll(/fetch\(\s*["'`]([^"'`]{5,80})/g)].map(m => m[1]);
  console.log('\nFetch calls:', [...new Set(fetchCalls)].slice(0, 20));

  // Look for baseURL patterns
  const baseUrls = [...js.matchAll(/baseURL\s*:\s*["'`]([^"'`]{5,80})/g)].map(m => m[1]);
  console.log('\nbaseURL patterns:', baseUrls);

  // Look for station-related strings
  const stationStrings = [...js.matchAll(/["'`]([^"'`]*(?:station|macken|fuel|diesel|bensin|pris)[^"'`]{0,50}["'`])/gi)].map(m => m[1]).slice(0, 10);
  console.log('\nStation-related strings:', stationStrings);
})();
