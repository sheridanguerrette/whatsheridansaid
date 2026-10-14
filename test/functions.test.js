'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('fs'); const path = require('path');
const { createFakeGitHub } = require('./fake-github');

const ROOT = path.join(__dirname, '..');
const seed = fs.readFileSync(path.join(ROOT, 'content/posts.json'));
const N = JSON.parse(seed).length;
process.env.ADMIN_PASSWORD = 'correct horse'; process.env.GITHUB_TOKEN = 'tok_123';
process.env.GITHUB_REPO = 'me/wss'; process.env.GITHUB_BRANCH = 'main'; process.env.AUTH_FAIL_DELAY_MS = '0';

const list = require('../netlify/functions/admin-list').handler;
const save = require('../netlify/functions/admin-save').handler;
const upload = require('../netlify/functions/admin-upload').handler;

let gh;
const fresh = () => { gh = createFakeGitHub({ repo: 'me/wss', token: 'tok_123', files: { 'content/posts.json': Buffer.from(seed) } }); global.fetch = gh.fetch; };
const ev = (body, pw = 'correct horse', method = 'POST') => ({ httpMethod: method, headers: pw == null ? {} : { authorization: 'Bearer ' + pw }, body: JSON.stringify(body || {}) });
const call = async (fn, e) => { const r = await fn(e); return { status: r.statusCode, body: JSON.parse(r.body) }; };
const base = { title: 'A New Thing', subtitle: 'sub', kind: 'episode', season: 2, episode: 99, status: 'published', date: '2026-10-01', cover: '', body: '<p>Hello there.</p>' };

test('rejects missing / wrong password, wrong method', async () => {
  fresh();
  assert.equal((await call(list, ev({}, null))).status, 401);
  assert.equal((await call(list, ev({}, 'nope'))).status, 401);
  assert.equal((await call(list, ev({}, 'correct horse', 'GET'))).status, 405);
  assert.equal(gh.commits.length, 0);
});

test('reports clearly when the server is not configured', async () => {
  fresh(); const keep = process.env.ADMIN_PASSWORD; delete process.env.ADMIN_PASSWORD;
  const r = await call(list, ev({})); process.env.ADMIN_PASSWORD = keep;
  assert.equal(r.status, 500); assert.match(r.body.error, /ADMIN_PASSWORD/);
});

test('list returns every post with its full text', async () => {
  fresh(); const r = await call(list, ev({}));
  assert.equal(r.status, 200); assert.equal(r.body.posts.length, N);
  assert.ok(r.body.posts.every((p) => p.body.length > 50));
});

test('editing a post changes only that post, sanitizes it, keeps its URL', async () => {
  fresh(); const before = gh.json('content/posts.json'); const target = before.find((p) => p.slug === 'non-perishable-items');
  const r = await call(save, ev({ post: { ...target, title: 'Non-Perishable Items (fixed)', body: '<p>Fixed typo.</p><script>alert(1)</script><p onclick="x()">ok</p>' } }));
  assert.equal(r.status, 200);
  const after = gh.json('content/posts.json'); const edited = after.find((p) => p.id === target.id);
  assert.equal(edited.slug, 'non-perishable-items');                    // URL never changes on edit
  assert.equal(edited.title, 'Non-Perishable Items (fixed)');
  assert.equal(edited.body, '<p>Fixed typo.</p><p>ok</p>');             // script + onclick stripped
  assert.equal(after.length, N);
  assert.deepEqual(after.filter((p) => p.id !== target.id), before.filter((p) => p.id !== target.id)); // nothing else touched
  assert.equal(gh.commits.at(-1).message, 'Edit: Non-Perishable Items (fixed)');
});

test('a new post gets a unique slug and sensible defaults', async () => {
  fresh();
  const a = await call(save, ev({ isNew: true, post: base }));
  const b = await call(save, ev({ isNew: true, post: base }));
  assert.equal(a.body.post.slug, 'a-new-thing'); assert.equal(b.body.post.slug, 'a-new-thing-2');
  assert.equal(gh.json('content/posts.json').length, N + 2);
  const poem = await call(save, ev({ isNew: true, post: { ...base, title: 'Tiny Poem', kind: 'poem', season: 4, episode: 9 } }));
  assert.equal(poem.body.post.season, null); assert.equal(poem.body.post.episode, null);
  const fin = await call(save, ev({ isNew: true, post: { ...base, title: 'The End', finale: true, episode: 3 } }));
  assert.equal(fin.body.post.finale, true); assert.equal(fin.body.post.episode, null);
});

