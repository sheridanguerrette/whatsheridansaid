#!/usr/bin/env node
'use strict';
/* Builds the whole site into dist/ from content/posts.json.
   Run by Netlify on every deploy (and locally with `npm run build`). */
const fs = require('fs');
const path = require('path');
const { sanitizeBody, textOf, previewBlocks, stripLeadingTitle } = require('./lib/content');
const RP = require('./lib/render-post');
const { esc, fmtDate, tagShort, tagLong, sortKey, url, fixBody, navLink, FOOTER } = RP;

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const SITE_URL = (process.env.SITE_URL || 'https://whatsheridansaid.com').replace(/\/$/, '');
const absUrl = (u) => (!u ? '' : /^https?:/i.test(u) ? u : `${SITE_URL}/${u.replace(/^\//, '')}`);

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.name.endsWith('.template.html')) continue;
    const a = path.join(from, e.name); const b = path.join(to, e.name);
    e.isDirectory() ? copyDir(a, b) : fs.copyFileSync(a, b);
  }
}

// ---------- load + validate ----------
const all = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'posts.json'), 'utf8'));
const posts = all.filter((p) => p.status !== 'draft');
const warnings = [];
const seen = new Set();
for (const p of posts) {
  if (seen.has(p.slug)) warnings.push(`duplicate slug: ${p.slug}`);
  seen.add(p.slug);
  p.body = stripLeadingTitle(sanitizeBody(p.body), p.title);
  const t = textOf(p.body).length;
  if (t < (p.kind === 'poem' ? 120 : 400)) warnings.push(`"${p.title}" has very little text (${t} chars) - is it complete?`);
  if (!p.cover) warnings.push(`"${p.title}" has no cover image`);
  if (/[^a-z0-9-]/.test(p.slug)) warnings.push(`slug has odd characters: ${p.slug}`);
  for (const bad of ['Previously on', 'WSS is independently hosted', 'digest-post-embed']) {
    if (p.body.includes(bad)) warnings.push(`"${p.title}" still contains "${bad}"`);
  }
}

const episodes = posts.filter((p) => p.kind !== 'poem').sort((a, b) => sortKey(a) - sortKey(b));
const poems = posts.filter((p) => p.kind === 'poem').sort((a, b) => a.date.localeCompare(b.date));
const nav = new Map();
for (const seq of [episodes, poems]) seq.forEach((x, i) => nav.set(x.slug, [seq[i - 1] || null, seq[i + 1] || null]));

// ---------- cards (archive / poetry) ----------
function card(x, dataSeason, dataEpisode) {
  const img = x.cover ? `<img src="${esc(url(x.cover, ''))}" alt="${esc(x.title)}" loading="lazy" onerror="this.remove()">` : '';
  return `  <a class="card" href="read/${x.slug}.html" data-thread="${esc(x.thread || '')}" data-season="${dataSeason}" data-episode="${dataEpisode}">
    <div class="cover">${img}</div>
    <div class="tag">${esc(tagShort(x))}</div>
    <h3>${esc(x.title)}</h3>
    <p>${esc(x.subtitle)}</p>
  </a>`;
}

// ---------- reading pages ----------
function readPage(x) {
  const [prev, next] = nav.get(x.slug) || [];
  return RP.readPage(x, { prev, next, siteUrl: SITE_URL, absUrl });
}


