// Turn-by-turn driving directions via OSRM's public demo server — free, no
// API key, CORS-enabled. It's a shared demo instance (no SLA, rate-limited),
// fine for this scale; move to a self-hosted or paid router before real
// launch traffic (same "free tier for now" posture as MapTiler/Nominatim
// elsewhere in this app).
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

const MODIFIER_WORD = {
  'slight left': 'slight left', 'sharp left': 'sharp left', left: 'left',
  'slight right': 'slight right', 'sharp right': 'sharp right', right: 'right',
  straight: 'straight', uturn: 'a U-turn',
};

// OSRM's maneuver.type/modifier -> a short human instruction. Not exhaustive
// (OSRM's own osrm-text-instructions library covers every locale/edge case) —
// covers the maneuvers that actually show up on real routes.
function stepInstruction(step) {
  const { maneuver, name } = step;
  const road = name?.trim() ? name.trim() : 'the road';
  const mod = MODIFIER_WORD[maneuver.modifier] ?? maneuver.modifier;

  switch (maneuver.type) {
    case 'depart': return `Head out onto ${road}`;
    case 'arrive': return maneuver.modifier ? `Arrive at your destination, on the ${mod}` : 'Arrive at your destination';
    case 'turn': return mod ? `Turn ${mod} onto ${road}` : `Continue onto ${road}`;
    case 'new name': return `Continue onto ${road}`;
    case 'merge': return `Merge ${mod ? mod + ' ' : ''}onto ${road}`;
    case 'on ramp': return `Take the ramp onto ${road}`;
    case 'off ramp': return `Take the exit onto ${road}`;
    case 'fork': return `Keep ${mod || 'straight'} onto ${road}`;
    case 'end of road': return `Turn ${mod || ''} onto ${road}`.trim();
    case 'roundabout':
    case 'rotary': return `Enter the roundabout and take the exit onto ${road}`;
    case 'roundabout turn': return `At the roundabout, turn ${mod} onto ${road}`;
    case 'continue': return `Continue ${mod ? mod + ' ' : ''}onto ${road}`;
    default: return `Continue onto ${road}`;
  }
}

// (lat, lng) pairs in, { geometry, distanceKm, durationMin, steps } out (or
// null on any failure — caller shows a friendly "couldn't find a route").
export async function getRoute(from, to) {
  const url = `${OSRM_BASE}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return null;

    const steps = (route.legs?.[0]?.steps ?? []).map(s => ({
      instruction: stepInstruction(s),
      distanceKm: s.distance / 1000,
    }));

    return {
      geometry: route.geometry, // GeoJSON LineString, ready for a <Source>
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
      steps,
    };
  } catch {
    return null;
  }
}

export function fmtDuration(min) {
  if (min == null) return '—';
  if (min < 1) return '<1 min';
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}min` : `${h}h`;
}