test('strips a title repeated at the top of the body', async () => {
  fresh(); const r = await call(save, ev({ isNew: true, post: { ...base, title: 'My Poem', kind: 'poem', body: '<h3>My Poem</h3><p class="stanza">line</p>' } }));
  assert.equal(r.body.post.body, '<p class="stanza">line</p>');
});

test('validation problems come back as readable errors and commit nothing', async () => {
  fresh(); const n = () => gh.commits.length;
  for (const [bad, msg] of [[{ title: '  ' }, /title/i], [{ date: 'yesterday' }, /date/i], [{ cover: 'javascript:alert(1)' }, /cover/i]]) {
    const r = await call(save, ev({ isNew: true, post: { ...base, ...bad } }));
    assert.equal(r.status, 400); assert.match(r.body.error, msg);
  }
  assert.equal(n(), 0);
});

test('editing something that does not exist is a 404', async () => {
  fresh(); assert.equal((await call(save, ev({ post: { ...base, id: 'ghost' } }))).status, 404);
});

test('drafts are stored as drafts', async () => {
  fresh(); const r = await call(save, ev({ isNew: true, post: { ...base, title: 'Later', status: 'draft' } }));
  assert.equal(r.body.post.status, 'draft');
});

test('two saves colliding: the second retries and neither edit is lost', async () => {
  fresh();
  // just before our save lands, "someone else" commits a new post
  gh.hooks.beforePut = (store, sha) => {
    const posts = JSON.parse(store.get('content/posts.json').buf.toString('utf8')); posts.push({ id: 'other', slug: 'other', title: 'Other', body: '<p>x</p>' });
    const buf = Buffer.from(JSON.stringify(posts)); store.set('content/posts.json', { buf, sha: sha(buf) });
  };
  const r = await call(save, ev({ isNew: true, post: { ...base, title: 'Mine' } }));
  assert.equal(r.status, 200);
  const all = gh.json('content/posts.json');
  assert.ok(all.some((p) => p.slug === 'other') && all.some((p) => p.slug === 'mine'));
});

test('upload stores real images and refuses everything else', async () => {
  fresh(); const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);
  const ok = await call(upload, ev({ filename: 'My Cover Photo.PNG', data: png.toString('base64') }));
  assert.equal(ok.status, 200); assert.match(ok.body.url, /^assets\/uploads\/\d+-my-cover-photo\.png$/);
  assert.ok(gh.store.has('src/assets/' + ok.body.url.replace('assets/', '')));
  const fake = await call(upload, ev({ filename: 'evil.jpg', data: Buffer.from('<script>alert(1)</script>').toString('base64') }));
  assert.equal(fake.status, 400);
  const big = await call(upload, ev({ filename: 'big.png', data: Buffer.concat([png, Buffer.alloc(4.2 * 1024 * 1024)]).toString('base64') }));
  assert.equal(big.status, 413);
  assert.equal((await call(upload, ev({ filename: 'x.png', data: '' }))).status, 400);
});

test('a GitHub outage is reported, not swallowed', async () => {
  fresh(); global.fetch = async () => ({ ok: false, status: 500, text: async () => '{"message":"boom"}' });
  const r = await call(list, ev({})); assert.equal(r.status, 502); assert.match(r.body.error, /boom/);
});

test('integration: a saved post shows up in the rebuilt site', async () => {
  fresh(); const { execSync } = require('child_process'); const os = require('os');
  await call(save, ev({ isNew: true, post: { ...base, title: 'Brand New Episode', season: 2, episode: 99, body: '<p>' + 'word '.repeat(120) + '</p>' } }));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wss-')); fs.mkdirSync(path.join(tmp, 'content'));
  for (const f of ['build.js', 'package.json']) fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
  fs.cpSync(path.join(ROOT, 'lib'), path.join(tmp, 'lib'), { recursive: true }); fs.cpSync(path.join(ROOT, 'src'), path.join(tmp, 'src'), { recursive: true });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.copyFileSync(path.join(ROOT, 'content/homepage.json'), path.join(tmp, 'content/homepage.json'));
  fs.writeFileSync(path.join(tmp, 'content/posts.json'), gh.store.get('content/posts.json').buf);
  execSync('node build.js', { cwd: tmp, stdio: 'pipe' });
  const page = fs.readFileSync(path.join(tmp, 'dist/read/brand-new-episode.html'), 'utf8');
  assert.match(page, /Brand New Episode/);
  assert.match(page, /Season 2 \u00b7 Episode 19/);                      // previous link points at E19
  assert.match(fs.readFileSync(path.join(tmp, 'dist/archive.html'), 'utf8'), /Brand New Episode/);
  fs.rmSync(tmp, { recursive: true, force: true });
});
