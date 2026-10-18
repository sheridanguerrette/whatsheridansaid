'use strict';
// Drives the real editor page in a simulated browser, wired to the real functions and a fake GitHub.
let JSDOM, VirtualConsole; try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { console.log('jsdom not installed - skipping editor tests'); process.exit(0); }
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('fs'); const path = require('path');
const { createFakeGitHub } = require('./fake-github');
const fakeBlobs = require('./fake-blobs'); const blobs = fakeBlobs.install();

const ROOT = path.join(__dirname, '..');
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/posts.json'), 'utf8'));
const N = SEED.length; const NEXT_EP = String(Math.max(...SEED.filter((x) => x.season === 2).map((x) => x.episode || 0)) + 1);
const HTML = fs.readFileSync(path.join(ROOT, 'src/write/index.html'), 'utf8');
const seed = fs.readFileSync(path.join(ROOT, 'content/posts.json'));
process.env.ADMIN_PASSWORD = 'open sesame'; process.env.GITHUB_TOKEN = 'tok'; process.env.GITHUB_REPO = 'me/wss'; process.env.AUTH_FAIL_DELAY_MS = '0';
process.env.SITE_URL = 'https://site.test';
const fns = {
  'admin-list': require('../netlify/functions/admin-list').handler, 'admin-save': require('../netlify/functions/admin-save').handler, 'admin-upload': require('../netlify/functions/admin-upload').handler,
  'admin-signups-list': require('../netlify/functions/admin-signups-list').handler, 'admin-signups-update': require('../netlify/functions/admin-signups-update').handler,
  'admin-addresses-list': require('../netlify/functions/admin-addresses-list').handler, 'admin-addresses-update': require('../netlify/functions/admin-addresses-update').handler, };

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 2000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await tick(10); } return false; };

function boot({ demo } = {}) {
  blobs.reset();
  const gh = createFakeGitHub({ repo: 'me/wss', token: 'tok', files: { 'content/posts.json': Buffer.from(seed) } }); global.fetch = gh.fetch;
  const errors = []; const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM(demo ? HTML.replace('<script>\n(function', `<script>window.__DEMO_POSTS__=${JSON.stringify(demo)};</script><script>\n(function`) : HTML, {
    runScripts: 'dangerously', url: 'https://site.test/write/', virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {}; w.confirm = () => true; w.alert = () => {};
      w.fetch = async (url, opts) => {                               // route /.netlify/functions/x to the real handlers
        const name = url.split('/').pop(); const r = await fns[name]({ httpMethod: opts.method, headers: opts.headers, body: opts.body });
        return { ok: r.statusCode < 300, status: r.statusCode, json: async () => JSON.parse(r.body) };
      };
    },
  });
  const w = dom.window; const d = w.document; const $ = (id) => d.getElementById(id);
  const type = (id, v) => { $(id).value = v; $(id).dispatchEvent(new w.Event('input', { bubbles: true })); $(id).dispatchEvent(new w.Event('change', { bubbles: true })); };
  // a view only counts as visible if the whole app (or the login screen) is showing too
  const visible = (id) => { const own = !$(id).classList.contains('hidden'); return id === 'login' || id === 'demoBanner' ? own : own && !$('app').classList.contains('hidden'); };
  const login = async (pw) => { $('pw').value = pw; $('loginForm').dispatchEvent(new w.Event('submit', { cancelable: true })); await until(() => visible('listView') || $('loginErr').textContent); };
  const rows = () => d.querySelectorAll('#rows .row');
  return { dom, w, d, $, gh, type, visible, login, rows, errors };
}

test('wrong password stays on the login screen with a clear message', async () => {
  const b = boot(); await b.login('nope');
  assert.equal(b.visible('listView'), false); assert.match(b.$('loginErr').textContent, /not right/i);
});

test('log in, browse, search and filter all posts', async () => {
  const b = boot(); await b.login('open sesame');
  assert.equal(b.visible('listView'), true); assert.equal(b.rows().length, N);
  b.type('search', 'mr. cigar'); assert.equal(b.rows().length, 1); b.type('search', '');
  b.d.querySelector('[data-filter="poem"]').click(); assert.equal(b.rows().length, SEED.filter((x) => x.kind === 'poem').length);
  assert.ok(b.d.querySelector('.row .rthumb img'));
  b.d.querySelector('[data-filter="draft"]').click(); assert.match(b.$('rows').textContent, /Nothing matches/);
  assert.deepEqual(b.errors, []);
});

