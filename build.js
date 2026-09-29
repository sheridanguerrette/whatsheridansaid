#!/usr/bin/env node
'use strict';
/* Builds the whole site into dist/ from content/posts.json.
   Run by Netlify on every deploy (and locally with `npm run build`). */
const fs = require('fs');
const path = require('path');
const { sanitizeBody, textOf, previewBlocks, stripLeadingTitle } = require('./lib/content');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const SITE_URL = (process.env.SITE_URL || 'https://whatsheridansaid.com').replace(/\/$/, '');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const isPaid = (x) => x.audience !== 'free';
const LOCK = (w) => `<svg class="lock" viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 10V8a6 6 0 0 1 12 0v2" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/><rect x="4" y="10" width="16" height="11" rx="2" fill="#ffffff"/></svg>`;

const tagShort = (x) => x.kind === 'poem' ? 'Poem' : x.kind === 'special' ? 'Bonus'
  : x.finale ? `S${x.season} Finale` : `S${x.season} E${String(x.episode).padStart(2, '0')}`;
const tagLong = (x) => x.kind === 'poem' ? 'Poem' : x.kind === 'special' ? 'Bonus'
  : x.finale ? `Season ${x.season} \u00b7 Finale` : `Season ${x.season} \u00b7 Episode ${x.episode}`;
const sortKey = (x) => (x.season || 1) * 1000 + (x.finale ? 999 : (x.episode || 0));

const isRel = (u) => u && !/^(https?:|\/|data:)/i.test(u);
const url = (u, prefix) => (isRel(u) ? prefix + u : u || '');
const absUrl = (u) => (!u ? '' : /^https?:/i.test(u) ? u : `${SITE_URL}/${u.replace(/^\//, '')}`);
const fixBody = (html, prefix) => html.replace(/(src=")(?!https?:|\/|data:)([^"]+)"/g, (m, a, b) => `${a}${prefix}${b}"`)
  .replace(/<img /g, '<img onerror="var f=this.closest(\'figure\');(f||this).remove()" ');

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
    <div class="tag">${esc(tagShort(x))}${isPaid(x) ? ' ' + LOCK(12) : ''}</div>
    <h3>${esc(x.title)}</h3>
    <p>${esc(x.subtitle)}</p>
  </a>`;
}

// ---------- reading pages ----------
function navLink(x, label, cls) {
  if (!x) return '<div class="placeholder"></div>';
  return `<a href="${x.slug}.html" class="${cls}">
    <div class="dir">${label}</div>
    <div class="nav-tag">${esc(tagLong(x))}</div>
    <h4>${esc(x.title)}</h4>
  </a>`;
}

const FOOTER = (p) => `<footer>
  <div class="portrait"><img src="${p}assets/portrait.png" alt="Sheridan Guerrette"></div>
  <div class="wordmark">WHAT SHERIDAN SAID</div>
  <div class="footer-cols">
    <div class="contact"><h4>Contact</h4><p>Sheridan Guerrette</p><p>Sheridan</p><p>@sheridanguerrette.com</p></div>
    <div class="follow"><h4>Follow</h4>
      <a href="https://instagram.com/whatsheridansaid" target="_blank" rel="noopener">Instagram</a>
      <a href="https://threads.com/@whatsheridansaid" target="_blank" rel="noopener">Threads</a>
      <a href="https://whatsheridansaid.substack.com" target="_blank" rel="noopener">Substack</a>
      <a href="https://www.facebook.com/people/What-Sheridan-Said/61583169321817/" target="_blank" rel="noopener">Facebook</a>
      <a href="https://www.tiktok.com/@whatsheridansaid" target="_blank" rel="noopener">TikTok</a>
      <a href="https://www.youtube.com/@sheridanguerrette" target="_blank" rel="noopener">YouTube</a>
      <a href="https://www.pinterest.com/sheridanguerrette/" target="_blank" rel="noopener">Pinterest</a>
      <a href="https://x.com/sheridanloves" target="_blank" rel="noopener">X</a>
    </div>
    <div class="menu"><h4>Menu</h4>
      <a href="${p}index.html#top">Top of Page</a>
      <a href="https://sheridanguerrette.com" target="_blank" rel="noopener">Back to SG</a>
      <a href="https://sheridanguerrette.com/articles" target="_blank" rel="noopener">More Articles</a>
      <a href="${p}index.html">WSS</a><a href="${p}archive.html">Archive</a><a href="${p}poetry.html">Poetry</a><a href="${p}about.html">About</a>
      <a href="https://www.sheridanguerrette.com/category/all-products" target="_blank" rel="noopener">Store</a>
    </div>
  </div>
  <div class="fine-print"><a href="#">Privacy Policy</a><a href="#">Accessibility Statement</a><span class="copyright">&copy; 2026 by Sheridan Guerrette Inc.</span></div>
</footer>`;

