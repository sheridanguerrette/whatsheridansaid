'use strict';
const { json, authorize } = require('../../lib/github');
const { deleteAddress } = require('../../lib/addresses');

// POST { email, remove: true }  deletes an address
exports.handler = async (event) => {
  require('../../lib/blobs-connect').connect(event);
  const denied = await authorize(event); if (denied) return denied;
  let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request' }); }
  if (!body.remove || !body.email) return json(400, { error: 'Nothing to do.' });
  await deleteAddress(body.email);
  return json(200, { ok: true });
};
