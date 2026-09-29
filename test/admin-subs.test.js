'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');

const fakeBlobs = require('./fake-blobs');
const blobs = fakeBlobs.install();

process.env.ADMIN_PASSWORD = 'correct horse';
process.env.GITHUB_TOKEN = 'tok_123'; process.env.GITHUB_REPO = 'me/wss'; process.env.GITHUB_BRANCH = 'main';
process.env.SITE_URL = 'https://example.test';
process.env.AUTH_FAIL_DELAY_MS = '0';

const list = require('../netlify/functions/admin-subs-list').handler;
const upsert = require('../netlify/functions/admin-subs-upsert').handler;
const del = require('../netlify/functions/admin-subs-delete').handler;
const sub = require('../lib/subscribers');

let sentEmails;
const realFetch = global.fetch;
function stubEmail() {
  sentEmails = [];
  process.env.RESEND_API_KEY = 'test_key';
  global.fetch = async (url, opts) => { sentEmails.push(JSON.parse(opts.body)); return { ok: true, text: async () => '' }; };
}
test.after(() => { global.fetch = realFetch; });
test.beforeEach(() => { blobs.reset(); stubEmail(); });

const ev = (body, pw = 'correct horse', method = 'POST') => ({ httpMethod: method, headers: pw == null ? {} : { authorization: 'Bearer ' + pw }, body: JSON.stringify(body || {}) });
const call = async (fn, e) => { const r = await fn(e); return { status: r.statusCode, body: JSON.parse(r.body) }; };

test('rejects missing/wrong password on all three endpoints', async () => {
  assert.equal((await call(list, ev({}, null))).status, 401);
  assert.equal((await call(upsert, ev({ email: 'a@b.com' }, 'nope'))).status, 401);
  assert.equal((await call(del, ev({ email: 'a@b.com' }, 'nope'))).status, 401);
});

test('comps a subscriber with a custom end date and no card, like the transferred Wix subscriber', async () => {
  const r = await call(upsert, ev({
    email: 'Andy@Example.com', status: 'active', expires: '2027-07-21', source: 'manual', note: 'Transferred from Wix, paid $50/yr via PayPal, started Jul 21 2026',
  }));
  assert.equal(r.status, 200);
  assert.equal(r.body.subscriber.email, 'andy@example.com');
  assert.equal(r.body.subscriber.passwordHash, null); // no card, no password -- logs in via magic link

  const record = await sub.getSubscriber('andy@example.com');
  assert.equal(sub.hasActiveAccess(record), true);
});

test('rejects a bad email and a bad expiry date', async () => {
  assert.equal((await call(upsert, ev({ email: 'not-an-email', status: 'active' }))).status, 400);
  assert.equal((await call(upsert, ev({ email: 'a@b.com', expires: 'not-a-date' }))).status, 400);
});

test('upsert on an existing subscriber updates rather than duplicating', async () => {
  await call(upsert, ev({ email: 'reader@example.com', status: 'active', expires: '2027-01-01' }));
  const r = await call(upsert, ev({ email: 'reader@example.com', status: 'canceled', expires: '2026-01-01' }));
  assert.equal(r.status, 200);
  const all = (await call(list, ev({}))).body.subscribers;
  assert.equal(all.length, 1);
  assert.equal(all[0].status, 'canceled');
});

test('notify:true emails the subscriber a working login link', async () => {
  const r = await call(upsert, ev({ email: 'gifted@example.com', status: 'active', expires: '2026-12-31', notify: true }));
  assert.equal(r.status, 200);
  assert.equal(sentEmails.length, 1);
  const link = sentEmails[0].html.match(/href="([^"]+)"/)[1];
  assert.match(link, /verify\.html\?kind=magic&token=/);
});

test('list returns everyone, delete removes one', async () => {
  await call(upsert, ev({ email: 'one@example.com', status: 'active' }));
  await call(upsert, ev({ email: 'two@example.com', status: 'active' }));
  assert.equal((await call(list, ev({}))).body.subscribers.length, 2);

  const d = await call(del, ev({ email: 'one@example.com' }));
  assert.equal(d.status, 200);
  assert.equal((await call(list, ev({}))).body.subscribers.length, 1);
});

test('deleting an email with no record returns 404', async () => {
  const r = await call(del, ev({ email: 'nobody@example.com' }));
  assert.equal(r.status, 404);
});
