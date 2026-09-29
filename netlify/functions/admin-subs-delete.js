'use strict';
const { json, authorize } = require('../../lib/github');
const { getSubscriber, norm } = require('../../lib/subscribers');
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const denied = await authorize(event); if (denied) return denied;
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request' }); }
  const email = norm(body.email);
  const existing = await getSubscriber(email);
  if (!existing) return json(404, { error: 'No subscriber with that email.' });
  await getStore('subscribers').delete(email);
  return json(200, { ok: true });
};
