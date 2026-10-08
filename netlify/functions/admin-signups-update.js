'use strict';
const { json, authorize } = require('../../lib/github');
const { updateSignup, deleteSignup } = require('../../lib/signups');

// POST { email, added: true|false }  marks a signup as added to Substack
// POST { email, remove: true }       deletes it
exports.handler = async (event) => {
  const denied = await authorize(event); if (denied) return denied;
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request' }); }
  if (body.remove) { await deleteSignup(body.email); return json(200, { ok: true }); }
  const r = await updateSignup(body.email, { added: !!body.added });
  if (!r) return json(404, { error: 'No signup with that email.' });
  return json(200, { ok: true });
};
