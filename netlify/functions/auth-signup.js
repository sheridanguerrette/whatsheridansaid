'use strict';
const { json } = require('../../lib/github');
const { getSubscriber, saveSubscriber, newSubscriberRecord, createSession, norm } = require('../../lib/subscribers');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request' }); }
  const email = norm(body.email);
  const password = String(body.password || '');
  if (!EMAIL_RE.test(email)) return json(400, { error: 'That email address doesn\u2019t look right.' });
  if (password.length < 8) return json(400, { error: 'Password needs to be at least 8 characters.' });

  const existing = await getSubscriber(email);
  if (existing) return json(409, { error: 'An account already exists for that email. Try logging in instead.' });

  const record = newSubscriberRecord({ email, password, source: 'signup', status: 'active' });
  // New signups start as free-tier accounts (no paid access) until they subscribe via Stripe.
  record.status = 'free';
  await saveSubscriber(record);

  const sid = await createSession(email);
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
