const { test } = require('node:test');
const assert = require('node:assert');
const { makeLimiter } = require('./rateLimit');

function fakeReqRes(ip = '1.2.3.4', email = 'a@b.c') {
  const req = { ip, body: { email } };
  const res = {
    statusCode: null, headers: {}, body: null,
    set(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  return { req, res };
}

function run(limiter, req) {
  const { res } = fakeReqRes();
  let passed = false;
  limiter(req, res, () => { passed = true; });
  return { passed, res };
}

test('allows up to max within the window, then 429 with Retry-After', () => {
  let t = 0;
  const limiter = makeLimiter({ windowMs: 60000, max: 3, keyFn: r => r.ip, now: () => t });
  const { req } = fakeReqRes();
  for (let i = 0; i < 3; i++) assert.strictEqual(run(limiter, req).passed, true);
  const blocked = run(limiter, req);
  assert.strictEqual(blocked.passed, false);
  assert.strictEqual(blocked.res.statusCode, 429);
  assert.ok(Number(blocked.res.headers['Retry-After']) > 0);
});

test('window slides: old hits expire and requests pass again', () => {
  let t = 0;
  const limiter = makeLimiter({ windowMs: 60000, max: 2, keyFn: r => r.ip, now: () => t });
  const { req } = fakeReqRes();
  run(limiter, req); run(limiter, req);
  assert.strictEqual(run(limiter, req).passed, false);
  t = 60001; // first hits leave the window
  assert.strictEqual(run(limiter, req).passed, true);
});

test('keys are independent (different ip or email)', () => {
  let t = 0;
  const limiter = makeLimiter({ windowMs: 60000, max: 1, keyFn: r => `${r.ip}|${r.body.email}`, now: () => t });
  assert.strictEqual(run(limiter, fakeReqRes('1.1.1.1', 'x@y.z').req).passed, true);
  assert.strictEqual(run(limiter, fakeReqRes('1.1.1.1', 'x@y.z').req).passed, false);
  assert.strictEqual(run(limiter, fakeReqRes('2.2.2.2', 'x@y.z').req).passed, true);
  assert.strictEqual(run(limiter, fakeReqRes('1.1.1.1', 'other@y.z').req).passed, true);
});
