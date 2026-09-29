'use strict';
const { getSubscriber, createToken, norm } = require('../../lib/subscribers');
const { sendMagicLink } = require('../../lib/email');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return resp(405, { error: 'Method not allowed' });
  let body; try { body = JSON.parse(event.body || '{}'); } catch { return resp(400, { error: 'Bad request' }); }
  const email = norm(body.email);

  const record = await getSubscriber(email);
  // Always respond the same way whether or not the account exists, so this can't be
  // used to check which emails are registered.
  if (record) {
    const token = await createToken('magic', email, 30);
    const base = process.env.SITE_URL || 'https://whatsheridansaid.com';
    const url = `${base}/read/verify.html?kind=magic&token=${token}`;
    await sendMagicLink(email, url);
  }
  return resp(200, { ok: true, message: 'If that email has an account, a login link is on its way.' });
};

function resp(status, obj) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) };
}
