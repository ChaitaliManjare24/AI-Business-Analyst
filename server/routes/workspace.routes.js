'use strict';
const express = require('express');
const multer = require('multer');
const path = require('node:path');
const { get, run, all, logActivity } = require('../db');
const ai = require('../ai');
const { extractText, UploadError, MAX_BYTES } = require('../lib/extract');
const T = require('../lib/text');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowed = ['.pdf', '.txt', '.md', '.markdown', '.csv', '.log', '.rtf'];
    if (allowed.includes(ext) || (file.mimetype || '').startsWith('text/')) return cb(null, true);
    return cb(new UploadError(`Unsupported file type "${ext || file.mimetype}". Upload a PDF, TXT, MD or CSV file.`, 415));
  }
});

const parse = (v, fallback = []) => {
  try { const p = JSON.parse(v); return Array.isArray(p) ? p : fallback; } catch { return fallback; }
};

const EMAIL_TONES = ['formal', 'professional', 'friendly'];

/** Full data export (GDPR-style portability). */
router.get('/export', (req, res) => {
  const uid = req.user.id;
  const dump = (table) => all(`SELECT * FROM ${table} WHERE user_id = ?`, uid);
  res.set('Content-Type', 'application/json');
  res.set('Content-Disposition', `attachment; filename="bizassist-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify({
    exportedAt: new Date().toISOString(),
    user: { name: req.user.name, email: req.user.email, company: req.user.company, role: req.user.role },
    tasks: dump('tasks'), emails: dump('emails'), documents: dump('documents'),
    meetings: dump('meetings'), reports: dump('reports'), activity: dump('activity')
  }, null, 2));
});

// ------------------------------------------------------------------- email
router.get('/emails', (req, res) => {
  const rows = all('SELECT * FROM emails WHERE user_id = ? ORDER BY id DESC LIMIT 60', req.user.id);
  res.json({
    emails: rows.map((r) => ({
      id: r.id, mode: r.mode, tone: r.tone, recipient: r.recipient, subject: r.subject,
      body: r.body, brief: r.brief, engine: r.engine, createdAt: r.created_at
    }))
  });
});

router.post('/emails', async (req, res, next) => {
  try {
    const mode = ['new', 'followup', 'reply'].includes(req.body?.mode) ? req.body.mode : 'new';
    const tone = EMAIL_TONES.includes(req.body?.tone) ? req.body.tone : 'professional';
    const brief = String(req.body?.brief || '').slice(0, 4000).trim();
    const points = Array.isArray(req.body?.points)
      ? req.body.points.map((p) => String(p).trim()).filter(Boolean).slice(0, 12)
      : [];
    if (brief.length < 8 && !points.length) {
      return res.status(400).json({ error: 'Add a short brief or at least one key point so the assistant has something to work with.' });
    }

    const result = await ai.emailTask({
      mode, tone,
      recipient: String(req.body?.recipient || '').slice(0, 80).trim(),
      senderName: req.user.name,
      subject: String(req.body?.subject || '').slice(0, 140).trim(),
      brief, points,
      length: ['short', 'medium', 'long'].includes(req.body?.length) ? req.body.length : 'medium'
    });

    const now = new Date().toISOString();
    const info = run(
      `INSERT INTO emails (user_id, mode, tone, recipient, subject, body, brief, engine, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      req.user.id, mode, tone, String(req.body?.recipient || '').slice(0, 80), result.subject || 'Untitled email',
      result.body || '', brief, result.engine || 'local', now
    );
    logActivity(req.user.id, 'email', `Drafted email “${(result.subject || 'Untitled').slice(0, 70)}”`);
    res.status(201).json({
      email: {
        id: Number(info.lastInsertRowid), mode, tone, subject: result.subject, body: result.body,
        tips: result.tips || [], engine: result.engine, degraded: !!result.degraded, warning: result.warning || null,
        createdAt: now
      }
    });
  } catch (err) { next(err); }
});

router.post('/emails/rewrite', async (req, res, next) => {
  try {
    const text = String(req.body?.text || '').slice(0, 6000).trim();
    const tone = EMAIL_TONES.includes(req.body?.tone) ? req.body.tone : 'professional';
    if (text.length < 10) return res.status(400).json({ error: 'Paste the message you would like rewritten (at least 10 characters).' });
    const result = await ai.rewriteTask({ text, tone, recipient: String(req.body?.recipient || ''), senderName: req.user.name });
    res.json({
      result: {
        subject: result.subject, body: result.body, tips: result.tips || [],
        engine: result.engine, degraded: !!result.degraded, warning: result.warning || null
      }
    });
  } catch (err) { next(err); }
});

