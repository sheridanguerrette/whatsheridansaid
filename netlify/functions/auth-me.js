'use strict';
const { readSession, getSubscriber, hasActiveAccess } = require('../../lib/subscribers');

function readCookie(event, name) {
  const header = event.headers.cookie || event.headers.Cookie || '';
  const match = header.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

exports.handler = async (event) => {
  const sid = readCookie(event, 'wss_session');
  const session = await readSession(sid);
  if (!session) return resp(200, { loggedIn: false });

  const record = await getSubscriber(session.email);
  return resp(200, {
    loggedIn: true,
    email: session.email,
    hasAccess: hasActiveAccess(record),
    status: record ? record.status : 'unknown',
  });
};

function resp(status, obj) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) };
}
