'use strict';
// Password check + tiny GitHub client, shared by the editor's functions.
const crypto = require('crypto');
const POSTS_PATH = 'content/posts.json';

const cfg = () => ({ repo: process.env.GITHUB_REPO, branch: process.env.GITHUB_BRANCH || 'main', token: process.env.GITHUB_TOKEN });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function json(status, obj) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) };
}

// Returns null when the request is allowed, otherwise a ready-made error response.
async function authorize(event) {
  const c = cfg(); const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return json(500, { error: 'The editor is not set up yet: ADMIN_PASSWORD is missing in Netlify.' });
  if (!c.token || !c.repo) return json(500, { error: 'The editor is not set up yet: GITHUB_TOKEN or GITHUB_REPO is missing in Netlify.' });
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
  const h = event.headers || {};
  const given = String(h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) { await sleep(Number(process.env.AUTH_FAIL_DELAY_MS ?? 800)); return json(401, { error: 'That password is not right.' }); }
  return null;
}

async function gh(method, apiPath, body, accept) {
  const { repo, token } = cfg();
  const res = await fetch(`https://api.github.com/repos/${repo}/${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`, Accept: accept || 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'wss-editor', 'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch (e) { data = text; }
  if (!res.ok) { const err = new Error((data && data.message) || `GitHub ${res.status}`); err.status = res.status; throw err; }
  return data;
}

async function readPosts() {
  const d = await gh('GET', `contents/${POSTS_PATH}?ref=${encodeURIComponent(cfg().branch)}`, null, 'application/vnd.github.object+json');
  return { posts: JSON.parse(Buffer.from(d.content || '', 'base64').toString('utf8')), sha: d.sha };
}

async function writePosts(posts, sha, message) {
  return gh('PUT', `contents/${POSTS_PATH}`, {
    message, branch: cfg().branch, sha,
    content: Buffer.from(JSON.stringify(posts, null, 1), 'utf8').toString('base64'),
  });
}

async function writeNewFile(filePath, buffer, message) {
  return gh('PUT', `contents/${filePath}`, { message, branch: cfg().branch, content: buffer.toString('base64') });
}

module.exports = { json, authorize, readPosts, writePosts, writeNewFile, POSTS_PATH };
