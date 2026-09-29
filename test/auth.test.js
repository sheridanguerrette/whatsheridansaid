'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');

// Must install the fake blobs store before anything requires lib/subscribers.js,
// since that require happens at module-load time in each function file below.
const fakeBlobs = require('./fake-blobs');
const blobs = fakeBlobs.install();

process.env.SITE_URL = 'https://example.test';
process.env.AUTH_FAIL_DELAY_MS = '0';

const signup = require('../netlify/functions/auth-signup').handler;
const login = require('../netlify/functions/auth-login').handler;
const me = require('../netlify/functions/auth-me').handler;
const logout = require('../netlify/functions/auth-logout').handler;
const magicRequest = require('../netlify/functions/auth-magic-request').handler;
const verify = require('../netlify/functions/auth-verify').handler;
const resetRequest = require('../netlify/functions/auth-reset-request').handler;
const resetConfirm = require('../netlify/functions/auth-reset-confirm').handler;

const sub = require('../lib/subscribers');

let sentEmails;
const realFetch = global.fetch;
function stubEmail() {
  sentEmails = [];
  process.env.RESEND_API_KEY = 'test_key';
  global.fetch = async (url, opts) => {
    sentEmails.push(JSON.parse(opts.body));
    return { ok: true, text: async () => '' };
  };
}
test.after(() => { global.fetch = realFetch; });

const post = (body, cookie) => ({ httpMethod: 'POST', headers: cookie ? { cookie } : {}, body: JSON.stringify(body || {}) });
const cookieFrom = (res) => (res.headers['Set-Cookie'] || '').split(';')[0];

test.beforeEach(() => { blobs.reset(); stubEmail(); });

test('signup creates a free-tier account and logs the reader in', async () => {
  const r = await signup(post({ email: 'Reader@Example.com', password: 'hunter22' }));
  assert.equal(r.statusCode, 200);
  const cookie = cookieFrom(r);
  assert.match(cookie, /^wss_session=/);

  const record = await sub.getSubscriber('reader@example.com');
  assert.equal(record.status, 'free');
  assert.ok(record.passwordHash);

  const whoami = await me({ headers: { cookie } });
  const body = JSON.parse(whoami.body);
  assert.equal(body.loggedIn, true);
  assert.equal(body.email, 'reader@example.com');
  assert.equal(body.hasAccess, false); // free tier, not a paid status
});

test('rejects a too-short password and a malformed email', async () => {
  assert.equal((await signup(post({ email: 'a@b.com', password: 'short' }))).statusCode, 400);
  assert.equal((await signup(post({ email: 'not-an-email', password: 'longenough1' }))).statusCode, 400);
});

test('rejects signing up twice with the same email', async () => {
  await signup(post({ email: 'dup@example.com', password: 'hunter22' }));
  const r = await signup(post({ email: 'dup@example.com', password: 'different1' }));
  assert.equal(r.statusCode, 409);
});

test('login succeeds with the right password and fails with the wrong one', async () => {
  await signup(post({ email: 'reader@example.com', password: 'hunter22' }));

  const bad = await login(post({ email: 'reader@example.com', password: 'wrong-pass' }));
  assert.equal(bad.statusCode, 401);
  assert.equal(JSON.parse(bad.body).offerReset, true);

  const good = await login(post({ email: 'reader@example.com', password: 'hunter22' }));
  assert.equal(good.statusCode, 200);
  assert.match(cookieFrom(good), /^wss_session=/);
});

test('login for an unknown email fails the same way as a wrong password (no account-probing)', async () => {
  const r = await login(post({ email: 'nobody@example.com', password: 'whatever1' }));
  assert.equal(r.statusCode, 401);
  assert.equal(JSON.parse(r.body).offerReset, true);
});

