async function geocodeCity(city) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1&countrycodes=si,at,hr,hu,fr`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Gasify/1.0 (fuel price app)' } });
  const data = await res.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

module.exports = { geocodeCity };
