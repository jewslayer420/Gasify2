async function geocodeCity(city) {
  // Global city search — no countrycodes restriction (previously hardcoded to
  // si,at,hr,hu,fr, which broke search for ~53 of the 58 covered countries).
  // NOTE: runs on the public Nominatim server (≤1 req/s, no bulk/commercial use) —
  // move to a paid/self-hosted geocoder before commercial launch (INFRA_MIGRATION_PLAN.md).
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1&addressdetails=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Gasify/1.0 (fuel price app)' } });
  const data = await res.json();
  if (!data.length) return null;
  const item = data[0];
  return {
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    displayName: item.address?.city || item.address?.town || item.address?.village || city,
    boundingBox: item.boundingbox ? item.boundingbox.map(Number) : null,
  };
}

async function reverseGeocodeCity(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Gasify/1.0 (fuel price app)' } });
  const data = await res.json();
  const addr = data.address || {};
  return addr.city || addr.town || addr.village || addr.municipality || null;
}

module.exports = { geocodeCity, reverseGeocodeCity };
