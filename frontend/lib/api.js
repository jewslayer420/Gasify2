const BASE = '';  // Next.js rewrites /api/* → backend

export async function getStationsGeoJSON(fuel = 'diesel') {
  const res = await fetch(`${BASE}/api/stations/geojson?fuel=${fuel}`);
  if (!res.ok) throw new Error('Failed to fetch GeoJSON');
  return res.json();
}

export async function getStations({ fuel = 'diesel', lat, lng, bbox, near, city, zoom, country } = {}) {
  const params = new URLSearchParams({ fuel });
  if (lat) params.set('lat', lat);
  if (lng) params.set('lng', lng);
  if (bbox) params.set('bbox', bbox);
  if (near) params.set('near', '1');
  if (city) params.set('city', city);
  if (zoom != null) params.set('zoom', zoom);
  if (country) params.set('country', country);
  const res = await fetch(`${BASE}/api/stations?${params}`);
  if (!res.ok) throw new Error('Failed to fetch stations');
  return res.json();
}

// World density grid for the map's low-zoom heatmap (one point per 0.3° cell,
// properties.w = station count). ~300KB gz vs the 11MB whole-world GeoJSON.
export async function getStationsOverview(fuel = 'diesel') {
  const res = await fetch(`${BASE}/api/stations/overview?fuel=${fuel}`);
  if (!res.ok) throw new Error('Failed to fetch overview');
  return res.json();
}

export async function getCountryCounts() {
  const res = await fetch(`${BASE}/api/stations/counts`);
  if (!res.ok) return {};
  return res.json();
}

export async function getCountryMeta(fuel = 'diesel') {
  const res = await fetch(`${BASE}/api/stations/country-meta?fuel=${fuel}`);
  if (!res.ok) return [];
  return res.json(); // [{ country, stations, median, fuels }]
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

export async function getNews({ country, city } = {}) {
  const params = new URLSearchParams();
  if (country) params.set('country', country);
  if (city) params.set('city', city);
  const qs = params.toString();
  const res = await fetch(`${BASE}/api/news${qs ? `?${qs}` : ''}`);
  if (!res.ok) return [];
  return res.json();
}

export async function getNewsPlaces(q) {
  const res = await fetch(`${BASE}/api/news/places?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  return res.json(); // [{ city, country, stations }]
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

export async function resendVerification(email) {
  const res = await fetch(`${BASE}/api/auth/resend-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not resend');
  return data;
}

export async function getAccount() {
  const res = await fetch(`${BASE}/api/user/account`, { credentials: 'include' });
  if (!res.ok) return null;
  return res.json(); // { email, emailVerified, role, plan, createdAt, hasPassword, googleLinked }
}

export async function setAlerts(enabled) {
  const res = await fetch(`${BASE}/api/user/alerts`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not update alerts');
  return data; // { alertsEnabled }
}

export async function changePassword(currentPassword, newPassword) {
  const res = await fetch(`${BASE}/api/auth/change-password`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not change password');
  return data;
}

export async function logout() {
  await fetch(`${BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
}

// Revokes every session on every device (and forgets trusted 2FA devices).
export async function logoutAll() {
  const res = await fetch(`${BASE}/api/auth/logout-all`, { method: 'POST', credentials: 'include' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not sign out everywhere');
  return data;
}

// ── Admin (requires role=admin; backend re-checks on every call) ──

async function adminFetch(path, opts = {}) {
  const res = await fetch(`${BASE}/api/admin${path}`, {
    credentials: 'include',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Admin request failed (${res.status})`);
  return data;
}

export const adminOverview = () => adminFetch('/overview');
export const adminSyncStatus = () => adminFetch('/sync');
export const adminUsers = (q = '', skip = 0) => adminFetch(`/users?q=${encodeURIComponent(q)}&skip=${skip}`);
export const adminUpdateUser = (id, patch) => adminFetch(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const adminDeleteUser = (id) => adminFetch(`/users/${id}`, { method: 'DELETE' });

// ── Two-factor authentication ──
export async function twoFactorLogin(mfaToken, code) {
  const res = await fetch(`${BASE}/api/auth/2fa/login`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mfaToken, code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Sign-in failed');
  return data;
}

export async function get2faStatus() {
  const res = await fetch(`${BASE}/api/auth/2fa/status`, { credentials: 'include' });
  if (!res.ok) return null;
  return res.json(); // { totpEnabled, backupCodesLeft, hasPassword, googleLinked }
}

export async function setup2fa() {
  const res = await fetch(`${BASE}/api/auth/2fa/setup`, { method: 'POST', credentials: 'include' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Setup failed');
  return data; // { secret, otpauthUrl, qr }
}

export async function enable2fa(code) {
  const res = await fetch(`${BASE}/api/auth/2fa/enable`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not enable two-factor');
  return data; // { enabled, backupCodes }
}

export async function disable2fa(code) {
  const res = await fetch(`${BASE}/api/auth/2fa/disable`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not disable two-factor');
  return data;
}

// ── Email-code 2FA ──
export async function emailTwoFactorLogin(mfaToken, code, rememberDevice) {
  const res = await fetch(`${BASE}/api/auth/2fa/email/login`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mfaToken, code, rememberDevice }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Sign-in failed');
  return data;
}

export async function resendEmailCode(mfaToken) {
  const res = await fetch(`${BASE}/api/auth/2fa/email/resend`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mfaToken }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not resend the code');
  return data;
}

export async function setEmail2fa(enabled) {
  const res = await fetch(`${BASE}/api/auth/2fa/email/${enabled ? 'enable' : 'disable'}`, {
    method: 'POST', credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not update email codes');
  return data;
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
