// Price-drop alert digests — spec: docs/superpowers/specs/2026-07-18-price-drop-alerts-design.md
//
// Detection: a favorited (station, fuelType) "dropped" when its newest
// PriceHistory row inside the last 24h is lower than the newest row OLDER
// than 24h (net drop — a dip that recovered doesn't alert). One batched
// query (GHA runner → Neon: never per-row). Free plan is capped to the 3
// oldest favorites; premium/admin uncapped.

const FREE_STATION_CAP = 3;

const FUEL_LABELS = {
  diesel: 'Diesel', diesel_premium: 'Diesel+', sp95: 'Petrol 95', sp98: 'Petrol 98',
  sp100: 'Petrol 100', e10: 'E10', e20: 'E20', e85: 'E85', lpg: 'LPG', cng: 'CNG',
};

// One row per user × favorited station × dropped fuel, for users due a digest.
async function queryDrops(prisma) {
  return prisma.$queryRaw`
    SELECT u.id          AS "userId",
           u.email,
           u.plan,
           s.id          AS "stationId",
           s.name,
           s.city,
           s.country,
           f."createdAt" AS "favoritedAt",
           latest."fuelType",
           latest.price  AS "newPrice",
           baseline.price AS "oldPrice"
    FROM "User" u
    JOIN "Favorite" f ON f."userId" = u.id
    JOIN "Station" s  ON s.id = f."stationId"
    JOIN LATERAL (
      SELECT DISTINCT ON ("fuelType") "fuelType", price
      FROM "PriceHistory"
      WHERE "stationId" = s.id AND "recordedAt" >= NOW() - interval '24 hours'
      ORDER BY "fuelType", "recordedAt" DESC
    ) latest ON TRUE
    JOIN LATERAL (
      SELECT price
      FROM "PriceHistory" p2
      WHERE p2."stationId" = s.id AND p2."fuelType" = latest."fuelType"
        AND p2."recordedAt" < NOW() - interval '24 hours'
      ORDER BY p2."recordedAt" DESC
      LIMIT 1
    ) baseline ON TRUE
    WHERE u."alertsEnabled"
      AND u."emailVerified"
      AND (u."lastAlertAt" IS NULL OR u."lastAlertAt" < NOW() - interval '20 hours')
      AND latest.price < baseline.price`;
}

// Pure: rows -> per-user digests. Free plan keeps the 3 oldest favorited
// stations (deterministic — matches the pricing page's "up to 3 favorites").
function buildDigests(rows) {
  const byUser = new Map();
  for (const r of rows) {
    if (!byUser.has(r.userId)) {
      byUser.set(r.userId, { userId: r.userId, email: r.email, plan: r.plan, stations: new Map() });
    }
    const u = byUser.get(r.userId);
    if (!u.stations.has(r.stationId)) {
      u.stations.set(r.stationId, {
        stationId: r.stationId, name: r.name, city: r.city, country: r.country,
        favoritedAt: new Date(r.favoritedAt), drops: [],
      });
    }
    u.stations.get(r.stationId).drops.push({
      fuelType: r.fuelType,
      oldPrice: Number(r.oldPrice),
      newPrice: Number(r.newPrice),
    });
  }

  const digests = [];
  for (const u of byUser.values()) {
    let stations = [...u.stations.values()].sort((a, b) => a.favoritedAt - b.favoritedAt);
    const capped = u.plan === 'free' && stations.length > FREE_STATION_CAP;
    if (capped) stations = stations.slice(0, FREE_STATION_CAP);
    digests.push({
      userId: u.userId,
      email: u.email,
      plan: u.plan,
      stations,
      capped,
      totalDrops: stations.reduce((n, s) => n + s.drops.length, 0),
    });
  }
  return digests;
}

function pct(oldPrice, newPrice) {
  return ((newPrice - oldPrice) / oldPrice * 100).toFixed(1);
}

// Pure: digest -> { subject, html } for the email service.
function formatDigestEmail(digest) {
  const n = digest.stations.length;
  const subject = `⛽ ${n === 1 ? digest.stations[0].name : `${n} of your stations`} got cheaper`;
  const frontend = process.env.FRONTEND_URL || 'https://gasify.eu';

  const stationBlocks = digest.stations.map(s => {
    const dropRows = s.drops.map(d =>
      `<tr>
        <td style="padding:4px 12px 4px 0">${FUEL_LABELS[d.fuelType] ?? d.fuelType}</td>
        <td style="padding:4px 12px 4px 0;color:#888"><s>€${d.oldPrice.toFixed(3)}</s></td>
        <td style="padding:4px 12px 4px 0;font-weight:700">€${d.newPrice.toFixed(3)}</td>
        <td style="padding:4px 0;color:#22c55e;font-weight:700">${pct(d.oldPrice, d.newPrice)}%</td>
      </tr>`).join('');
    return `
      <div style="margin:18px 0;padding:14px 16px;border:1px solid #e5e5e5;border-radius:10px">
        <div style="font-weight:700">${s.name}</div>
        <div style="color:#888;font-size:13px;margin-bottom:8px">${[s.city, s.country].filter(Boolean).join(', ')}</div>
        <table style="border-collapse:collapse;font-size:14px">${dropRows}</table>
      </div>`;
  }).join('');

  const cappedNote = digest.capped
    ? `<p style="color:#888;font-size:13px">Free plan watches your <b>first 3 favorites</b> — more of your stations may have moved. Premium watches them all.</p>`
    : '';

  const html = `
    <h2>Prices dropped at ${n === 1 ? 'a station you follow' : `${n} stations you follow`}</h2>
    ${stationBlocks}
    ${cappedNote}
    <a href="${frontend}/map" style="background:#22c55e;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">Open the map</a>
    <p style="color:#888;font-size:12px;margin-top:24px">Prices in EUR/L from official sources, compared with yesterday.
    Manage alerts in your <a href="${frontend}/dashboard" style="color:#888">dashboard</a>.</p>`;

  return { subject, html };
}

module.exports = { queryDrops, buildDigests, formatDigestEmail, FREE_STATION_CAP, FUEL_LABELS };
