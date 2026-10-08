'use strict';
const { json, authorize } = require('../../lib/github');
const { listSignups } = require('../../lib/signups');

exports.handler = async (event) => {
  const denied = await authorize(event); if (denied) return denied;
  try { return json(200, { signups: await listSignups() }); }
  catch (e) { return json(502, { error: 'Could not load signups: ' + e.message }); }
};
