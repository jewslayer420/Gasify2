// City geocoding. Primary: MapTiler (commercial-licensed, key in MAPTILER_KEY).
// Fallback: public Nominatim (≤1 req/s, non-commercial) when no key is set, so dev
// environments keep working. Both return the same shape; boundingBox keeps
// Nominatim's [minLat, maxLat, minLng, maxLng] order, which callers destructure.
const MAPTILER_BASE = 'https://api.maptiler.com/geocoding';
const UA = 'Gasify/1.0 (fuel price app)';

async function maptilerGeocode(city, key) {
  // No `types` filter: capitals indexed as state-level entities (Wien, Bruxelles)
  // carry type "region" and would be excluded, making "Vienna" resolve to
  // Vienna, Virginia. language=en ranks exonym searches correctly.
  const url = `${MAPTILER_BASE}/${encodeURIComponent(city)}.json?key=${key}&limit=1&language=en`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`MapTiler geocode HTTP ${res.status}`);
  const data = await res.json();
  const f = data.features?.[0];
  if (!f) return null;
  return {
    lat: f.center[1],
    lng: f.center[0],
    displayName: f.text || f.place_name || city,
    // MapTiler bbox is [minLng, minLat, maxLng, maxLat] — reorder to Nominatim's
    boundingBox: f.bbox ? [f.bbox[1], f.bbox[3], f.bbox[0], f.bbox[2]] : null,
  };
}

async function nominatimGeocode(city) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1&addressdetails=1`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
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

async function geocodeCity(city) {
  const key = process.env.MAPTILER_KEY;
  if (key) {
    try {
      return await maptilerGeocode(city, key);
    } catch (err) {
      console.warn(`[geo] MapTiler geocode failed (${err.message}) — falling back to Nominatim`);
    }
  }
  return nominatimGeocode(city);
}

async function reverseGeocodeCity(lat, lng) {
  const key = process.env.MAPTILER_KEY;
  if (key) {
    try {
      // types=municipality: without it the first hit is a sub-city district
      const url = `${MAPTILER_BASE}/${lng},${lat}.json?key=${key}&limit=1&types=municipality&language=en`;
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const name = data.features?.[0]?.text;
      if (name) return name;
    } catch (err) {
      console.warn(`[geo] MapTiler reverse failed (${err.message}) — falling back to Nominatim`);
    }
  }
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const data = await res.json();
  const addr = data.address || {};
  return addr.city || addr.town || addr.village || addr.municipality || null;
}

module.exports = { geocodeCity, reverseGeocodeCity };
