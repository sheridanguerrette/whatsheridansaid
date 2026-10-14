'use strict';
// The exact HTML for one episode/poem page, extracted out of build.js so both the
// static site builder AND the live on-demand read function (netlify/functions/read.js)
// produce identical pages from identical logic. Nothing here should ever diverge
// between the two call sites.

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

const tagShort = (x) => x.kind === 'poem' ? 'Poem' : x.kind === 'special' ? 'Bonus'
  : x.finale ? `S${x.season} Finale` : `S${x.season} E${String(x.episode).padStart(2, '0')}`;
const tagLong = (x) => x.kind === 'poem' ? 'Poem' : x.kind === 'special' ? 'Bonus'
  : x.finale ? `Season ${x.season} \u00b7 Finale` : `Season ${x.season} \u00b7 Episode ${x.episode}`;
const sortKey = (x) => (x.season || 1) * 1000 + (x.finale ? 999 : (x.episode || 0));

const isRel = (u) => u && !/^(https?:|\/|data:)/i.test(u);
const url = (u, prefix) => (isRel(u) ? prefix + u : u || '');
const fixBody = (html, prefix) => html.replace(/(src=")(?!https?:|\/|data:)([^"]+)"/g, (m, a, b) => `${a}${prefix}${b}"`)
  .replace(/<img /g, '<img onerror="var f=this.closest(\'figure\');(f||this).remove()" ');

function navLink(x, label, cls) {
  if (!x) return '<div class="placeholder"></div>';
  return `<a href="${x.slug}.html" class="${cls}">
    <div class="dir">${label}</div>
    <div class="nav-tag">${esc(tagLong(x))}</div>
    <h4>${esc(x.title)}</h4>
  </a>`;
}


const SUBSTACK_PAID = 'https://whatsheridansaid.substack.com/subscribe';
// The small "become a paid member" card that closes every post. Copy differs for poems and episodes
// so it reads like part of the piece rather than an ad bolted on.
const letterCard = (x, p) => {
  const head = 'Want a handwritten poem in your mailbox?';
  const body = 'If you\u2019ve been reading along, on the last day of every month I write each paid member their own poem by hand, with a letter beside it, a different one for every person, and mail it to their door anywhere in the world.';
  return `<aside class="letter-card" aria-label="Become a paid member">
  <div class="lc-copy">
    <div class="eyebrow">For Paid Members</div>
    <h3>${head}</h3>
    <p>${body}</p>
    <a class="cta" href="${SUBSTACK_PAID}" target="_blank" rel="noopener">Become a Paid Member</a>
    <span class="lc-price">$8 a month &middot; $80 a year</span>
  </div>
</aside>`;
};

const FOOTER = (p) => `<footer>
  <div class="portrait"><img src="${p}assets/portrait.png" alt="Sheridan Guerrette"></div>
  <div class="wordmark">WHAT SHERIDAN SAID</div>
  <div class="footer-cols">
    <div class="contact"><h4>Contact</h4><p>Sheridan Guerrette</p><p><a href="mailto:sheridan@whatsheridansaid.com">sheridan@whatsheridansaid.com</a></p></div>
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
  <div class="fine-print"><a href="${p}privacy.html">Privacy Policy</a><a href="${p}accessibility.html">Accessibility Statement</a><span class="copyright">&copy; 2026 by Sheridan Guerrette Inc.</span></div>
</footer>`;

// x: the post. prev/next: the neighboring posts in its own sequence (episodes or poems), or null.
// siteUrl: absolute site origin, no trailing slash. absUrl: the same absUrl() helper build.js uses.
function readPage(x, { prev, next, siteUrl, absUrl }) {
  const pageUrl = `${siteUrl}/read/${x.slug}.html`;
  const cover = url(x.cover, '../');
  const body = x.body;
  const ld = {
    '@context': 'https://schema.org', '@type': 'Article', headline: x.title, description: x.subtitle,
    datePublished: x.date, author: { '@type': 'Person', name: 'Sheridan Guerrette' },
    publisher: { '@type': 'Organization', name: 'What Sheridan Said' }, mainEntityOfPage: pageUrl,
    isAccessibleForFree: true, ...(x.cover ? { image: absUrl(x.cover) } : {}),
  };
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
  <div class="tag-row"><span>${esc(tagShort(x))}</span></div>
  <h1>${esc(x.title)}</h1>
  <p class="dek">${esc(x.subtitle)}</p>
  <div class="byline">Sheridan Guerrette<span class="sep">&middot;</span>${fmtDate(x.date)}</div>
  <p class="read-sub-line">New episodes and poems land in your email inbox as they're written.</p>
  <form class="subscribe-form read-sub-form">
    <input type="email" placeholder="Your email" aria-label="Your email" required>
    <button type="submit">Subscribe</button>
    <div class="form-note">You're on the list &mdash; welcome.</div>
  </form>
</div>

${cover ? `<div class="read-cover"><img src="${esc(cover)}" alt="${esc(x.title)}" onerror="this.parentNode.remove()"></div>` : ''}

<div class="read-body">
${fixBody(body, '../')}
</div>

${letterCard(x, '../')}

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
      <p class="feature-line">Paid members are mailed a handwritten poem from me every month, with a letter beside it, written just for them. $8 a month or $80 a year.</p>
      <form class="subscribe-form on-light" id="drawInSubscribe">
        <input type="email" placeholder="Your email" aria-label="Your email" required>
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

// Given the full post list (already sanitized) and a slug, find the post and its
// prev/next within its own sequence (episodes together, poems together) -- the exact
// same grouping/order build.js uses, kept here so both call sites can never drift apart.
function findWithNav(allPosts, slug) {
  const published = allPosts.filter((p) => p.status !== 'draft');
  const episodes = published.filter((p) => p.kind !== 'poem').sort((a, b) => sortKey(a) - sortKey(b));
  const poems = published.filter((p) => p.kind === 'poem').sort((a, b) => a.date.localeCompare(b.date));
  for (const seq of [episodes, poems]) {
    const i = seq.findIndex((x) => x.slug === slug);
    if (i > -1) return { post: seq[i], prev: seq[i - 1] || null, next: seq[i + 1] || null };
  }
  return null;
}

module.exports = { letterCard, readPage, findWithNav, esc, fmtDate, tagShort, tagLong, sortKey, url, fixBody, navLink, FOOTER };
