// Sweden fuel prices
// Sweden has no government mandate for fuel price reporting (unlike Norway).
// Status of major chains:
//   OKQ8:     GetStationsBasedOnFilter API → 729 stations with coords, NO prices exposed
//   Preem:    stations-store.json → ~112 stations with coords, NO prices exposed
//   ST1:      station locator page works, NO price API accessible
//   Circle K: EU API (api.circlek.com) returns 400 for SE — not supported
//   Shell:    No Swedish geoapp endpoint found
// No Swedish fuel price aggregator with a public API has been found.
// Returning [] until a working source is identified.

async function fetchSwedenStations() {
  console.log('[sweden] No working price source found — returning []');
  return [];
}

module.exports = { fetchSwedenStations };
