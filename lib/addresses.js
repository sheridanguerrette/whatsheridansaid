'use strict';
// Mailing addresses from paid members, submitted on the site's /mail page. Stored privately in
// Netlify Blobs and only ever shown inside the password-protected editor. Keyed by email, so a
// member who moves can submit again and the newest address replaces the old one.
const { getStore } = require('@netlify/blobs');
const store = () => getStore('addresses');
const norm = (e) => String(e || '').trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v, max = 120) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

const REQUIRED = [['name', 'your name'], ['line1', 'your street address'], ['city', 'your city'], ['postal', 'your postal code'], ['country', 'your country']];

async function saveAddress(input) {
  const a = {
    name: clean(input.name), email: norm(input.email).slice(0, 254), line1: clean(input.line1), line2: clean(input.line2),
    city: clean(input.city), region: clean(input.region), postal: clean(input.postal, 30), country: clean(input.country),
  };
  if (!EMAIL_RE.test(a.email)) return { ok: false, error: 'That email address doesn’t look right.' };
  for (const [k, label] of REQUIRED) if (!a[k]) return { ok: false, error: `Please add ${label}.` };
  const existing = await store().get(a.email, { type: 'json' });
  const now = new Date().toISOString();
  await store().setJSON(a.email, { ...a, at: existing ? existing.at : now, updated: now });
  return { ok: true, updated: !!existing };
}
async function listAddresses() {
  const { blobs } = await store().list();
  const out = [];
  for (const b of blobs) { const r = await store().get(b.key, { type: 'json' }); if (r) out.push(r); }
  return out.sort((x, y) => (y.updated || y.at || '').localeCompare(x.updated || x.at || ''));
}
async function deleteAddress(email) { await store().delete(norm(email)); }

module.exports = { saveAddress, listAddresses, deleteAddress };
