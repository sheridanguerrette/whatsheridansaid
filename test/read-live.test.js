'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('fs'); const path = require('path');

const fakeBlobs = require('./fake-blobs'); const blobs = fakeBlobs.install();
const { createFakeGitHub } = require('./fake-github');

process.env.SITE_URL = 'https://example.test';
process.env.ADMIN_PASSWORD = 'open sesame'; process.env.GITHUB_TOKEN = 'tok'; process.env.GITHUB_REPO = 'me/wss'; process.env.AUTH_FAIL_DELAY_MS = '0';

const seed = fs.readFileSync(path.join(__dirname, '..', 'content', 'posts.json'));
const cache = require('../lib/content-cache');
const read = require('../netlify/functions/read').handler;
const save = require('../netlify/functions/admin-save').handler;

let gh;
test.beforeEach(() => {
  blobs.reset();
  gh = createFakeGitHub({ repo: 'me/wss', token: 'tok', files: { 'content/posts.json': Buffer.from(seed) } });
  global.fetch = gh.fetch;
});

const authed = (body) => ({ httpMethod: 'POST', headers: { authorization: 'Bearer open sesame' }, body: JSON.stringify(body) });
const req = (slug) => ({ queryStringParameters: { slug } });

test('content cache: empty until set, then returns what was cached', async () => {
  assert.equal(await cache.getCachedPosts(), null);
  await cache.setCachedPosts([{ slug: 'a', title: 'A' }]);
  const got = await cache.getCachedPosts();
  assert.equal(got[0].title, 'A');
});

test('read function falls back to GitHub when the cache is empty', async () => {
  const r = await read(req('so-im-doing-this-now'));
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /So I'm Doing This Now/);
});

test('read function returns 404 for an unknown slug', async () => {
  const r = await read(req('not-a-real-post'));
  assert.equal(r.statusCode, 404);
});

test('read function returns 404 for a draft (nothing should be able to view it live)', async () => {
  const all = JSON.parse(seed);
  const draft = { ...all[0], slug: 'secret-draft', status: 'draft', title: 'Not Yet' };
  await cache.setCachedPosts([...all, draft]);
  const r = await read(req('secret-draft'));
  assert.equal(r.statusCode, 404);
});

test('prev/next on the served page point to the right neighbors in the same sequence', async () => {
  const r = await read(req('so-im-doing-this-now'));
  // the pilot is first in its sequence, so it should show a placeholder for "previous"
  assert.match(r.body, /placeholder/);
});

test('CORE: editing a post through the real save flow shows up on the next read -- no build step involved', async () => {
  const list = JSON.parse(seed);
  const target = list.find((p) => p.slug === 'so-im-doing-this-now');

  const before = await read(req('so-im-doing-this-now'));
  assert.doesNotMatch(before.body, /Totally New Title From The Editor/);

  const edited = { ...target, title: 'Totally New Title From The Editor' };
  const saveResult = await save(authed({ post: edited, isNew: false }));
  assert.equal(saveResult.statusCode, 200);

  // no build.js run, no dist/ regeneration -- just call the live function again
  const after = await read(req('so-im-doing-this-now'));
  assert.equal(after.statusCode, 200);
  assert.match(after.body, /Totally New Title From The Editor/);
});

test('an edited post also keeps working through the GitHub-fallback path (cache untouched)', async () => {
  const list = JSON.parse(seed);
  const target = list.find((p) => p.slug === 'so-im-doing-this-now');
  const edited = { ...target, title: 'Edited Without Ever Warming The Cache' };
  await save(authed({ post: edited, isNew: false }));

  blobs.reset(); // simulate the cache having nothing in it -- should still work via GitHub
  const r = await read(req('so-im-doing-this-now'));
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /Edited Without Ever Warming The Cache/);
});

test('a brand-new post created through the editor is immediately readable live', async () => {
  const created = {
    title: 'A Fresh One', subtitle: 'Straight from the editor', kind: 'poem',
    date: '2026-09-30', audience: 'free', body: '<p>Line one of the poem, long enough to pass validation and mean something real here.</p>',
  };
  const r = await save(authed({ post: created, isNew: true }));
  assert.equal(r.statusCode, 200);
  const slug = JSON.parse(r.body).post.slug;

  const page = await read(req(slug));
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /A Fresh One/);
});
