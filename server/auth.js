'use strict';
/**
 * Authentication: scrypt password hashing (per-user salt), opaque session
 * tokens stored server-side, HttpOnly SameSite cookies. No secrets or hashes
 * are ever returned to the client.
 */
const crypto = require('node:crypto');
const { get, run } = require('./db');

const SESSION_DAYS = 7;
const COOKIE = 'ba_session';

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
};

const verifyPassword = (password, salt, expectedHex) => {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHex, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400000);
  run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)',
    token, userId, now.toISOString(), expires.toISOString());
  return { token, expires };
}

function setSessionCookie(res, token, expires) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1',
    expires,
    path: '/'
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

function currentUser(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  const row = get(
    `SELECT s.token, s.expires_at, u.id, u.email, u.name, u.company, u.role, u.created_at
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
    token
  );
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    run('DELETE FROM sessions WHERE token = ?', token);
    return null;
  }
  return row;
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required.' });
  req.user = user;
  return next();
}

/** Blocks cross-site state changes (defence in depth alongside SameSite). */
function csrfShield(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    const { host } = new URL(origin);
    if (host !== req.get('host')) return res.status(403).json({ error: 'Cross-origin request blocked.' });
  } catch {
    return res.status(403).json({ error: 'Invalid origin.' });
  }
  return next();
}

/** Simple in-memory sliding-window limiter for sensitive endpoints. */
function rateLimit({ windowMs = 15 * 60 * 1000, max = 20 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const entry = hits.get(key) || { count: 0, reset: now + windowMs };
    if (now > entry.reset) {
      entry.count = 0;
      entry.reset = now + windowMs;
    }
    entry.count += 1;
    hits.set(key, entry);
    if (hits.size > 5000) hits.clear();
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    }
    return next();
  };
}

function validatePassword(password = '') {
  if (password.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must contain at least one letter and one number.';
  return null;
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, company: u.company || '', role: u.role || '', createdAt: u.created_at });

module.exports = {
  hashPassword, verifyPassword, createSession, setSessionCookie, clearSessionCookie,
  currentUser, requireAuth, csrfShield, rateLimit, validatePassword, publicUser, COOKIE
};
