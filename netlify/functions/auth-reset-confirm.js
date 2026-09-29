'use strict';
const { consumeToken, getSubscriber, saveSubscriber, hashPassword } = require('../../lib/subscribers');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return resp(405, { error: 'Method not allowed' });
  let body; try { body = JSON.parse(event.body || '{}'); } catch { return resp(400, { error: 'Bad request' }); }
  const password = String(body.password || '');
  if (password.length < 8) return resp(400, { error: 'Password needs to be at least 8 characters.' });

  const rec = await consumeToken('reset', body.token);
  if (!rec) return resp(400, { error: 'That link has expired or was already used. Request a new one.' });

  const record = await getSubscriber(rec.email);
  if (!record) return resp(404, { error: 'Account not found.' });
  record.passwordHash = hashPassword(password);
  await saveSubscriber(record);
  return resp(200, { ok: true });
};

function resp(status, obj) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) };
}
