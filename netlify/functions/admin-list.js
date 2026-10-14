'use strict';
const { json, authorize, readPosts } = require('../../lib/github');

// Returns every post (including drafts and full text of paid posts) - only ever after the password check.
exports.handler = async (event) => {
  require('../../lib/blobs-connect').connect(event);
  const denied = await authorize(event); if (denied) return denied;
  try { const { posts } = await readPosts(); return json(200, { posts }); }
  catch (e) { return json(502, { error: 'Could not load your posts: ' + e.message }); }
};
