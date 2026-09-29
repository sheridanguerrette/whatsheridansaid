'use strict';
const { getSubscriber, verifyPassword, createSession, norm } = require('../../lib/subscribers');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  let body; try { body = JSON.parse(event.body || '{}'); } catch { return resp(400, { error: 'Bad request' }); }
  const email = norm(body.email);
  const password = String(body.password || '');

  const record = await getSubscriber(email);
  const ok = record && record.passwordHash && verifyPassword(password, record.passwordHash);
  if (!ok) {
    // Same delay whether the account exists or the password is wrong, so a failed
    // login can't be used to probe which emails have accounts.
    await sleep(Number(process.env.AUTH_FAIL_DELAY_MS ?? 500));
    return resp(401, {
      error: 'That email or password isn\u2019t right.',
      offerReset: true, // tells the login form to show "forgot your password?"
    });
  }

  const sid = await createSession(email);
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Set-Cookie': `wss_session=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 86400}`,
    },
    body: JSON.stringify({ ok: true, status: record.status }),
  };
};

function resp(status, obj) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) };
}