// ---------- homepage: real content, driven by content/homepage.json ----------
let HOME = {};
try { HOME = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'homepage.json'), 'utf8')); } catch (e) { console.warn('WARNING: content/homepage.json missing or unreadable; using automatic picks.'); }
const firstFree = (kind, n) => (kind === 'poem' ? [...poems].reverse() : [...episodes].filter((x) => x.kind === 'episode')).slice(0, n).map((x) => x.slug);
HOME.pick = HOME.pick || firstFree('episode', 1)[0];
HOME.featuredEpisodes = HOME.featuredEpisodes || firstFree('episode', 5);
HOME.featuredPoems = HOME.featuredPoems || firstFree('poem', 3);
const bySlug = new Map(posts.map((x) => [x.slug, x]));
// a post that was renamed, unpublished or removed is skipped with a warning; it must never break the build
const pickPosts = (slugs, label) => slugs.map((s) => {
  const x = bySlug.get(s);
  if (!x) console.warn(`WARNING: homepage.json ${label}: no published post "${s}"; skipped.`);
  return x;
}).filter(Boolean);
const cardOf = (x) => card(x, x.season || 1, x.finale ? 999 : x.episode || 0);
const dims = (u) => { const m = /_(\d+)x(\d+)\.\w+/.exec(u || ''); return m ? [+m[1], +m[2]] : null; };
function spotlightImage(x) {
  const d = dims(x.cover);
  if (x.cover && (!d || d[0] / d[1] < 1.6)) return x.cover;
  const imgs = [...(x.body || '').matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]).filter((u) => { const e = dims(u); return e && e[0] / e[1] < 1.6; });
  return imgs[0] || x.cover || '';
}
const recent = [...episodes].filter((x) => x.kind === 'episode' && !x.finale).reverse().slice(0, 4);
const pick = pickPosts([HOME.pick], 'pick')[0] || recent[0];
const SUBSTACK_PAID = 'https://whatsheridansaid.substack.com/subscribe';
const pickHtml = `<section class="member-banner">
  <img class="mb-photo" src="assets/member-banner.jpg" alt="Black and white profile photo of Sheridan Guerrette in a ruffled white blouse, looking off to the side on a city street" width="1350" height="2025" loading="lazy">
  <div class="mb-shade"></div>
  <div class="mb-copy">
    <div class="eyebrow">For Paid Members</div>
    <h2>A Handwritten Poem and Letter, Written Just for You</h2>
    <p>On the last day of every month I sit down and write each paid member their own poem and letter by hand, a different one for every person, and put it in the mail to their door anywhere in the world for $8 a month or $80 a year.</p>
    <a href="${SUBSTACK_PAID}" class="cta" target="_blank" rel="noopener">Become a Paid Member</a>
  </div>
</section>`;

// ---------- write everything ----------
fs.rmSync(DIST, { recursive: true, force: true });
copyDir(SRC, DIST);
fs.mkdirSync(path.join(DIST, 'read'), { recursive: true });
for (const x of posts) fs.writeFileSync(path.join(DIST, 'read', `${x.slug}.html`), readPage(x));

const fill = (file, out, map) => {
  let html = fs.readFileSync(path.join(SRC, file), 'utf8');
  for (const [marker, value] of Object.entries(map)) {
    if (!html.includes(marker)) throw new Error(`${file} is missing ${marker}`);
    html = html.replace(marker, () => value);
  }
  fs.writeFileSync(path.join(DIST, out), html);
};

// archive: episodes, oldest -> newest in the DOM; the page's own script sorts/filters/paginates
fill('archive.template.html', 'archive.html', {
  '<!--ARCHIVE_CARDS-->': episodes.map((x) => card(x, x.season || 1, x.finale ? 999 : x.episode || 0)).join('\n'),
});

// poetry: the newest poems in the slider, every older poem in the paginated grid
const poemsNewest = [...poems].reverse();
const SLIDER_N = 8;
const ordinal = new Map(poems.map((x, i) => [x.slug, i + 1])); // page script sorts newest-first by this
fill('poetry.template.html', 'poetry.html', {
  '<!--POEMS_PICKS-->': pickPosts(HOME.poetryPicks || HOME.featuredPoems, 'poetryPicks').map((x) => card(x, 1, ordinal.get(x.slug))).join('\n'),
  '<!--POEMS_FREE-->': poemsNewest.slice(0, SLIDER_N).map((x) => card(x, 1, ordinal.get(x.slug))).join('\n'),
  '<!--POEMS_PAID-->': poemsNewest.slice(SLIDER_N).map((x) => card(x, 1, ordinal.get(x.slug))).join('\n'),
});

fill('index.template.html', 'index.html', {
  '<!--HOME_RECENT-->': recent.map(cardOf).join('\n'),
  '<!--HOME_PICK-->': pickHtml,
  '<!--HOME_FEATURED_POEMS-->': pickPosts(HOME.featuredPoems, 'featuredPoems').map(cardOf).join('\n'),
});

// sitemap + robots
const pages = ['', 'archive.html', 'poetry.html', 'about.html', 'privacy.html', 'accessibility.html'].map((p) => ({ loc: `${SITE_URL}/${p}` }))
  .concat(posts.map((x) => ({ loc: `${SITE_URL}/read/${x.slug}.html`, lastmod: x.date })));
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${p.loc}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nDisallow: /write/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`Built ${posts.length} posts (${episodes.length} episodes/bonus, ${poems.length} poems); ${all.length - posts.length} drafts skipped.`);
if (warnings.length) { console.log(`\n${warnings.length} content warning(s):`); warnings.forEach((w) => console.log('  WARN ' + w)); }
module.exports = { readPage, card };
