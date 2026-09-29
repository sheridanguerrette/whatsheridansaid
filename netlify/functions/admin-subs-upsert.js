'use strict';
const { json, authorize } = require('../../lib/github');
const { getSubscriber, saveSubscriber, newSubscriberRecord, createToken, norm } = require('../../lib/subscribers');
const { sendAccessGranted } = require('../../lib/email');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATUSES = ['active', 'trialing', 'free', 'canceled', 'expired'];

exports.handler = async (event) => {
  const denied = await authorize(event); if (denied) return denied;
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request' }); }

  const email = norm(body.email);
  if (!EMAIL_RE.test(email)) return json(400, { error: 'That email address doesn\u2019t look right.' });
  const status = STATUSES.includes(body.status) ? body.status : 'active';
  if (body.expires && Number.isNaN(new Date(body.expires).getTime())) return json(400, { error: 'That expiry date isn\u2019t valid.' });
  const expires = body.expires ? new Date(body.expires).toISOString() : null;

  let record = await getSubscriber(email);
  if (record) {
    record.status = status;
    record.expires = expires;
    record.note = String(body.note || record.note || '').slice(0, 2000);
    if (body.source) record.source = String(body.source).slice(0, 60);
  } else {
    record = newSubscriberRecord({
      email, password: null, source: String(body.source || 'manual').slice(0, 60), status, expires, note: String(body.note || '').slice(0, 2000),
    });
  }
  await saveSubscriber(record);

  if (body.notify) {
    const token = await createToken('magic', email, 60 * 24); // give a gift email a day to be opened, not just 30 minutes
    const base = process.env.SITE_URL || 'https://whatsheridansaid.com';
    const url = `${base}/read/verify.html?kind=magic&token=${token}`;
    try { await sendAccessGranted(email, url, expires); } catch (e) { return json(200, { ok: true, subscriber: record, notifyError: e.message }); }
  }
  return json(200, { ok: true, subscriber: record });
};
