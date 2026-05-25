const tests = [
  { sub: 'no', body: 'lat_min=57.9&lat_max=58.3&lon_min=7.9&lon_max=8.5&zoom=14' },
  { sub: 'se', body: 'lat_min=59.2&lat_max=59.5&lon_min=17.8&lon_max=18.2&zoom=14' },
];
(async () => {
  for (const t of tests) {
    const r = await fetch('https://' + t.sub + '.fuelo.net/ajax/get_gasstations_within_bounds_mysql_clustering', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://' + t.sub + '.fuelo.net/' },
      body: t.body, signal: AbortSignal.timeout(8000)
    }).then(r => r.json()).catch(e => ({ error: e.message }));
    const stations = r.gasstations ? r.gasstations.filter(s => s.id && s.id !== 'null') : [];
    console.log(t.sub + '.fuelo.net:', r.status || r.error, '| stations with IDs:', stations.length);
    if (stations.length > 0) {
      const det = await fetch('https://' + t.sub + '.fuelo.net/ajax/get_infowindow_content/' + stations[0].id + '?lang=en', { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.json()).catch(() => ({}));
      const addr = (det.text || '').match(/<h5[^>]*>([^<]+)<\/h5>/);
      const price = (det.text || '').match(/title="([^"]+(?:NOK|SEK|EUR)[^"]*)"/);
      console.log('  addr:', addr ? addr[1] : 'none');
      console.log('  price sample:', price ? price[1] : 'none');
    }
  }
})();
