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

let free = 0; let paid = 0;
for (const p of posts) {
  const f = dist('read', p.slug + '.html');
  if (!fs.existsSync(f)) { fail('missing page ' + p.slug); continue; }
  const html = fs.readFileSync(f, 'utf8');
  const m = html.match(/<div class="read-body">([\s\S]*?)<\/div>\s*(?:<div class="read-gate-fade">|\n<div class="read-nav">)/);
  const shown = m ? strip(m[1]) : ''; const full = textOf(p.body);
  if (p.audience === 'free') {
    free++; if (shown.length < full.length * 0.97) fail(`free page truncated: ${p.title} (${shown.length}/${full.length})`);
    if (html.includes('read-gate')) fail('free page has a paywall: ' + p.title);
  } else {
    paid++;
    if (!html.includes('read-gate')) fail('paid page has no gate: ' + p.title);
    if (!/<p[ >]/.test(m ? m[1] : '')) fail('paid preview has no paragraph/stanza: ' + p.title);
    if (full.length > 1500 && shown.length > full.length * 0.9) fail('paid page reveals almost everything: ' + p.title);
    if (p.kind === 'poem' && (m[1].match(/<p[ >]/g) || []).length > 1) fail('poem preview shows more than one stanza: ' + p.title);
  }
  if (html.includes('<h1>') && (html.match(/<h1>/g) || []).length !== 1) fail('page should have exactly one h1: ' + p.title);
  for (const junk of ['Previously on', 'WSS is independently hosted', 'digest-post-embed', 'pencraft', 'paywall-jump', 'undefined', '[object Object]']) {
    if (html.includes(junk)) fail(`${p.slug} contains "${junk}"`);
  }
}
console.log(`  pages: ${free} free (full text), ${paid} paid (preview + gate)`);

// prev/next carry season + episode
const nav = fs.readFileSync(dist('read', 'non-perishable-items.html'), 'utf8');
if (!/nav-tag">Season 2 \u00b7 Episode 16</.test(nav) || !/nav-tag">Season 2 \u00b7 Episode 18</.test(nav)) fail('prev/next missing season/episode');

// archive + poetry
const a = fs.readFileSync(dist('archive.html'), 'utf8'); const po = fs.readFileSync(dist('poetry.html'), 'utf8');
const eps = posts.filter((p) => p.kind !== 'poem').length; const poems = posts.filter((p) => p.kind === 'poem').length;
if ((a.match(/<a class="card"/g) || []).length !== eps) fail('archive card count');
if ((po.match(/<a class="card"/g) || []).length !== poems) fail('poetry card count');
if (/<!--[A-Z_]+-->/.test(a + po)) fail('unfilled template marker');
if (!fs.existsSync(dist('sitemap.xml')) || !fs.existsSync(dist('robots.txt'))) fail('sitemap/robots missing');
if (fs.existsSync(dist('content')) || fs.existsSync(dist('posts.json'))) fail('content leaked into dist');

console.log(failures ? `build: ${failures} FAILED` : 'build: all checks passed');
process.exit(failures ? 1 : 0);
