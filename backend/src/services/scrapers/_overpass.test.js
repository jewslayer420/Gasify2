const { test } = require('node:test');
const assert = require('node:assert/strict');
const { stationsFromDb, MIN_DB_STATIONS } = require('./_overpass');

// Fake prisma client capturing findMany args
function fakeDb(rows) {
  const calls = [];
  return {
    calls,
    station: { findMany: async args => { calls.push(args); return rows; } },
  };
}

function dbRows(n, cc = 'RS') {
  return Array.from({ length: n }, (_, i) => ({
    externalId: `REG-${cc}-OSM-node-${i}`,
    name: `Station ${i}`, brand: i % 2 ? 'NIS' : null,
    lat: 44 + i / 100, lng: 20 + i / 100,
    address: null, city: 'Beograd', country: cc,
  }));
}

test('stationsFromDb: maps seeded DB rows to scraper shape with prices attached', async () => {
  const db = fakeDb(dbRows(MIN_DB_STATIONS));
  const priceList = [{ fuelType: 'sp95', price: 1.66 }];
  const out = await stationsFromDb('REG-RS-OSM-', () => priceList, 'serbia', db);

  assert.equal(out.length, MIN_DB_STATIONS);
  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].where.externalId.startsWith, 'REG-RS-OSM-');
  const s = out[0];
  assert.equal(s.externalId, 'REG-RS-OSM-node-0');
  assert.equal(s.name, 'Station 0');
  assert.equal(s.country, 'RS');
  assert.equal(s.lat, 44);
  assert.deepEqual(s.prices, priceList);
});

test('stationsFromDb: returns null when the country is not seeded (too few rows)', async () => {
  const db = fakeDb(dbRows(MIN_DB_STATIONS - 1));
  const out = await stationsFromDb('REG-RS-OSM-', () => [], 'serbia', db);
  assert.equal(out, null);
});

test('stationsFromDb: returns null without querying when STATION_DISCOVERY=1', async () => {
  process.env.STATION_DISCOVERY = '1';
  try {
    const db = fakeDb(dbRows(50));
    const out = await stationsFromDb('REG-RS-OSM-', () => [], 'serbia', db);
    assert.equal(out, null);
    assert.equal(db.calls.length, 0);
  } finally {
    delete process.env.STATION_DISCOVERY;
  }
});

test('stationsFromDb: priceFor runs per row (brand-dependent pricing)', async () => {
  const db = fakeDb(dbRows(12));
  const branded = [{ fuelType: 'sp95', price: 1.10 }];
  const fallback = [{ fuelType: 'sp95', price: 1.20 }];
  const out = await stationsFromDb('REG-RS-OSM-', r => (r.brand ? branded : fallback), 'serbia', db);
  assert.deepEqual(out[0].prices, fallback); // brand null
  assert.deepEqual(out[1].prices, branded);  // brand 'NIS'
});
