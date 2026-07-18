const { test } = require('node:test');
const assert = require('node:assert');
const { extractPrices, pricesFromBangchak } = require('./thailand');

// The exact breakage shipped by thai-oil-api since ~2026-07-05: success-shaped
// payload, every price an empty string. Must yield no prices (not garbage).
test('extractPrices returns [] for the empty-string thai-oil-api payload', () => {
  const broken = {
    gasoline_95: { name: '', price: '' },
    gasohol_95: { name: '', price: '' },
    gasohol_91: { name: '', price: '' },
    gasohol_e20: { name: '', price: '' },
    gasohol_e85: { name: '', price: '' },
    diesel: { name: '', price: '' },
  };
  assert.deepStrictEqual(extractPrices(broken), []);
});

test('extractPrices still works on a healthy thai-oil-api payload', () => {
  const healthy = {
    gasohol_95: { name: 'แก๊สโซฮอล์ 95', price: '37.45' },
    gasohol_e20: { name: 'E20', price: '32.45' },
    diesel: { name: 'ดีเซล', price: '37.50' },
  };
  const prices = extractPrices(healthy);
  assert.deepStrictEqual(prices, [
    { fuelType: 'sp95', price: 0.986 },
    { fuelType: 'e20', price: 0.854 },
    { fuelType: 'diesel', price: 0.987 },
  ]);
});

// Trimmed real response from https://www.bangchak.co.th/api/oilprice (2026-07-16).
// Order matters: Gasohol 91 appears BEFORE Gasohol 95 — sp95 must still come
// from Gasohol 95, and B20 must be skipped entirely.
const BANGCHAK_ITEMS = [
  { OilName: 'ดีเซล B20', OilNameEng: 'DIESEL B20', PriceToday: 29.94 },
  { OilName: 'ไฮดีเซล S', OilNameEng: 'Hi Diesel S', PriceToday: 34.94 },
  { OilName: 'ไฮ พรีเมียม ดีเซล พลัส', OilNameEng: 'Hi Premium Diesel Plus', PriceToday: 49.25 },
  { OilName: 'ไฮ พรีเมียม 98 พลัส', OilNameEng: 'Hi Premium 98 Plus', PriceToday: 48.44 },
  { OilName: 'แก๊สโซฮอล์ E85 S EVO', OilNameEng: 'Gasohol E85 S EVO', PriceToday: 25.88 },
  { OilName: 'แก๊สโซฮอล์ E20 S EVO', OilNameEng: 'Gasohol E20 S EVO', PriceToday: 29.94 },
  { OilName: 'แก๊สโซฮอล์ 91 S EVO', OilNameEng: 'Gasohol 91 S EVO', PriceToday: 34.57 },
  { OilName: 'แก๊สโซฮอล์ 95 S EVO', OilNameEng: 'Gasohol 95 S EVO', PriceToday: 34.94 },
];

test('pricesFromBangchak maps the official price board to app fuel types', () => {
  const prices = pricesFromBangchak(BANGCHAK_ITEMS);
  const byType = Object.fromEntries(prices.map(p => [p.fuelType, p.price]));
  assert.deepStrictEqual(byType, {
    diesel: 0.919,          // Hi Diesel S 34.94 THB
    diesel_premium: 1.296,  // Hi Premium Diesel Plus 49.25
    sp98: 1.275,            // Hi Premium 98 Plus 48.44
    e85: 0.681,             // Gasohol E85 25.88
    e20: 0.788,             // Gasohol E20 29.94
    sp95: 0.919,            // Gasohol 95 34.94 — NOT Gasohol 91 (0.910)
  });
});

test('pricesFromBangchak falls back to Gasohol 91 for sp95 when 95 is absent', () => {
  const items = BANGCHAK_ITEMS.filter(i => i.OilNameEng !== 'Gasohol 95 S EVO');
  const sp95 = pricesFromBangchak(items).find(p => p.fuelType === 'sp95');
  assert.deepStrictEqual(sp95, { fuelType: 'sp95', price: 0.91 }); // 34.57 THB
});

test('pricesFromBangchak tolerates garbage input', () => {
  assert.deepStrictEqual(pricesFromBangchak(undefined), []);
  assert.deepStrictEqual(pricesFromBangchak([]), []);
  assert.deepStrictEqual(pricesFromBangchak([{ OilNameEng: 'Hi Diesel S', PriceToday: '' }]), []);
  assert.deepStrictEqual(pricesFromBangchak([{ OilNameEng: 'Mystery Fuel', PriceToday: 30 }]), []);
});