function gate(x) {
  const poem = x.kind === 'poem';
  return `<div class="read-gate-fade"></div>
<div class="read-gate">
  <svg class="lock-big" viewBox="0 0 24 24" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 10V8a6 6 0 0 1 12 0v2" stroke="#f5f5f2" stroke-width="2" stroke-linecap="round"/><rect x="4" y="10" width="16" height="11" rx="2" fill="#f5f5f2"/></svg>
  <h3>${poem ? 'This poem is for subscribers' : 'The rest of this episode is for subscribers'}</h3>
  <p>${poem ? 'She writes three poems a day, and this is one of the ones she keeps for the people who subscribe.'
    : 'Subscribe to keep reading, and new episodes will land in your inbox Wednesdays at 9/8 Central.'}</p>
  <form class="subscribe-form">
    <input type="email" placeholder="Your email" required>
    <button type="submit">Subscribe</button>
    <div class="form-note">You're on the list &mdash; welcome.</div>
  </form>
</div>`;
}

function readPage(x) {
  const pageUrl = `${SITE_URL}/read/${x.slug}.html`;
  const cover = url(x.cover, '../');
  const body = isPaid(x) ? previewBlocks(x.body, x.kind === 'poem' ? 1 : 3) : x.body;
  const ld = {
    '@context': 'https://schema.org', '@type': 'Article', headline: x.title, description: x.subtitle,
    datePublished: x.date, author: { '@type': 'Person', name: 'Sheridan Guerrette' },
    publisher: { '@type': 'Organization', name: 'What Sheridan Said' }, mainEntityOfPage: pageUrl,
    isAccessibleForFree: !isPaid(x), ...(x.cover ? { image: absUrl(x.cover) } : {}),
  };
  const [prev, next] = nav.get(x.slug) || [];
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(x.title)} &mdash; What Sheridan Said</title>
<meta name="description" content="${esc(x.subtitle)}">
<link rel="canonical" href="${pageUrl}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Ctext y=%2720%27 font-size=%2720%27%3E%E2%99%A1%3C/text%3E%3C/svg%3E">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(x.title)}">
<meta property="og:description" content="${esc(x.subtitle)}">
<meta property="og:url" content="${pageUrl}">
${x.cover ? `<meta property="og:image" content="${esc(absUrl(x.cover))}">\n<meta name="twitter:image" content="${esc(absUrl(x.cover))}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(x.title)}">
<meta name="twitter:description" content="${esc(x.subtitle)}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Gloock&family=Questrial&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/style.css">
</head>
<body>

<span id="top" style="position:absolute;top:0;left:0;width:1px;height:1px;"></span>
<div class="cursor-heart" id="cursorHeart">&#9825;</div>

<header>
  <a class="logo" href="../index.html">WHAT SHERIDAN SAID</a>
  <nav><ul>
    <li><a href="../index.html">Home</a></li><li><a href="../archive.html">Archive</a></li>
    <li><a href="../poetry.html">Poetry</a></li><li><a href="../about.html">About</a></li>
    <li><a href="https://www.sheridanguerrette.com/category/all-products" target="_blank" rel="noopener">Store</a></li>
  </ul></nav>
</header>

<div class="read-header">
  <div class="tag-row"><span>${esc(tagShort(x))}</span>${isPaid(x) ? LOCK(13) : ''}</div>
  <h1>${esc(x.title)}</h1>
  <p class="dek">${esc(x.subtitle)}</p>
  <div class="byline">Sheridan Guerrette<span class="sep">&middot;</span>${fmtDate(x.date)}</div>
  <p class="read-sub-line">Subscribers get every episode and poem, including the ones I don't give away anywhere else. <a href="../index.html#top">Subscribe &rarr;</a></p>
</div>

${cover ? `<div class="read-cover"><img src="${esc(cover)}" alt="${esc(x.title)}" onerror="this.parentNode.remove()"></div>` : ''}

<div class="read-body">
${fixBody(body, '../')}
</div>
${isPaid(x) ? gate(x) : ''}

<div class="read-nav">
  ${navLink(prev, '&larr; Previous', '')}
  ${navLink(next, 'Next &rarr;', 'next-wrap')}
</div>

<section class="draw-in draw-in-photo">
  <div class="draw-in-inner">
    <figure class="feature-photo"><img src="../assets/feature.jpg" alt="Sheridan Guerrette in a knit dress blowing a kiss to her reflection in an elevator mirror, black and white photo" width="1297" height="1730" loading="lazy"></figure>
    <div class="feature-copy">
      <h2>Still Here? Good.</h2>
      <p>New episodes and poems land in your inbox as they're written &mdash; no algorithm between you and the words.</p>
      <p class="feature-line">Subscribers get every episode and every poem, including the ones I don't give away anywhere else.</p>
      <form class="subscribe-form on-light" id="drawInSubscribe">
        <input type="email" placeholder="Your email" required>
        <button type="submit">Subscribe</button>
        <div class="form-note">You're on the list &mdash; welcome.</div>
      </form>
      <div class="threads" id="homeThreads">
        <button type="button" class="thread-link" data-thread="love-interest">Love Interest</button>
        <button type="button" class="thread-link" data-thread="heroine-arc">The Heroine Arc</button>
        <button type="button" class="thread-link" data-thread="b-roll">B-Roll</button>
      </div>
      <div class="thread-nudge" id="threadNudge" style="display:none">
        <span id="threadNudgeText"></span>
        <button type="button" id="threadNudgeGo">Take me there &rarr;</button>
      </div>
    </div>
  </div>
</section>

${FOOTER('../')}

<script src="../assets/site.js"></script>
</body>
</html>
`;
}


