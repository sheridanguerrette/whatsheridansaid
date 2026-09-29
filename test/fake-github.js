'use strict';
// A small in-memory stand-in for the GitHub "contents" API, faithful to the parts we rely on.
const crypto = require('crypto');
const sha = (buf) => crypto.createHash('sha1').update(buf).digest('hex');

function createFakeGitHub({ repo, token, files }) {
  const store = new Map(); const commits = [];
  for (const [p, buf] of Object.entries(files)) store.set(p, { buf, sha: sha(buf) });
  const hooks = { beforePut: null };
  const respond = (status, obj) => ({ ok: status < 300, status, text: async () => JSON.stringify(obj) });

  async function fetchImpl(url, opts = {}) {
    const u = new URL(url);
    if (u.host !== 'api.github.com') throw new Error('unexpected host ' + u.host);
    if ((opts.headers || {}).Authorization !== `Bearer ${token}`) return respond(401, { message: 'Bad credentials' });
    const m = u.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/contents\/(.+)$/);
    if (!m || m[1] !== repo) return respond(404, { message: 'Not Found' });
    const filePath = decodeURIComponent(m[2]); const method = opts.method || 'GET';
    if (method === 'GET') {
      const f = store.get(filePath); if (!f) return respond(404, { message: 'Not Found' });
      const b64 = f.buf.toString('base64').replace(/(.{60})/g, '$1\n');       // GitHub wraps base64
      return respond(200, { type: 'file', encoding: 'base64', size: f.buf.length, path: filePath, sha: f.sha, content: b64 });
    }
    if (method === 'PUT') {
      const body = JSON.parse(opts.body);
      if (hooks.beforePut) { const h = hooks.beforePut; hooks.beforePut = null; h(store, sha); }
      const existing = store.get(filePath);
      if (existing && !body.sha) return respond(422, { message: '"sha" wasn\'t supplied.' });
      if (existing && body.sha !== existing.sha) return respond(409, { message: `${filePath} does not match ${body.sha}` });
      if (!existing && body.sha) return respond(422, { message: 'Invalid request.' });
      const buf = Buffer.from(body.content, 'base64');
      store.set(filePath, { buf, sha: sha(buf) });
      commits.push({ path: filePath, message: body.message, branch: body.branch });
      return respond(201, { content: { path: filePath, sha: sha(buf) }, commit: { message: body.message } });
    }
    return respond(405, { message: 'Method Not Allowed' });
  }
  return { fetch: fetchImpl, store, commits, hooks, json: (p) => JSON.parse(store.get(p).buf.toString('utf8')) };
}
module.exports = { createFakeGitHub };
