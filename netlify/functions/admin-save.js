'use strict';
const { json, authorize, readPosts, writePosts } = require('../../lib/github');
const { normalizePost } = require('../../lib/content');
const { setCachedPosts } = require('../../lib/content-cache');

// Creates or updates one post, then commits content/posts.json to GitHub (the
// permanent record) and refreshes the fast read cache the live read/:slug pages
// use, so the edit shows up immediately -- no site rebuild, no deploy, no cost.
exports.handler = async (event) => {
  require('../../lib/blobs-connect').connect(event);
  const denied = await authorize(event); if (denied) return denied;
  let payload; try { payload = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request.' }); }
  const incoming = payload.post; const isNew = !!payload.isNew;
  if (!incoming || typeof incoming !== 'object') return json(400, { error: 'Nothing to save.' });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { posts, sha } = await readPosts();
      let saved;
      if (isNew) {
        saved = normalizePost(incoming, null, new Set(posts.map((p) => p.slug)));
        posts.push(saved);
      } else {
        const idx = posts.findIndex((p) => p.id === incoming.id);
        if (idx < 0) return json(404, { error: 'That post no longer exists.' });
        saved = normalizePost(incoming, posts[idx]);
        posts[idx] = saved;
      }
      await writePosts(posts, sha, `${isNew ? 'New post' : 'Edit'}: ${saved.title}`);
      try { await setCachedPosts(posts); } catch (e) { /* GitHub save already succeeded; cache refresh is best-effort */ }
      return json(200, { ok: true, post: saved });
    } catch (e) {
      if (e.status === 409 || e.status === 422) continue;          // file changed under us - re-read and retry
      if (!e.status) return json(400, { error: e.message });       // validation problem, safe to show
      return json(502, { error: 'Saving failed: ' + e.message });
    }
  }
  return json(409, { error: 'The site changed while you were saving. Please try again.' });
};
