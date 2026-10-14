'use strict';
const { json } = require('../../lib/github');
const { saveAddress } = require('../../lib/addresses');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request' }); }
  if (body.website) return json(200, { ok: true }); // honeypot: bots fill this, people never see it
  const r = await saveAddress(body);
  if (!r.ok) return json(400, { error: r.error });
  return json(200, { ok: true, updated: r.updated });
};
