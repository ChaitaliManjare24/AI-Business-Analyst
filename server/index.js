'use strict';
/**
 * AI Business Assistant — HTTP server.
 * Express + SQLite, static SPA, JSON API under /api.
 */
const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { requireAuth, csrfShield, currentUser } = require('./auth');
const ai = require('./ai');
const { ensureDemoUser } = require('./seed');

const app = express();
const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());
app.use(csrfShield);

// Baseline security headers (no external CDNs are used, so CSP stays tight).
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "connect-src 'self'",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  });
  next();
});

// ------------------------------------------------------------------ routes
app.get('/api/public/status', (req, res) => {
  res.json({ name: 'AI Business Assistant', version: '1.0.0', ai: ai.status(), authenticated: !!currentUser(req) });
});

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/tasks', requireAuth, require('./routes/tasks.routes'));
app.use('/api', requireAuth, require('./routes/workspace.routes'));
app.use('/api/stats', requireAuth, require('./routes/stats.routes'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }));

// ------------------------------------------------------------------- static
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// -------------------------------------------------------------- error layer
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[error]', err);
  if (res.headersSent) return;
  res.status(status).json({
    error: status >= 500
      ? 'Something went wrong on our side. Please try again in a moment.'
      : err.message || 'Request could not be completed.'
  });
});

if (require.main === module) {
  ensureDemoUser();
  app.listen(PORT, async () => {
    console.log(`\n  AI Business Assistant running at http://localhost:${PORT}`);
    const s = await ai.probe();
    console.log(`  AI engine: ${s.label} (${s.model})\n`);
  });
}

module.exports = app;
