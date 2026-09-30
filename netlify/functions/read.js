'use strict';
const { readPosts } = require('../../lib/github');
const { getCachedPosts } = require('../../lib/content-cache');
const { sanitizeBody, stripLeadingTitle } = require('../../lib/content');
const RP = require('../../lib/render-post');

const SITE_URL = (process.env.SITE_URL || 'https://whatsheridansaid.com').replace(/\/$/, '');
const absUrl = (u) => (!u ? '' : /^https?:/i.test(u) ? u : `${SITE_URL}/${u.replace(/^\//, '')}`);

function notFound() {
  return { statusCode: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: '<h1>Page not found</h1><p><a href="/">Back to What Sheridan Said</a></p>' };
}

exports.handler = async (event) => {
  const slug = (event.queryStringParameters && event.queryStringParameters.slug || '').replace(/\.html$/, '');
  if (!slug) return notFound();

  let posts = await getCachedPosts();
  if (!posts) { try { posts = (await readPosts()).posts; } catch (e) { return notFound(); } }

  // Same sanitizing pass build.js does at load time, so output matches exactly.
  posts = posts.map((p) => ({ ...p, body: stripLeadingTitle(sanitizeBody(p.body), p.title) }));

  const found = RP.findWithNav(posts, slug);
  if (!found || found.post.status === 'draft') return notFound();

  const html = RP.readPage(found.post, { prev: found.prev, next: found.next, siteUrl: SITE_URL, absUrl });
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' },
    body: html,
  };
};
