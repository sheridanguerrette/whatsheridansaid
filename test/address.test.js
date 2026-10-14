'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fakeBlobs = require('./fake-blobs'); fakeBlobs.install();
const mail = require('../netlify/functions/mail-address').handler;
const { listAddresses } = require('../lib/addresses');
const post = (o) => mail({ httpMethod: 'POST', body: JSON.stringify(o) });
const good = { name: 'Ada Lovelace', email: ' Ada@Example.COM ', line1: '1 Main St', city: 'London', postal: 'N1 1AA', country: 'United Kingdom' };

test('mailing address is saved cleanly and a second submission replaces the first', async () => {
  assert.equal((await post(good)).statusCode, 200);
  assert.equal((await post({ ...good, line1: '9 New Rd', region: 'Greater London' })).statusCode, 200);
  const all = await listAddresses();
  assert.equal(all.length, 1); assert.equal(all[0].email, 'ada@example.com'); assert.equal(all[0].line1, '9 New Rd');
});
test('mailing address needs the essentials, rejects wrong methods and bots', async () => {
  assert.equal((await post({ ...good, country: '' })).statusCode, 400);
  assert.equal((await post({ ...good, email: 'nope' })).statusCode, 400);
  assert.equal((await mail({ httpMethod: 'GET' })).statusCode, 405);
  await post({ ...good, email: 'bot@example.com', website: 'spam.com' });
  assert.equal((await listAddresses()).some((a) => a.email === 'bot@example.com'), false);
});
