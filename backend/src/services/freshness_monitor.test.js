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

test('formatStaleMessage: compact one-line summary', () => {
  const msg = formatStaleMessage([
    { cc: 'FR', kind: 'auto', ageH: 61 },
    { cc: 'SA', kind: 'manual', ageDays: 130, label: 'Saudi Arabia' },
  ]);
  assert.match(msg, /Gasify/);
  assert.match(msg, /FR 61h/);
  assert.match(msg, /SA 130d/);
});