test('click an old post, fix a typo, save: one commit, live URL unchanged', async () => {
  const b = boot(); await b.login('open sesame');
  b.d.querySelector('.row[data-id="non-perishable-items"]').click();
  assert.equal(b.visible('editView'), true);
  assert.equal(b.$('f-title').value, 'Non-Perishable Items'); assert.equal(b.$('f-season').value, '2'); assert.equal(b.$('f-episode').value, '17');
  assert.match(b.$('body').textContent, /I-35/);
  assert.equal(b.$('openPage').href, 'https://site.test/read/non-perishable-items.html');
  const before = b.gh.json('content/posts.json').find((p) => p.slug === 'non-perishable-items');
  b.$('body').innerHTML = b.$('body').innerHTML.replace('countless times', 'countless times, fixed');
  b.$('body').dispatchEvent(new b.w.Event('input', { bubbles: true }));
  assert.equal(b.gh.state, undefined); const commitsBefore = b.gh.commits.length;
  b.$('save').click(); await until(() => b.gh.commits.length > commitsBefore);
  const after = b.gh.json('content/posts.json').find((p) => p.slug === 'non-perishable-items');
  assert.equal(b.gh.commits.length, commitsBefore + 1);
  assert.match(after.body, /countless times, fixed/); assert.equal(after.slug, before.slug);
  await until(() => /Saved/.test(b.$('toast').textContent)); assert.match(b.$('toast').textContent, /about a minute/);
  assert.equal(b.w.__wss.state().dirty, false);
});

test('images keep working: editor shows ../assets/, storage keeps assets/', async () => {
  const b = boot(); const { toEditor, fromEditor } = b.w.__wss;
  assert.equal(toEditor('<img src="assets/uploads/a.jpg"><img src="https://x.com/y.jpg">'), '<img src="../assets/uploads/a.jpg"><img src="https://x.com/y.jpg">');
  assert.equal(fromEditor('<img src="../assets/uploads/a.jpg">'), '<img src="assets/uploads/a.jpg">');
});

test('pasted text from Word / Google Docs is cleaned', async () => {
  const b = boot(); const { cleanHtml, textToHtml } = b.w.__wss;
  assert.equal(cleanHtml('<meta charset="utf-8"><b style="font-weight:normal" id="docs-internal-guid-1"><p dir="ltr" style="margin:0"><span style="font-weight:700">Bold</span> and <span style="font-style:italic">slanted</span> words</p></b>'),
    '<p><strong>Bold</strong> and <em>slanted</em> words</p>');
  assert.equal(cleanHtml('<div>one</div><div>two<script>alert(1)</script></div>'), '<p>one</p><p>two</p>');
  assert.equal(cleanHtml('loose <b>text</b><p>para</p>'), '<p>loose <strong>text</strong></p><p>para</p>');
  assert.equal(cleanHtml('<p onclick="x()" style="color:red">hi <a href="javascript:alert(1)">bad</a> <a href="https://ok.com">ok</a></p>'), '<p>hi bad <a href="https://ok.com" rel="noopener">ok</a></p>');
  assert.equal(cleanHtml('<p class="stanza">a<br>b</p><p></p><p><br></p>'), '<p class="stanza">a<br>b</p>');
  assert.equal(textToHtml('one\ntwo\n\nthree & four'), '<p>one<br>two</p><p>three &amp; four</p>');
});

