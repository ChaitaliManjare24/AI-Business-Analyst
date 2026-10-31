'use strict';
const express = require('express');
const { get, run, all, logActivity } = require('../db');
const {
  hashPassword, verifyPassword, createSession, setSessionCookie, clearSessionCookie,
  requireAuth, rateLimit, validatePassword, publicUser
} = require('../auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

router.post('/register', rateLimit({ max: 12 }), (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const company = String(req.body?.company || '').trim();
  const role = String(req.body?.role || '').trim();

  if (name.length < 2) return res.status(400).json({ error: 'Please enter your full name.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });
  if (get('SELECT id FROM users WHERE email = ?', email)) {
    return res.status(409).json({ error: 'An account with that email already exists. Try signing in instead.' });
  }

  const { hash, salt } = hashPassword(password);
  const info = run(
    'INSERT INTO users (email, name, password_hash, salt, company, role, created_at) VALUES (?,?,?,?,?,?,?)',
    email, name, hash, salt, company, role, new Date().toISOString()
  );
  const userId = Number(info.lastInsertRowid);
  const { token, expires } = createSession(userId);
  setSessionCookie(res, token, expires);
  logActivity(userId, 'account', 'Account created');
  return res.status(201).json({ user: publicUser(get('SELECT * FROM users WHERE id = ?', userId)) });
});

router.post('/login', rateLimit({ max: 15 }), (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = get('SELECT * FROM users WHERE email = ?', email);
  if (!user || !verifyPassword(password, user.salt, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  const { token, expires } = createSession(user.id);
  setSessionCookie(res, token, expires);
  return res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  const token = req.cookies?.ba_session;
  if (token) run('DELETE FROM sessions WHERE token = ?', token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.patch('/me', requireAuth, (req, res) => {
  const name = String(req.body?.name || '').trim();
  const company = String(req.body?.company || '').trim();
  const role = String(req.body?.role || '').trim();
  if (name.length < 2) return res.status(400).json({ error: 'Please enter your full name.' });
  run('UPDATE users SET name = ?, company = ?, role = ? WHERE id = ?', name, company, role, req.user.id);
  res.json({ user: publicUser(get('SELECT * FROM users WHERE id = ?', req.user.id)) });
});

router.post('/password', requireAuth, (req, res) => {
  const current = String(req.body?.currentPassword || '');
  const next = String(req.body?.newPassword || '');
  const user = get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!verifyPassword(current, user.salt, user.password_hash)) {
    return res.status(400).json({ error: 'Your current password is incorrect.' });
  }
  const err = validatePassword(next);
  if (err) return res.status(400).json({ error: err });
  const { hash, salt } = hashPassword(next);
  run('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?', hash, salt, req.user.id);
  run('DELETE FROM sessions WHERE user_id = ? AND token != ?', req.user.id, req.cookies?.ba_session || '');
  res.json({ ok: true });
});

router.delete('/account', requireAuth, (req, res) => {
  const password = String(req.body?.password || '');
  const user = get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!verifyPassword(password, user.salt, user.password_hash)) {
    return res.status(400).json({ error: 'Password is incorrect.' });
  }
  run('DELETE FROM users WHERE id = ?', req.user.id);
  clearSessionCookie(res);
  res.json({ ok: true });
});

module.exports = router;
void all;