// ---------- homepage: real content, driven by content/homepage.json ----------
let HOME = {};
try { HOME = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'homepage.json'), 'utf8')); } catch (e) { console.warn('WARNING: content/homepage.json missing or unreadable; using automatic picks.'); }
const firstFree = (kind, n) => (kind === 'poem' ? [...poems].reverse() : [...episodes].filter((x) => x.kind === 'episode')).filter((x) => !isPaid(x)).slice(0, n).map((x) => x.slug);
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
const recent = [...episodes].filter((x) => x.kind === 'episode' && !x.finale).reverse().slice(0, 8);
const pick = pickPosts([HOME.pick], 'pick')[0] || recent[0];
const pickImg = spotlightImage(pick);
const pickHtml = `<section class="spotlight">
  <div class="spotlight-inner">
    <div class="spotlight-cover">${pickImg ? `<img src="${esc(url(pickImg, ''))}" alt="${esc(pick.title)}" style="width:100%;height:100%;object-fit:cover;display:block" onerror="this.remove()">` : ''}</div>
    <div class="spotlight-text">
      <div class="eyebrow">Production's Pick</div>
      <h2>${esc(pick.title)}</h2>
      <p>${esc(tagLong(pick))} &mdash; ${esc(pick.subtitle || '')}</p>
      <a href="read/${pick.slug}.html" class="cta">Read the Episode</a>
    </div>
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

// poetry: free poems in the slider (newest first), paid poems in the paginated grid
const poemsNewest = [...poems].reverse();
const ordinal = new Map(poems.map((x, i) => [x.slug, i + 1])); // page script sorts newest-first by this
fill('poetry.template.html', 'poetry.html', {
  '<!--POEMS_FREE-->': poemsNewest.filter((x) => !isPaid(x)).map((x) => card(x, 1, ordinal.get(x.slug))).join('\n'),
  '<!--POEMS_PAID-->': poemsNewest.filter(isPaid).map((x) => card(x, 1, ordinal.get(x.slug))).join('\n'),
});

fill('index.template.html', 'index.html', {
  '<!--HOME_RECENT-->': recent.map(cardOf).join('\n'),
  '<!--HOME_PICK-->': pickHtml,
  '<!--HOME_FEATURED_EPISODES-->': pickPosts(HOME.featuredEpisodes, 'featuredEpisodes').map(cardOf).join('\n'),
  '<!--HOME_FEATURED_POEMS-->': pickPosts(HOME.featuredPoems, 'featuredPoems').map(cardOf).join('\n'),
});

// sitemap + robots
const pages = ['', 'archive.html', 'poetry.html', 'about.html'].map((p) => ({ loc: `${SITE_URL}/${p}` }))
  .concat(posts.map((x) => ({ loc: `${SITE_URL}/read/${x.slug}.html`, lastmod: x.date })));
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${p.loc}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nDisallow: /write/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`Built ${posts.length} posts (${episodes.length} episodes/bonus, ${poems.length} poems); ${all.length - posts.length} drafts skipped.`);
if (warnings.length) { console.log(`\n${warnings.length} content warning(s):`); warnings.forEach((w) => console.log('  WARN ' + w)); }
module.exports = { readPage, card };
