'use strict';
const { consumeToken, createSession } = require('../../lib/subscribers');

exports.handler = async (event) => {
  const token = event.queryStringParameters && event.queryStringParameters.token;
  if (!token) return resp(400, { error: 'Missing token' });

  const rec = await consumeToken('magic', token);
  if (!rec) return resp(400, { error: 'That link has expired or was already used. Request a new one.' });

  const sid = await createSession(rec.email);
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Set-Cookie': `wss_session=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 86400}`,
    },
    body: JSON.stringify({ ok: true }),
  };
};

function resp(status, obj) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) };
}