test('new poem: fields adapt, defaults are sensible, it saves', async () => {
  const b = boot(); await b.login('open sesame');
  b.d.querySelector('[data-new="poem"]').click();
  assert.equal(b.$('wrapSeason').classList.contains('hidden'), true); assert.equal(b.$('save').textContent, 'Publish');
  b.$('save').click(); await until(() => /title/i.test(b.$('toast').textContent)); assert.match(b.$('toast').textContent, /add a title/i);   // blocked client-side
  b.type('f-title', 'A Tiny Poem'); b.type('f-subtitle', 'Just a few lines.');
  b.$('body').innerHTML = '<p class="stanza">first line<br>second line</p>'; b.$('body').dispatchEvent(new b.w.Event('input', { bubbles: true }));
  const n = b.gh.commits.length; b.$('save').click(); await until(() => b.gh.commits.length > n);
  const saved = b.gh.json('content/posts.json').find((p) => p.slug === 'a-tiny-poem');
  assert.equal(saved.kind, 'poem'); assert.equal(saved.season, null); assert.equal(saved.body, '<p class="stanza">first line<br />second line</p>');
  assert.equal(b.gh.commits.at(-1).message, 'New post: A Tiny Poem');
});

test('new episode suggests the next episode number', async () => {
  const b = boot(); await b.login('open sesame'); b.d.querySelector('[data-new="episode"]').click();
  assert.equal(b.$('f-season').value, '2'); assert.equal(b.$('f-episode').value, NEXT_EP);
  assert.equal(b.$('f-date').value.length, 10);
});

test('finale + bonus fields behave', async () => {
  const b = boot(); await b.login('open sesame'); b.d.querySelector('[data-new="episode"]').click();
  b.$('f-finale').checked = true; b.$('f-finale').dispatchEvent(new b.w.Event('change')); assert.equal(b.$('f-episode').disabled, true);
  b.type('f-kind', 'special'); assert.equal(b.$('wrapFinale').classList.contains('hidden'), true); assert.equal(b.$('lblEpisode').textContent, 'After episode');
});

test('leaving with unsaved changes asks first', async () => {
  const b = boot(); await b.login('open sesame'); b.d.querySelector('.row[data-id="mr-cigar"]').click();
  b.type('f-title', 'Mr. Cigar!'); assert.equal(b.w.__wss.state().dirty, true);
  let asked = 0; b.w.confirm = () => { asked++; return false; }; b.$('back').click();
  assert.equal(asked, 1); assert.equal(b.visible('editView'), true);          // stayed
  b.w.confirm = () => true; b.$('back').click(); assert.equal(b.visible('listView'), true);
});

test('an expired session sends you back to log in instead of losing work silently', async () => {
  const b = boot(); await b.login('open sesame'); b.d.querySelector('.row[data-id="mr-cigar"]').click();
  b.type('f-title', 'Changed'); process.env.ADMIN_PASSWORD = 'rotated';
  b.$('save').click(); await until(() => b.visible('login')); process.env.ADMIN_PASSWORD = 'open sesame';
  assert.equal(b.visible('login'), true);
});

test('server-side validation errors are shown, not swallowed', async () => {
  const b = boot(); await b.login('open sesame'); b.d.querySelector('.row[data-id="mr-cigar"]').click();
  b.type('f-cover', 'javascript:alert(1)'); b.$('save').click();
  await until(() => /cover/i.test(b.$('toast').textContent)); assert.match(b.$('toast').textContent, /cover image/i);
});

test('demo mode works without any backend and never sends anything', async () => {
  const demo = JSON.parse(seed).slice(0, 6).map((p) => ({ ...p, body: '<p>demo</p>' }));
  const b = boot({ demo }); global.fetch = () => { throw new Error('network used in demo mode'); };
  assert.equal(b.visible('demoBanner'), true); await b.login('anything');
  assert.equal(b.rows().length, 6); b.rows()[0].click(); b.type('f-title', 'Edited in demo'); b.$('save').click();
  await until(() => /Demo/.test(b.$('toast').textContent)); assert.match(b.$('toast').textContent, /nothing was sent/);
});

