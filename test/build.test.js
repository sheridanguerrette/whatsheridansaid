'use strict';
// Checks the *built output*, not just that the build ran. Run: npm test
const fs = require('fs'); const path = require('path');
const { execSync } = require('child_process');
const { textOf } = require('../lib/content');
const ROOT = path.join(__dirname, '..');
execSync('node build.js', { cwd: ROOT, stdio: 'pipe' });

const posts = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/posts.json'), 'utf8')).filter((p) => p.status !== 'draft');
const dist = (...p) => path.join(ROOT, 'dist', ...p);
let failures = 0; const fail = (m) => { failures++; console.log('  FAIL', m); };
const strip = (h) => textOf(h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''));

let count = 0;
for (const p of posts) {
  const f = dist('read', p.slug + '.html');
  if (!fs.existsSync(f)) { fail('missing page ' + p.slug); continue; }
  const html = fs.readFileSync(f, 'utf8');
  count++;
  const m = html.match(/<div class="read-body">([\s\S]*?)<\/div>\s*\n(?:<aside class="letter-card"[\s\S]*?<\/aside>\s*\n)?<div class="read-nav">/);
  if (!html.includes('class="letter-card"') || !html.includes('substack.com/subscribe')) fail('missing paid-member letter card: ' + p.slug);
  const shown = m ? strip(m[1]) : ''; const full = textOf(p.body);
  if (shown.length < full.length * 0.97) fail(`page truncated: ${p.title} (${shown.length}/${full.length})`);
  for (const bad of ['read-gate', 'class="lock', 'for subscribers', 'Subscribers only', 'No Subscription Needed', 'Free to Read', 'Paid Members Only']) {
    if (html.includes(bad)) fail(`${p.slug} still has paywall language: ${bad}`);
  }
  if (html.includes('<h1>') && (html.match(/<h1>/g) || []).length !== 1) fail('page should have exactly one h1: ' + p.title);
  for (const junk of ['Previously on', 'WSS is independently hosted', 'digest-post-embed', 'pencraft', 'paywall-jump', 'undefined', '[object Object]']) {
    if (html.includes(junk)) fail(`${p.slug} contains "${junk}"`);
  }
}
console.log(`  pages: ${count} full-text, no paywall`);
for (const f of ['index.html', 'archive.html', 'poetry.html', 'about.html']) {
  const h = fs.readFileSync(dist(f), 'utf8');
  for (const bad of ['class="lock', 'No Subscription Needed', 'Free to Read', 'Paid Members Only', 'For Subscribers', 'free for everyone', 'open to every reader']) if (h.includes(bad)) fail(`${f} still has paywall language: ${bad}`);
}

// prev/next carry season + episode
const nav = fs.readFileSync(dist('read', 'non-perishable-items.html'), 'utf8');
if (!/nav-tag">Season 2 \u00b7 Episode 16</.test(nav) || !/nav-tag">Season 2 \u00b7 Episode 18</.test(nav)) fail('prev/next missing season/episode');

if (!fs.existsSync(dist('mail.html'))) fail('mail.html missing');

// archive + poetry
const a = fs.readFileSync(dist('archive.html'), 'utf8'); const po = fs.readFileSync(dist('poetry.html'), 'utf8');
const eps = posts.filter((p) => p.kind !== 'poem').length; const poems = posts.filter((p) => p.kind === 'poem').length;
if ((a.match(/<a class="card"/g) || []).length !== eps) fail('archive card count');
const picks = (JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'homepage.json'), 'utf8')).poetryPicks || []).length;
if ((po.match(/<a class="card"/g) || []).length !== Math.min(poems, 8) + picks + poems) fail('poetry card count (latest slider + picks + full archive)');
const grid = po.split('id="archiveGrid"')[1] || '';
if ((grid.match(/<a class="card"/g) || []).length !== poems) fail('poetry archive must list every poem');
if (/<!--[A-Z_]+-->/.test(a + po)) fail('unfilled template marker');
if (!fs.existsSync(dist('sitemap.xml')) || !fs.existsSync(dist('robots.txt'))) fail('sitemap/robots missing');
if (fs.existsSync(dist('content')) || fs.existsSync(dist('posts.json'))) fail('content leaked into dist');

console.log(failures ? `build: ${failures} FAILED` : 'build: all checks passed');
process.exit(failures ? 1 : 0);