test('logout destroys the session so /auth-me no longer recognizes it', async () => {
  const signed = await signup(post({ email: 'reader@example.com', password: 'hunter22' }));
  const cookie = cookieFrom(signed);
  assert.equal(JSON.parse((await me({ headers: { cookie } })).body).loggedIn, true);

  const out = await logout({ headers: { cookie } });
  assert.match(out.headers['Set-Cookie'], /Max-Age=0/);

  assert.equal(JSON.parse((await me({ headers: { cookie } })).body).loggedIn, false);
});

test('magic link: requesting one emails a working one-time login link', async () => {
  await signup(post({ email: 'reader@example.com', password: 'hunter22' }));
  const r = await magicRequest(post({ email: 'reader@example.com' }));
  assert.equal(r.statusCode, 200);
  assert.equal(sentEmails.length, 1);
  const link = sentEmails[0].html.match(/href="([^"]+)"/)[1];
  const token = new URL(link).searchParams.get('token');

  const v = await verify({ queryStringParameters: { token } });
  assert.equal(v.statusCode, 200);
  assert.match(cookieFrom(v), /^wss_session=/);

  // one-time use: the same token doesn't work twice
  const v2 = await verify({ queryStringParameters: { token } });
  assert.equal(v2.statusCode, 400);
});

test('magic link request for an unknown email still says ok, and sends nothing', async () => {
  const r = await magicRequest(post({ email: 'nobody@example.com' }));
  assert.equal(r.statusCode, 200);
  assert.equal(sentEmails.length, 0);
});

test('password reset: request, then confirm with a new password, then log in with it', async () => {
  await signup(post({ email: 'reader@example.com', password: 'hunter22' }));
  await resetRequest(post({ email: 'reader@example.com' }));
  assert.equal(sentEmails.length, 1);
  const link = sentEmails[0].html.match(/href="([^"]+)"/)[1];
  const token = new URL(link).searchParams.get('token');

  const confirmed = await resetConfirm(post({ token, password: 'newpassword1' }));
  assert.equal(confirmed.statusCode, 200);

  const oldPw = await login(post({ email: 'reader@example.com', password: 'hunter22' }));
  assert.equal(oldPw.statusCode, 401);
  const newPw = await login(post({ email: 'reader@example.com', password: 'newpassword1' }));
  assert.equal(newPw.statusCode, 200);
});

test('password reset token cannot be reused, and a bad token is rejected', async () => {
  await signup(post({ email: 'reader@example.com', password: 'hunter22' }));
  await resetRequest(post({ email: 'reader@example.com' }));
  const link = sentEmails[0].html.match(/href="([^"]+)"/)[1];
  const token = new URL(link).searchParams.get('token');

  await resetConfirm(post({ token, password: 'newpassword1' }));
  const again = await resetConfirm(post({ token, password: 'anotherone1' }));
  assert.equal(again.statusCode, 400);

  const bad = await resetConfirm(post({ token: 'not-a-real-token', password: 'anotherone1' }));
  assert.equal(bad.statusCode, 400);
});

test('a manually-added subscriber (e.g. the transferred Wix subscriber) has real access', async () => {
  const record = sub.newSubscriberRecord({ email: 'loyal@reader.com', password: 'somepassword1', source: 'manual', status: 'active', expires: '2027-01-01T00:00:00.000Z' });
  await sub.saveSubscriber(record);
  assert.equal(sub.hasActiveAccess(await sub.getSubscriber('loyal@reader.com')), true);
});

test('access expires once the expiry date has passed', async () => {
  const record = sub.newSubscriberRecord({ email: 'expired@reader.com', password: 'somepassword1', source: 'manual', status: 'active', expires: '2020-01-01T00:00:00.000Z' });
  await sub.saveSubscriber(record);
  assert.equal(sub.hasActiveAccess(await sub.getSubscriber('expired@reader.com')), false);
});

test('email helper falls back to logging (not throwing) when RESEND_API_KEY is missing', async () => {
  delete process.env.RESEND_API_KEY;
  const { sendMagicLink } = require('../lib/email');
  const r = await sendMagicLink('a@b.com', 'https://example.test/x');
  assert.equal(r.sent, false);
  stubEmail(); // restore for any tests that run after this one
});
