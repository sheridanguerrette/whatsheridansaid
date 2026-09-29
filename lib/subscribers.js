// Subscriber accounts, sessions, and one-time tokens (password reset, magic link),
// stored in Netlify Blobs. Kept separate from the GitHub-backed content store on
// purpose: accounts and tokens change far more often than posts, and don't belong
// in git history.
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

const subs = () => getStore('subscribers');       // key: lowercased email -> subscriber record
const tokens = () => getStore('auth-tokens');      // key: token -> { kind, email, expires }
const sessions = () => getStore('sessions');       // key: session id -> { email, expires }

const norm = (email) => String(email || '').trim().toLowerCase();

// ---------- passwords (scrypt, no extra dependency) ----------
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [saltHex, hashHex] = stored.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(password), salt, 64);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// ---------- subscriber records ----------
async function getSubscriber(email) {
  const raw = await subs().get(norm(email), { type: 'json' });
  return raw || null;
}
async function saveSubscriber(record) {
  const email = norm(record.email);
  await subs().setJSON(email, { ...record, email });
  return { ...record, email };
}
async function listSubscribers() {
  const { blobs } = await subs().list();
  const out = [];
  for (const b of blobs) {
    const rec = await subs().get(b.key, { type: 'json' });
    if (rec) out.push(rec);
  }
  return out.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function newSubscriberRecord({ email, password, source, status, expires, note }) {
  return {
    email: norm(email),
    passwordHash: password ? hashPassword(password) : null,
    source: source || 'signup',        // 'signup' | 'manual' | 'stripe' | 'gift-trial'
    status: status || 'active',        // 'active' | 'trialing' | 'canceled' | 'expired'
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    expires: expires || null,          // ISO date string, or null for no fixed expiry
    note: note || '',
    createdAt: new Date().toISOString(),
  };
}

// ---------- one-time tokens: password reset + magic link ----------
function makeToken() { return crypto.randomBytes(24).toString('hex'); }

async function createToken(kind, email, ttlMinutes = 30) {
  const token = makeToken();
  await tokens().setJSON(token, {
    kind, email: norm(email),
    expires: new Date(Date.now() + ttlMinutes * 60000).toISOString(),
  });
  return token;
}
async function consumeToken(kind, token) {
  const rec = await tokens().get(token, { type: 'json' });
  if (!rec || rec.kind !== kind) return null;
  if (new Date(rec.expires).getTime() < Date.now()) { await tokens().delete(token); return null; }
  await tokens().delete(token); // one-time use
  return rec;
}

// ---------- sessions ----------
async function createSession(email, days = 30) {
  const id = makeToken();
  await sessions().setJSON(id, {
    email: norm(email),
    expires: new Date(Date.now() + days * 86400000).toISOString(),
  });
  return id;
}
async function readSession(id) {
  if (!id) return null;
  const rec = await sessions().get(id, { type: 'json' });
  if (!rec) return null;
  if (new Date(rec.expires).getTime() < Date.now()) { await sessions().delete(id); return null; }
  return rec;
}
async function destroySession(id) { if (id) await sessions().delete(id); }

// ---------- access check: does this subscriber currently have paid access? ----------
function hasActiveAccess(record) {
  if (!record) return false;
  if (record.status !== 'active' && record.status !== 'trialing') return false;
  if (record.expires && new Date(record.expires).getTime() < Date.now()) return false;
  return true;
}

module.exports = {
  hashPassword, verifyPassword,
  getSubscriber, saveSubscriber, listSubscribers, newSubscriberRecord,
  createToken, consumeToken,
  createSession, readSession, destroySession,
  hasActiveAccess, norm,
};
