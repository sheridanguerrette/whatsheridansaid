'use strict';
// Email signups from the site's subscribe boxes. Stored in Netlify Blobs so Sheridan can
// copy them into Substack by hand. Nothing is ever emailed from here.
const { getStore } = require('@netlify/blobs');
const store = () => getStore('signups');
const norm = (e) => String(e || '').trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function addSignup(email, source) {
  email = norm(email);
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false };
  const existing = await store().get(email, { type: 'json' });
  if (existing) return { ok: true, duplicate: true };
  await store().setJSON(email, { email, source: String(source || 'site').slice(0, 40), at: new Date().toISOString(), added: false });
  return { ok: true };
}
async function listSignups() {
  const { blobs } = await store().list();
  const out = [];
  for (const b of blobs) { const r = await store().get(b.key, { type: 'json' }); if (r) out.push(r); }
  return out.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
}
async function updateSignup(email, patch) {
  email = norm(email);
  const r = await store().get(email, { type: 'json' });
  if (!r) return null;
  const next = { ...r, ...patch, email };
  await store().setJSON(email, next);
  return next;
}
async function deleteSignup(email) { await store().delete(norm(email)); }

module.exports = { addSignup, listSignups, updateSignup, deleteSignup, norm };
