'use strict';
// Shared by the site build and the editor's save function, so a post is
// cleaned and validated the same way no matter where it comes from.
const sanitizeHtml = require('sanitize-html');

const SANITIZE = {
  allowedTags: ['p', 'br', 'strong', 'em', 'a', 'h2', 'h3', 'h4', 'hr', 'figure', 'figcaption',
    'img', 'blockquote', 'ul', 'ol', 'li', 'pre', 'code'],
  allowedAttributes: { a: ['href', 'rel'], img: ['src', 'alt', 'loading'], p: ['class'] },
  allowedClasses: { p: ['stanza'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  transformTags: {
    b: 'strong', i: 'em', h1: 'h2', h5: 'h4', h6: 'h4',
    a: (tag, attribs) => ({ tagName: 'a', attribs: attribs.href ? { href: attribs.href, rel: 'noopener' } : {} }),
    img: (tag, attribs) => ({ tagName: 'img', attribs: { src: attribs.src || '', alt: attribs.alt || '', loading: 'lazy' } }),
  },
  exclusiveFilter: (frame) => {
    if (frame.tag === 'img') return !frame.attribs.src;
    if (['p', 'h2', 'h3', 'h4'].includes(frame.tag)) return !frame.text.trim() && !(frame.mediaChildren && frame.mediaChildren.length);
    return false;
  },
};

function sanitizeBody(html) {
  return wrapStray(sanitizeHtml(String(html || ''), SANITIZE).trim());
}

// Loose text / inline tags sitting directly in the body get wrapped in a paragraph.
const BLOCK_START = /^<(p|h2|h3|h4|hr|figure|blockquote|ul|ol|pre)\b/i;
function wrapStray(html) {
  const out = []; let inline = '';
  const flush = () => { if (inline.trim()) out.push(`<p>${inline.trim()}</p>`); inline = ''; };
  for (const b of splitBlocks(html)) {
    if (BLOCK_START.test(b.trim())) { flush(); out.push(b); } else { inline += b; }
  }
  flush();
  return out.join('');
}

function textOf(html) {
  return sanitizeHtml(String(html || ''), { allowedTags: [], allowedAttributes: {} })
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

// Split sanitized HTML into its top-level blocks (used for the paywall preview).
// Loose text / inline tags between blocks are kept together as one run.
const BLOCK = new Set(['p', 'h2', 'h3', 'h4', 'hr', 'figure', 'blockquote', 'ul', 'ol', 'pre']);
function splitBlocks(html) {
  const re = /<(\/?)([a-z0-9]+)\b[^>]*>|[^<]+/gi;
  const blocks = []; let cur = ''; let depth = 0; let m;
  const flush = () => { if (cur.trim()) blocks.push(cur); cur = ''; };
  while ((m = re.exec(html))) {
    const tok = m[0];
    if (!m[2]) { cur += tok; continue; }
    const name = m[2].toLowerCase(); const closing = m[1] === '/';
    if (depth === 0 && !closing && BLOCK.has(name)) flush();
    cur += tok;
    if (name === 'br' || name === 'img') continue;            // inline void tags
    if (name === 'hr') { if (depth === 0) flush(); continue; } // block void tag
    depth += closing ? -1 : 1;
    if (depth === 0 && BLOCK.has(name)) flush();
  }
  flush();
  return blocks;
}

const TEXT_BLOCK = /^<(p|h2|h3|h4|blockquote|ul|ol|pre)\b/i;
const PARA_BLOCK = /^<(p|blockquote|ul|ol|pre)\b/i;
function previewBlocks(html, count) {
  const out = []; let paras = 0;
  for (const b of splitBlocks(html)) {
    if (!TEXT_BLOCK.test(b)) continue;          // skip images / dividers
    if (PARA_BLOCK.test(b)) { if (paras >= count) break; paras++; }
    out.push(b);
  }
  return out.join('');
}

// A leading heading that just repeats the post title is redundant (the page already has an <h1>).
const normTitle = (s) => s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
  .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/[^a-z0-9]+/g, ' ').trim();
function stripLeadingTitle(html, title) {
  const blocks = splitBlocks(html); const t = normTitle(title);
  for (let i = 0; i < Math.min(2, blocks.length); i++) {
    if (/^<h[23]\b/i.test(blocks[i]) && normTitle(textOf(blocks[i])) === t) { blocks.splice(i, 1); break; }
  }
  return blocks.join('');
}

function slugify(s) {
  return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
    .replace(/-$/, '') || 'post';
}

function uniqueSlug(base, taken) {
  let s = base; let n = 2;
  while (taken.has(s)) s = `${base.slice(0, 55)}-${n++}`;
  return s;
}

const KINDS = ['episode', 'poem', 'special'];
const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; };

// Validate + normalise a post coming from the editor. Throws Error with a readable message.
function normalizePost(input, existing, takenSlugs) {
  const p = input || {};
  const title = String(p.title || '').trim();
  if (!title) throw new Error('A title is required.');
  if (title.length > 200) throw new Error('Title is too long (200 characters max).');
  const kind = KINDS.includes(p.kind) ? p.kind : 'episode';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(p.date || '') ? p.date : null;
  if (!date) throw new Error('Please choose a valid publish date.');
  const body = stripLeadingTitle(sanitizeBody(p.body), title);
  if (Buffer.byteLength(body) > 400 * 1024) throw new Error('This post is too large (400 KB max).');
  const cover = String(p.cover || '').trim();
  if (cover && !/^(https?:\/\/|assets\/)/i.test(cover)) throw new Error('Cover image must be a full https:// link or an uploaded image.');
  const out = {
    id: existing ? existing.id : null,
    slug: existing ? existing.slug : uniqueSlug(slugify(p.slug || title), takenSlugs || new Set()),
    title,
    subtitle: String(p.subtitle || '').trim().slice(0, 400),
    kind,
    season: kind === 'poem' ? null : int(p.season, 1),
    episode: kind === 'poem' ? null : (p.finale && kind === 'episode' ? null : int(p.episode, 1)),
    finale: kind === 'episode' ? !!p.finale : false,
    audience: p.audience === 'free' ? 'free' : 'paid',
    status: p.status === 'draft' ? 'draft' : 'published',
    date,
    cover,
    featured: existing ? !!existing.featured : false,
    spotlight: existing ? !!existing.spotlight : false,
    sourceId: existing ? (existing.sourceId || null) : null,
    body,
  };
  out.id = out.id || out.slug;
  if (kind !== 'poem' && !out.finale && !out.episode) out.episode = 1;
  return out;
}

module.exports = { sanitizeBody, textOf, splitBlocks, previewBlocks, stripLeadingTitle, slugify, uniqueSlug, normalizePost };
