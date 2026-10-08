'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fakeBlobs = require('./fake-blobs'); fakeBlobs.install();
const subscribe = require('../netlify/functions/subscribe').handler;
const { listSignups } = require('../lib/signups');
const post = (o) => subscribe({ httpMethod: 'POST', body: JSON.stringify(o) });

test('subscribe saves a clean, lowercased email once', async () => {
  assert.equal((await post({ email: '  Reader@Example.COM ', source: 'home' })).statusCode, 200);
  assert.equal((await post({ email: 'reader@example.com', source: 'poetry' })).statusCode, 200);
  const all = await listSignups();
  assert.equal(all.length, 1); assert.equal(all[0].email, 'reader@example.com'); assert.equal(all[0].source, 'home');
});
test('subscribe rejects bad emails, wrong methods and bots', async () => {
  assert.equal((await post({ email: 'nope' })).statusCode, 400);
  assert.equal((await subscribe({ httpMethod: 'GET' })).statusCode, 405);
  await post({ email: 'bot@example.com', website: 'spam.com' });
  assert.equal((await listSignups()).some((s) => s.email === 'bot@example.com'), false);
});