test('opening and saving ANY old post without editing it changes nothing you can see', async () => {
  const { textOf } = require('../lib/content');
  const b = boot(); await b.login('open sesame');
  const before = b.gh.json('content/posts.json'); const shape = (h) => ({
    text: textOf(h), img: (h.match(/<img /g) || []).length, a: (h.match(/<a /g) || []).length, hr: (h.match(/<hr/g) || []).length,
    stanza: (h.match(/class="stanza"/g) || []).length, br: (h.match(/<br/g) || []).length, h3: (h.match(/<h3/g) || []).length,
    pre: (h.match(/<pre/g) || []).length, fig: (h.match(/<figure/g) || []).length, para: (h.match(/<p[ >]/g) || []).length });
  const damaged = [];
  for (const p of before) {
    b.d.querySelector(`.row[data-id="${p.id}"]`).click();
    b.type('f-subtitle', b.$('f-subtitle').value + ' ');                   // makes the form dirty; nothing else changes
    const n = b.gh.commits.length; b.$('save').click(); await until(() => b.gh.commits.length > n);
    const after = b.gh.json('content/posts.json').find((x) => x.id === p.id);
    const want = shape(require('../lib/content').stripLeadingTitle(require('../lib/content').sanitizeBody(p.body), p.title)); const got = shape(after.body);
    for (const k of Object.keys(want)) if (JSON.stringify(want[k]) !== JSON.stringify(got[k])) damaged.push(`${p.slug}: ${k} ${want[k] && want[k].length > 40 ? '(text differs)' : want[k] + ' -> ' + got[k]}`);
    b.$('back').click();
  }
  assert.deepEqual(damaged, [], 'round-trip changed these posts:\n' + damaged.join('\n'));
  assert.equal(b.gh.json('content/posts.json').length, N);
});

test('signups tab: shows emails, marks them added, copies new ones, removes them', async () => {
  const b = boot(); await b.login('open sesame');
  const { addSignup } = require('../lib/signups');
  await addSignup('First@Example.com', 'home'); await addSignup('second@example.com', 'poetry'); await addSignup('first@example.com', 'home');
  b.$('navSubs').click();
  assert.equal(b.visible('subsView'), true);
  await until(() => /first@example\.com/.test(b.$('subRows').textContent));
  assert.match(b.$('subRows').textContent, /second@example\.com/);
  assert.match(b.$('subRows').textContent, /2 total/);   // duplicate was ignored

  b.d.querySelector('[data-toggle-sub="first@example.com"]').click();
  await until(() => /1 not yet added/.test(b.$('subRows').textContent));
  assert.match(b.d.querySelector('[data-email="first@example.com"]').textContent, /On Substack/);

  b.d.querySelector('[data-del-sub="second@example.com"]').click();
  await until(() => !/second@example\.com/.test(b.$('subRows').textContent));
});

test('signups tab: empty state', async () => {
  blobs.reset();
  const b = boot(); await b.login('open sesame');
  b.$('navSubs').click(); await until(() => !/Loading/.test(b.$('subRows').textContent));
  assert.match(b.$('subRows').textContent, /No signups yet/);
});

test('addresses tab: lists addresses, copies them, removes one', async () => {
  blobs.reset();
  const b = boot(); await b.login('open sesame');
  const { saveAddress } = require('../lib/addresses');
  await saveAddress({ name: 'Ada Lovelace', email: 'ada@example.com', line1: '1 Main St', city: 'London', postal: 'N1 1AA', country: 'United Kingdom' });
  await saveAddress({ name: 'Grace Hopper', email: 'grace@example.com', line1: '2 Oak Ave', line2: 'Apt 4', city: 'Arlington', region: 'VA', postal: '22201', country: 'USA' });
  b.$('navAddr').click();
  assert.equal(b.visible('addrView'), true);
  await until(() => /Ada Lovelace/.test(b.$('addrRows').textContent));
  assert.match(b.$('addrRows').textContent, /Grace Hopper/);
  assert.match(b.$('addrRows').textContent, /Arlington, VA 22201|Arlington, VA, 22201/);
  assert.match(b.$('addrRows').textContent, /2 total/);
  b.d.querySelector('[data-del-addr="ada@example.com"]').click();
  await until(() => !/Ada Lovelace/.test(b.$('addrRows').textContent));
  assert.match(b.$('addrRows').textContent, /Grace Hopper/);
});

test('addresses tab: empty state', async () => {
  blobs.reset();
  const b = boot(); await b.login('open sesame');
  b.$('navAddr').click(); await until(() => !/Loading/.test(b.$('addrRows').textContent));
  assert.match(b.$('addrRows').textContent, /No addresses yet/);
});
