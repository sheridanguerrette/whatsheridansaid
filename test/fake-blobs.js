'use strict';
// A tiny in-memory stand-in for @netlify/blobs, for tests only. Real behavior lives
// on Netlify at runtime; this just lets lib/subscribers.js run in plain Node.

function makeStore(data) {
  return {
    async get(key, opts) {
      const v = data.has(key) ? data.get(key) : undefined;
      if (v === undefined) return null;
      return opts && opts.type === 'json' ? JSON.parse(v) : v;
    },
    async setJSON(key, value) { data.set(key, JSON.stringify(value)); },
    async delete(key) { data.delete(key); },
    async list() { return { blobs: [...data.keys()].map((key) => ({ key })) }; },
  };
}

function install() {
  const stores = new Map(); // store name -> Map(key -> value)
  const getStore = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return makeStore(stores.get(name));
  };
  const modPath = require.resolve('@netlify/blobs');
  require.cache[modPath] = { id: modPath, filename: modPath, loaded: true, exports: { getStore } };
  return { stores, reset: () => stores.clear() };
}

module.exports = { install };
