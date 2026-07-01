const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sendTelegram } = require('./telegram');

test('sendTelegram: returns false and does not call fetch when unconfigured', async () => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  let called = false;
  const realFetch = global.fetch;
  global.fetch = async () => { called = true; return { ok: true }; };
  try {
    const result = await sendTelegram('hello');
    assert.equal(result, false);
    assert.equal(called, false);
  } finally {
    global.fetch = realFetch;
  }
});

test('sendTelegram: posts to the bot URL with chat_id/text and returns true on success', async () => {
  process.env.TELEGRAM_BOT_TOKEN = 'tok';
  process.env.TELEGRAM_CHAT_ID = 'cid';
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    assert.ok(url.includes('/bottok/sendMessage'), `unexpected url: ${url}`);
    const body = JSON.parse(opts.body);
    assert.equal(body.chat_id, 'cid');
    assert.equal(body.text, 'hi');
    return { ok: true };
  };
  try {
    assert.equal(await sendTelegram('hi'), true);
  } finally {
    global.fetch = realFetch;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  }
});

test('sendTelegram: throws on a non-OK response', async () => {
  process.env.TELEGRAM_BOT_TOKEN = 'tok';
  process.env.TELEGRAM_CHAT_ID = 'cid';
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 400, text: async () => 'Bad Request' });
  try {
    await assert.rejects(() => sendTelegram('hi'), /Telegram HTTP 400/);
  } finally {
    global.fetch = realFetch;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  }
});
