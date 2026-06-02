// Temp verification harness — dry-fetch the 5 OSM scrapers, no DB writes.
// Confirms the Overpass mirror fallback returns stations. Delete after use.
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const targets = [
  ['Canada',     '../services/scrapers/canada',     'fetchCanadaStations'],
  ['Malaysia',   '../services/scrapers/malaysia',   'fetchMalaysiaStations'],
  ['NewZealand', '../services/scrapers/newzealand', 'fetchNewZealandStations'],
  ['SouthKorea', '../services/scrapers/southkorea', 'fetchSouthKoreaStations'],
  ['Thailand',   '../services/scrapers/thailand',   'fetchThailandStations'],
];

async function run() {
  for (const [label, mod, fn] of targets) {
    const start = Date.now();
    try {
      const fetchFn = require(mod)[fn];
      const stations = await fetchFn();
      const secs = ((Date.now() - start) / 1000).toFixed(1);
      const withPrice = stations.filter(s => s.prices && s.prices.length).length;
      const sample = stations[0];
      console.log(`\n✅ ${label}: ${stations.length} stations (${withPrice} with prices) in ${secs}s`);
      if (sample) {
        console.log(`   sample: ${sample.name || sample.externalId} @ ${sample.lat},${sample.lng} | prices=${JSON.stringify(sample.prices)}`);
      }
    } catch (err) {
      const secs = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`\n❌ ${label}: ERROR after ${secs}s — ${err.message}`);
    }
  }
  console.log('\n--- verification done ---');
}

run();
