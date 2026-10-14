'use strict';
const { json } = require('../../lib/github');
const { addSignup } = require('../../lib/signups');

exports.handler = async (event) => {
  require('../../lib/blobs-connect').connect(event);
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request' }); }
  if (body.website) return json(200, { ok: true }); // honeypot: bots fill this, people never see it
  const r = await addSignup(body.email, body.source);
  if (!r.ok) return json(400, { error: 'That email address doesn’t look right.' });
  return json(200, { ok: true });
};
