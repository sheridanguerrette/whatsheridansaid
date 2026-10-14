'use strict';
// Netlify functions written in the classic (event) style must hand their event to Netlify Blobs
// before any store can be opened, otherwise reads and writes fail on the live site.
function connect(event) {
  try { const b = require('@netlify/blobs'); if (b && typeof b.connectLambda === 'function') b.connectLambda(event); } catch (e) { /* tests / local */ }
}
module.exports = { connect };