router.delete('/emails/:id', (req, res) => {
  run('DELETE FROM emails WHERE id = ? AND user_id = ?', Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- documents
const shapeDoc = (r, full = false) => ({
  id: r.id, title: r.title, sourceName: r.source_name, wordCount: r.word_count,
  readingMinutes: r.reading_minutes, summary: r.summary, keyPoints: parse(r.key_points),
  dates: parse(r.dates), figures: parse(r.figures), actions: parse(r.actions),
  engine: r.engine, createdAt: r.created_at,
  ...(full ? { rawText: r.raw_text } : {})
});

router.get('/documents', (req, res) => {
  const rows = all('SELECT * FROM documents WHERE user_id = ? ORDER BY id DESC LIMIT 50', req.user.id);
  res.json({ documents: rows.map((r) => shapeDoc(r)) });
});

router.get('/documents/:id', (req, res) => {
  const row = get('SELECT * FROM documents WHERE id = ? AND user_id = ?', Number(req.params.id), req.user.id);
  if (!row) return res.status(404).json({ error: 'Document not found.' });
  res.json({ document: shapeDoc(row, true) });
});

router.post('/documents', upload.single('file'), async (req, res, next) => {
  try {
    let text = '';
    let title = '';
    let sourceName = '';
    let mime = '';
    let kind = 'text';

    if (req.file) {
      const extracted = await extractText(req.file);
      text = extracted.text;
      kind = extracted.kind;
      sourceName = String(req.file.originalname || 'upload').slice(0, 200);
      mime = req.file.mimetype || '';
      title = String(req.body?.title || '').trim() || sourceName.replace(/\.[^.]+$/, '');
    } else {
      text = String(req.body?.text || '').trim();
      title = String(req.body?.title || '').trim();
      if (text.length < 30) return res.status(400).json({ error: 'Paste at least a few sentences, or upload a PDF/TXT file.' });
      if (!title) title = text.split(/[.\n]/)[0].slice(0, 70) || 'Pasted document';
    }

    if (text.length > 200000) return res.status(413).json({ error: 'That document is too long (200,000 character limit).' });

    const analysis = await ai.documentTask({ text, title });
    const now = new Date().toISOString();
    const info = run(
      `INSERT INTO documents (user_id, title, source_name, mime, word_count, reading_minutes, summary,
        key_points, dates, figures, actions, raw_text, engine, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      req.user.id, String(title).slice(0, 200), sourceName, mime,
      analysis.word_count || T.words(text).length, analysis.reading_minutes || T.readingMinutes(text),
      analysis.summary || '', JSON.stringify(analysis.key_points || []), JSON.stringify(analysis.dates || []),
      JSON.stringify(analysis.figures || []), JSON.stringify(analysis.actions || []),
      text.slice(0, 200000), analysis.engine || 'local', now
    );
    logActivity(req.user.id, 'document', `Summarised ${kind === 'pdf' ? 'PDF' : 'document'} “${String(title).slice(0, 60)}”`);
    const row = get('SELECT * FROM documents WHERE id = ?', Number(info.lastInsertRowid));
    res.status(201).json({
      document: shapeDoc(row, true),
      engine: analysis.engine,
      degraded: !!analysis.degraded
    });
  } catch (err) {
    if (err instanceof UploadError) return res.status(err.status).json({ error: err.message });
    if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'That file is larger than 8 MB.' });
    return next(err);
  }
});

router.delete('/documents/:id', (req, res) => {
  run('DELETE FROM documents WHERE id = ? AND user_id = ?', Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

// ----------------------------------------------------------------- meetings
const shapeMeeting = (r) => ({
  id: r.id, title: r.title, attendees: r.attendees, summary: r.summary,
  decisions: parse(r.decisions), actions: parse(r.actions), engine: r.engine, createdAt: r.created_at
});

router.get('/meetings', (req, res) => {
  const rows = all('SELECT * FROM meetings WHERE user_id = ? ORDER BY id DESC LIMIT 40', req.user.id);
  res.json({ meetings: rows.map(shapeMeeting) });
});

router.post('/meetings', async (req, res, next) => {
  try {
    const text = String(req.body?.text || '').slice(0, 30000).trim();
    const title = String(req.body?.title || '').trim() || 'Team meeting';
    if (text.length < 40) return res.status(400).json({ error: 'Paste at least a few lines of notes or a transcript.' });

    const analysis = await ai.meetingTask({ text, title });
    const now = new Date().toISOString();
    const info = run(
      `INSERT INTO meetings (user_id, title, attendees, summary, decisions, actions, raw_text, engine, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      req.user.id, title.slice(0, 200), String(req.body?.attendees || '').slice(0, 300),
      analysis.summary || '', JSON.stringify(analysis.decisions || []), JSON.stringify(analysis.actions || []),
      text, analysis.engine || 'local', now
    );
    const meetingId = Number(info.lastInsertRowid);

    let createdTasks = [];
    if (req.body?.createTasks !== false && Array.isArray(analysis.actions) && analysis.actions.length) {
      for (const action of analysis.actions.slice(0, 12)) {
        const t = String(action?.title || '').trim();
        if (t.length < 3) continue;
        const tInfo = run(
          `INSERT INTO tasks (user_id, title, notes, priority, status, due_date, source_type, source_id, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          req.user.id, t.slice(0, 200), action.owner ? `Owner: ${action.owner}` : '',
          ['high', 'medium', 'low'].includes(action.priority) ? action.priority : 'medium',
          'pending', /^\d{4}-\d{2}-\d{2}$/.test(String(action.due || '')) ? action.due : null,
          'meeting', meetingId, now
        );
        createdTasks.push({ id: Number(tInfo.lastInsertRowid), title: t, dueDate: action.due || null, priority: action.priority || 'medium' });
      }
      if (createdTasks.length) logActivity(req.user.id, 'task', `Added ${createdTasks.length} action item${createdTasks.length > 1 ? 's' : ''} from “${title.slice(0, 50)}”`);
    }

    logActivity(req.user.id, 'meeting', `Processed meeting “${title.slice(0, 60)}”`);
    res.status(201).json({
      meeting: shapeMeeting(get('SELECT * FROM meetings WHERE id = ?', meetingId)),
      tasks: createdTasks,
      engine: analysis.engine,
      degraded: !!analysis.degraded
    });
  } catch (err) { next(err); }
});

router.delete('/meetings/:id', (req, res) => {
  run('DELETE FROM meetings WHERE id = ? AND user_id = ?', Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ reports
const shapeReport = (r, full = false) => ({
  id: r.id, title: r.title, period: r.period, metrics: parse(r.metrics), engine: r.engine,
  createdAt: r.created_at, ...(full ? { contentMd: r.content_md } : { excerpt: r.content_md.slice(0, 220) })
});

router.get('/reports', (req, res) => {
  const rows = all('SELECT * FROM reports WHERE user_id = ? ORDER BY id DESC LIMIT 40', req.user.id);
  res.json({ reports: rows.map((r) => shapeReport(r)) });
});

router.get('/reports/:id', (req, res) => {
  const row = get('SELECT * FROM reports WHERE id = ? AND user_id = ?', Number(req.params.id), req.user.id);
  if (!row) return res.status(404).json({ error: 'Report not found.' });
  res.json({ report: shapeReport(row, true) });
});

router.post('/reports', async (req, res, next) => {
  try {
    const businessName = String(req.body?.businessName || '').trim().slice(0, 120);
    const period = String(req.body?.period || '').trim().slice(0, 60);
    const currency = ['USD', 'GBP', 'EUR', 'INR', 'AUD', 'CAD'].includes(req.body?.currency) ? req.body.currency : 'USD';
    const notes = String(req.body?.notes || '').slice(0, 6000);
    const metrics = Array.isArray(req.body?.metrics)
      ? req.body.metrics.filter((m) => m && String(m.name || '').trim()).slice(0, 20)
      : [];
    if (!businessName) return res.status(400).json({ error: 'Enter the business or project name.' });
    if (!metrics.length && notes.trim().length < 40) {
      return res.status(400).json({ error: 'Add at least one metric or 40+ characters of context notes.' });
    }

    const result = await ai.reportTask({ businessName, period, currency, metrics, notes, audience: String(req.body?.audience || 'internal management').slice(0, 60) });
    const now = new Date().toISOString();
    const content = result.content_md || result.markdown || '';
    const info = run(
      `INSERT INTO reports (user_id, title, period, metrics, content_md, engine, created_at) VALUES (?,?,?,?,?,?,?)`,
      req.user.id, (result.title || `${businessName} report`).slice(0, 200), period,
      JSON.stringify(result.metrics || metrics), content, result.engine || 'local', now
    );
    logActivity(req.user.id, 'report', `Generated report “${(result.title || businessName).slice(0, 60)}”`);
    res.status(201).json({
      report: shapeReport(get('SELECT * FROM reports WHERE id = ?', Number(info.lastInsertRowid)), true),
      engine: result.engine, degraded: !!result.degraded
    });
  } catch (err) { next(err); }
});

router.delete('/reports/:id', (req, res) => {
  run('DELETE FROM reports WHERE id = ? AND user_id = ?', Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

/** Download a report as Markdown or a print-ready HTML file. */
router.get('/reports/:id/download', (req, res) => {
  const row = get('SELECT * FROM reports WHERE id = ? AND user_id = ?', Number(req.params.id), req.user.id);
  if (!row) return res.status(404).json({ error: 'Report not found.' });
  const safe = row.title.replace(/[^a-z0-9\-_ ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'report';

  if (req.query.format === 'html') {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${safe}.html"`);
    return res.send(renderReportHtml(row));
  }
  res.set('Content-Type', 'text/markdown; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${safe}.md"`);
  return res.send(row.content_md);
});

function mdToHtml(md) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
  const lines = String(md).split('\n');
  const out = [];
  let inTable = false;
  let inList = null;

  const closeList = () => { if (inList) { out.push(`</${inList}>`); inList = null; } };
  for (const line of lines) {
    const t = line.trim();
    if (/^\|/.test(t)) {
      closeList();
      const cells = t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      if (!inTable) { out.push('<table>'); inTable = true; }
      const tag = out[out.length - 1] === '<table>' ? 'th' : 'td';
      out.push(`<tr>${cells.map((c) => `<${tag}>${inline(c)}</${tag}>`).join('')}</tr>`);
      continue;
    }
    if (inTable) { out.push('</table>'); inTable = false; }
    const heading = t.match(/^(#{1,4})\s+(.*)$/);
    if (heading) { closeList(); out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); continue; }
    const ol = t.match(/^(\d+)\.\s+(.*)$/);
    if (ol) {
      if (inList !== 'ol') { closeList(); out.push('<ol>'); inList = 'ol'; }
      out.push(`<li>${inline(ol[2])}</li>`);
      continue;
    }
    const ul = t.match(/^[-*]\s+(.*)$/);
    if (ul) {
      if (inList !== 'ul') { closeList(); out.push('<ul>'); inList = 'ul'; }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }
    closeList();
    if (!t) continue;
    if (/^---+$/.test(t)) { out.push('<hr>'); continue; }
    out.push(`<p>${inline(t.replace(/\s{2}$/, ''))}</p>`);
  }
  closeList();
  if (inTable) out.push('</table>');
  return out.join('\n');
}

function renderReportHtml(row) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${row.title.replace(/[<>]/g, '')}</title>
<style>
:root{--ink:#0f172a;--muted:#5b6b7f;--line:#dbe4f0;--accent:#2563eb;--bg:#f6f9fe}
*{box-sizing:border-box}
body{margin:0;padding:48px 24px;background:var(--bg);font:16px/1.65 "Inter","Segoe UI",system-ui,-apple-system,sans-serif;color:var(--ink)}
main{max-width:820px;margin:0 auto;background:#fff;padding:56px 60px;border-radius:18px;box-shadow:0 24px 60px -30px rgba(15,23,42,.35);border:1px solid var(--line)}
h1{font-size:30px;line-height:1.25;margin:0 0 8px;letter-spacing:-.02em}
h2{font-size:18px;margin:36px 0 10px;padding-bottom:8px;border-bottom:1px solid var(--line);letter-spacing:-.01em}
h3{font-size:16px;margin:24px 0 8px}
p{margin:10px 0;color:#1e293b}
strong{color:#0b1220}
code{background:#eff4fb;padding:2px 6px;border-radius:6px;font-size:13px}
table{width:100%;border-collapse:collapse;margin:18px 0;font-size:14px}
th{background:#eff5ff;text-align:left;font-weight:600;color:#1e3a8a}
th,td{padding:10px 12px;border:1px solid var(--line)}
tr:nth-child(even) td{background:#fafcff}
ol,ul{padding-left:22px;margin:10px 0}
li{margin:7px 0}
hr{border:0;border-top:1px solid var(--line);margin:32px 0}
em{color:var(--muted);font-size:13px}
@media print{body{background:#fff;padding:0}main{box-shadow:none;border:0;padding:0;max-width:none}}
@page{margin:18mm}
</style></head><body><main>${mdToHtml(row.content_md)}</main></body></html>`;
}

module.exports = router;
