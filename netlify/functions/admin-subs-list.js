'use strict';
const { json, authorize } = require('../../lib/github');
const { listSubscribers } = require('../../lib/subscribers');

exports.handler = async (event) => {
  const denied = await authorize(event); if (denied) return denied;
  try { const subscribers = await listSubscribers(); return json(200, { subscribers }); }
  catch (e) { return json(502, { error: 'Could not load subscribers: ' + e.message }); }
};
