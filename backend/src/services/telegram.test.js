const { test } = require('node:test');
const assert = require('node:assert/strict');

test('sendTelegram: returns false and does not call fetch when unconfigured', async () => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  let called = false;
  const realFetch = global.fetch;
  global.fetch = async () => { called = true; return { ok: true }; };
  try {
    const { sendTelegram } = require('./telegram');
    const result = await sendTelegram('hello');
    assert.equal(result, false);
    assert.equal(called, false);
  } finally {
    global.fetch = realFetch;
  }
});
