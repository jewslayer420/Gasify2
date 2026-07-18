const { test } = require('node:test');
const assert = require('node:assert');
const { buildDigests, formatDigestEmail } = require('./price_alerts');

// Shape of one row from the drops query (one row per user × station × fuel).
function row(over = {}) {
  return {
    userId: 'u1', email: 'a@example.com', plan: 'free',
    stationId: 's1', name: 'Shell Center', city: 'Ljubljana', country: 'SI',
    favoritedAt: new Date('2026-01-01'),
    fuelType: 'diesel', newPrice: 1.489, oldPrice: 1.532,
    ...over,
  };
}

test('groups rows per user and per station', () => {
  const digests = buildDigests([
    row(),
    row({ fuelType: 'sp95', newPrice: 1.522, oldPrice: 1.55 }),
    row({ stationId: 's2', name: 'Petrol Vič', favoritedAt: new Date('2026-02-01') }),
    row({ userId: 'u2', email: 'b@example.com', plan: 'premium' }),
  ]);
  assert.strictEqual(digests.length, 2);
  const a = digests.find(d => d.userId === 'u1');
  assert.strictEqual(a.stations.length, 2);
  assert.strictEqual(a.stations[0].drops.length, 2); // diesel + sp95 at s1
  assert.strictEqual(a.totalDrops, 3);
});

test('free plan caps at the 3 oldest favorited stations; premium is uncapped', () => {
  const mk = (plan) => [1, 2, 3, 4, 5].map(i =>
    row({ plan, stationId: `s${i}`, name: `St ${i}`, favoritedAt: new Date(`2026-0${i}-01`) }));
  const free = buildDigests(mk('free'))[0];
  assert.deepStrictEqual(free.stations.map(s => s.stationId), ['s1', 's2', 's3']);
  assert.strictEqual(free.capped, true);
  const prem = buildDigests(mk('premium'))[0];
  assert.strictEqual(prem.stations.length, 5);
  assert.strictEqual(prem.capped, false);
});

test('free cap keeps OLDEST favorites regardless of row order', () => {
  const rows = [
    row({ stationId: 's9', name: 'Newest', favoritedAt: new Date('2026-06-01') }),
    row({ stationId: 's1', name: 'Oldest', favoritedAt: new Date('2025-01-01') }),
    row({ stationId: 's5', favoritedAt: new Date('2026-03-01') }),
    row({ stationId: 's7', favoritedAt: new Date('2026-04-01') }),
  ];
  const d = buildDigests(rows)[0];
  assert.deepStrictEqual(d.stations.map(s => s.stationId), ['s1', 's5', 's7']);
});

test('drop percentages and formatting land in the email html', () => {
  const [digest] = buildDigests([row()]); // 1.532 -> 1.489 = -2.8%
  const { subject, html } = formatDigestEmail(digest);
  assert.match(subject, /cheaper/i);
  assert.match(html, /Shell Center/);
  assert.match(html, /1\.532/);
  assert.match(html, /1\.489/);
  assert.match(html, /-2\.8%/);
  assert.match(html, /Diesel/); // FUEL_LABELS mapping, not the raw key
});

test('capped digest mentions the free-tier limit in the email', () => {
  const rows = [1, 2, 3, 4].map(i =>
    row({ stationId: `s${i}`, favoritedAt: new Date(`2026-0${i}-01`) }));
  const { html } = formatDigestEmail(buildDigests(rows)[0]);
  assert.match(html, /first 3 favorites/i);
  const { html: premHtml } = formatDigestEmail(buildDigests([row({ plan: 'premium' })])[0]);
  assert.doesNotMatch(premHtml, /first 3 favorites/i);
});

test('empty input produces no digests', () => {
  assert.deepStrictEqual(buildDigests([]), []);
});
