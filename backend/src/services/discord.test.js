const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sendDiscord } = require('./discord');

test('sendDiscord: returns false and does not call fetch when unconfigured', async () => {
  delete process.env.DISCORD_WEBHOOK_URL;
  let called = false;
  const realFetch = global.fetch;
  global.fetch = async () => { called = true; return { ok: true }; };
  try {
    assert.equal(await sendDiscord('hello'), false);
    assert.equal(called, false);
  } finally {
    global.fetch = realFetch;
  }
});

test('sendDiscord: posts content to the webhook URL and returns true', async () => {
  process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1/tok';
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    assert.equal(url, 'https://discord.com/api/webhooks/1/tok');
    assert.equal(JSON.parse(opts.body).content, 'hi');
    return { ok: true };
  };
  try {
    assert.equal(await sendDiscord('hi'), true);
  } finally {
    global.fetch = realFetch;
    delete process.env.DISCORD_WEBHOOK_URL;
  }
});

test('sendDiscord: throws on a non-OK response', async () => {
  process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1/tok';
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 404, text: async () => 'Unknown Webhook' });
  try {
    await assert.rejects(() => sendDiscord('hi'), /Discord HTTP 404/);
  } finally {
    global.fetch = realFetch;
    delete process.env.DISCORD_WEBHOOK_URL;
  }
});

test('sendDiscord: normalizes a quoted and scheme-less secret value', async () => {
  process.env.DISCORD_WEBHOOK_URL = '"discord.com/api/webhooks/1/tok"\n';
  const realFetch = global.fetch;
  let calledWith = null;
  global.fetch = async (url) => { calledWith = url; return { ok: true }; };
  try {
    assert.equal(await sendDiscord('hi'), true);
    assert.equal(calledWith, 'https://discord.com/api/webhooks/1/tok');
  } finally {
    global.fetch = realFetch;
    delete process.env.DISCORD_WEBHOOK_URL;
  }
});

test('sendDiscord: throws a clear error when the secret is not a URL at all', async () => {
  process.env.DISCORD_WEBHOOK_URL = 'https://not a url';
  const realFetch = global.fetch;
  global.fetch = async () => { throw new Error('should not be called'); };
  try {
    await assert.rejects(() => sendDiscord('hi'), /not a valid URL/);
  } finally {
    global.fetch = realFetch;
    delete process.env.DISCORD_WEBHOOK_URL;
  }
});
