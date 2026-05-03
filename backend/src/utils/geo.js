async function geocodeCity(city) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1&countrycodes=si,at,hr,hu,fr&addressdetails=1`;
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
