const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  thresholdHoursFor, classifyStale, formatStaleMessage,
  VOLATILE_HOURS, WEEKLY_HOURS,
} = require('./freshness_monitor');

test('thresholdHoursFor: volatile country uses 48h', () => {
  assert.equal(thresholdHoursFor('FR'), VOLATILE_HOURS);
});

test('thresholdHoursFor: weekly (non-volatile, non-muted) uses 288h', () => {
  assert.equal(thresholdHoursFor('PL'), WEEKLY_HOURS);
});

test('thresholdHoursFor: muted override returns null', () => {
  assert.equal(thresholdHoursFor('AR'), null);
});

test('classifyStale: fresh volatile country is not stale', () => {
  const now = Date.UTC(2026, 0, 10);
  const autoRows = [{ country: 'FR', last: new Date(now - 10 * 3600000) }]; // 10h old
  assert.deepEqual(classifyStale({ autoRows, manual: [], now }), []);
});

test('classifyStale: stale volatile country flagged with hours', () => {
  const now = Date.UTC(2026, 0, 10);
  const autoRows = [{ country: 'FR', last: new Date(now - 60 * 3600000) }]; // 60h > 48h
  const out = classifyStale({ autoRows, manual: [], now });
  assert.equal(out.length, 1);
  assert.equal(out[0].cc, 'FR');
  assert.equal(out[0].kind, 'auto');
  assert.equal(Math.round(out[0].ageH), 60);
});

test('classifyStale: muted country (AR) never flagged even when very old', () => {
  const now = Date.UTC(2026, 0, 10);
  const autoRows = [{ country: 'AR', last: new Date(now - 1000 * 3600000) }];
  assert.deepEqual(classifyStale({ autoRows, manual: [], now }), []);
});

test('classifyStale: null last (never synced) counts as stale', () => {
  const now = Date.UTC(2026, 0, 10);
  const autoRows = [{ country: 'FR', last: null }];
  const out = classifyStale({ autoRows, manual: [], now });
  assert.equal(out.length, 1);
  assert.equal(out[0].cc, 'FR');
});

test('classifyStale: manual country excluded from auto, taken from manual list', () => {
  const now = Date.UTC(2026, 0, 10);
  // SA is manual — even though it appears in autoRows it must be skipped there
  const autoRows = [{ country: 'SA', last: new Date(now - 1000 * 3600000) }];
  const manual = [{ cc: 'SA', label: 'Saudi Arabia', ageDays: 130, stale: true }];
  const out = classifyStale({ autoRows, manual, now });
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'manual');
  assert.equal(out[0].ageDays, 130);
});

test('classifyStale: old prices but fresh sync run is NOT stale (unchanged-price false positive)', () => {
  const now = Date.UTC(2026, 0, 10);
  const autoRows = [{ country: 'MT', last: new Date(now - 400 * 3600000) }]; // price unchanged 400h
  const syncRows = [{ country: 'MT', lastSyncAt: new Date(now - 5 * 3600000) }]; // synced 5h ago
  assert.deepEqual(classifyStale({ autoRows, manual: [], syncRows, now }), []);
});

test('classifyStale: old prices AND old sync run is stale', () => {
  const now = Date.UTC(2026, 0, 10);
  const autoRows = [{ country: 'MT', last: new Date(now - 400 * 3600000) }];
  const syncRows = [{ country: 'MT', lastSyncAt: new Date(now - 300 * 3600000) }]; // 300h > 288h
  const out = classifyStale({ autoRows, manual: [], syncRows, now });
  assert.equal(out.length, 1);
  assert.equal(out[0].cc, 'MT');
  assert.equal(Math.round(out[0].ageH), 300);
});

test('classifyStale: fresh sync but prices frozen past sanity window is stale', () => {
  const now = Date.UTC(2026, 0, 10);
  const autoRows = [{ country: 'MT', last: new Date(now - 1200 * 3600000) }]; // 50 days frozen
  const syncRows = [{ country: 'MT', lastSyncAt: new Date(now - 2 * 3600000) }];
  const out = classifyStale({ autoRows, manual: [], syncRows, now });
  assert.equal(out.length, 1);
  assert.equal(out[0].cc, 'MT');
});

test('classifyStale: no sync row falls back to price-age logic', () => {
  const now = Date.UTC(2026, 0, 10);
  const autoRows = [{ country: 'PL', last: new Date(now - 400 * 3600000) }];
  const out = classifyStale({ autoRows, manual: [], syncRows: [], now });
  assert.equal(out.length, 1);
  assert.equal(out[0].cc, 'PL');
});

test('formatStaleMessage: compact one-line summary', () => {
  const msg = formatStaleMessage([
    { cc: 'FR', kind: 'auto', ageH: 61 },
    { cc: 'SA', kind: 'manual', ageDays: 130, label: 'Saudi Arabia' },
  ]);
  assert.match(msg, /Gasify/);
  assert.match(msg, /FR 61h/);
  assert.match(msg, /SA 130d/);
});
