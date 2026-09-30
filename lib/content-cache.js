'use strict';
// GitHub (via lib/github.js) stays the source of truth and version history for
// posts.json. This is a fast read-through cache in Netlify Blobs, updated on every
// successful save, so a page view never has to wait on (or rate-limit against)
// the GitHub API. If the cache is ever empty -- e.g. the very first request after
// this feature ships -- callers fall back to reading GitHub directly.
const { getStore } = require('@netlify/blobs');

const store = () => getStore('content');
const KEY = 'posts.json';

async function getCachedPosts() {
  return store().get(KEY, { type: 'json' }); // null if never cached yet
}

async function setCachedPosts(posts) {
  await store().setJSON(KEY, posts);
}

module.exports = { getCachedPosts, setCachedPosts };
