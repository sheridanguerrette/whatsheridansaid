'use strict';
const { destroySession } = require('../../lib/subscribers');

function readCookie(event, name) {
  const header = event.headers.cookie || event.headers.Cookie || '';
  const match = header.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

exports.handler = async (event) => {
  const sid = readCookie(event, 'wss_session');
  await destroySession(sid);
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Set-Cookie': 'wss_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    },
    body: JSON.stringify({ ok: true }),
  };
};
