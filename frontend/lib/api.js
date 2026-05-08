const BASE = '';  // Next.js rewrites /api/* → backend

export async function getStations({ fuel = 'diesel', lat, lng, bbox, near, city, zoom } = {}) {
  const params = new URLSearchParams({ fuel });
  if (lat) params.set('lat', lat);
  if (lng) params.set('lng', lng);
  if (bbox) params.set('bbox', bbox);
  if (near) params.set('near', '1');
  if (city) params.set('city', city);
  if (zoom != null) params.set('zoom', zoom);
  const res = await fetch(`${BASE}/api/stations?${params}`);
  if (!res.ok) throw new Error('Failed to fetch stations');
  return res.json();
}

export async function getCountryCounts() {
  const res = await fetch(`${BASE}/api/stations/counts`);
  if (!res.ok) return {};
  return res.json();
}

export async function geocodeCity(city) {
  const res = await fetch(`${BASE}/api/stations/geocode?city=${encodeURIComponent(city)}`);
  if (!res.ok) return null;
  return res.json(); // { lat, lng, displayName, boundingBox }
}

export async function getStation(id) {
  const res = await fetch(`${BASE}/api/stations/${id}`);
  if (!res.ok) throw new Error('Station not found');
  return res.json();
}

export async function getStationHistory(id, fuelType) {
  const res = await fetch(`${BASE}/api/stations/${id}/history/${fuelType}`);
  if (!res.ok) return [];
  return res.json();
}

export async function getNews() {
  const res = await fetch(`${BASE}/api/news`);
  if (!res.ok) return [];
  return res.json();
}

export async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}

export async function register(email, password) {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  return data;
}

export async function logout() {
  await fetch(`${BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
}

export async function getFavorites() {
  const res = await fetch(`${BASE}/api/user/favorites`, { credentials: 'include' });
  if (!res.ok) return [];
  return res.json();
}

export async function addFavorite(stationId) {
  const res = await fetch(`${BASE}/api/user/favorites/${stationId}`, { method: 'POST', credentials: 'include' });
  if (!res.ok) throw new Error('Failed');
}

export async function removeFavorite(stationId) {
  await fetch(`${BASE}/api/user/favorites/${stationId}`, { method: 'DELETE', credentials: 'include' });
}

export async function getSavedLocations() {
  const res = await fetch(`${BASE}/api/user/locations`, { credentials: 'include' });
  if (!res.ok) return [];
  return res.json();
}

export async function saveLocation(data) {
  const res = await fetch(`${BASE}/api/user/locations`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

export async function deleteLocation(id) {
  await fetch(`${BASE}/api/user/locations/${id}`, { method: 'DELETE', credentials: 'include' });
}
