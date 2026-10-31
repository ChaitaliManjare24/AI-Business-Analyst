'use strict';
const express = require('express');
const { get, run, all, logActivity } = require('../db');

const router = express.Router();
const PRIORITIES = ['high', 'medium', 'low'];
const STATUSES = ['pending', 'in_progress', 'completed'];

const shape = (row) => row && ({
  id: row.id,
  title: row.title,
  notes: row.notes || '',
  priority: row.priority,
  status: row.status,
  dueDate: row.due_date,
  sourceType: row.source_type,
  sourceId: row.source_id,
  createdAt: row.created_at,
  completedAt: row.completed_at
});

router.get('/', (req, res) => {
  const { status, priority, q } = req.query;
  let sql = 'SELECT * FROM tasks WHERE user_id = ?';
  const params = [req.user.id];
  if (status && STATUSES.includes(status)) { sql += ' AND status = ?'; params.push(status); }
  if (priority && PRIORITIES.includes(priority)) { sql += ' AND priority = ?'; params.push(priority); }
  if (q) { sql += ' AND (title LIKE ? OR notes LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ` ORDER BY CASE status WHEN 'completed' THEN 1 ELSE 0 END,
           CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
           CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC, id DESC`;
  res.json({ tasks: all(sql, ...params).map(shape) });
});

function validate(body, { partial = false } = {}) {
  const out = {};
  if (body.title !== undefined || !partial) {
    const title = String(body.title || '').trim();
    if (title.length < 2) return { error: 'Task title must be at least 2 characters.' };
    if (title.length > 200) return { error: 'Task title is too long (max 200 characters).' };
    out.title = title;
  }
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority)) return { error: 'Priority must be high, medium or low.' };
    out.priority = body.priority;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return { error: 'Invalid status.' };
    out.status = body.status;
  }
  if (body.dueDate !== undefined) {
    const raw = body.dueDate;
    if (raw === null || raw === '') out.due_date = null;
    else {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return { error: 'Due date is not a valid date.' };
      out.due_date = d.toISOString().slice(0, 10);
    }
  }
  if (body.notes !== undefined) out.notes = String(body.notes).slice(0, 2000);
  return { data: out };
}

router.post('/', (req, res) => {
  const { error, data } = validate(req.body || {});
  if (error) return res.status(400).json({ error });
  const now = new Date().toISOString();
  const info = run(
    `INSERT INTO tasks (user_id, title, notes, priority, status, due_date, source_type, source_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    req.user.id, data.title, data.notes || '', data.priority || 'medium', data.status || 'pending',
    data.due_date || null, String(req.body?.sourceType || 'manual').slice(0, 20), req.body?.sourceId || null, now
  );
  logActivity(req.user.id, 'task', `Created task “${data.title}”`);
  return res.status(201).json({ task: shape(get('SELECT * FROM tasks WHERE id = ?', Number(info.lastInsertRowid))) });
});

router.patch('/:id', (req, res) => {
  const existing = get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', Number(req.params.id), req.user.id);
  if (!existing) return res.status(404).json({ error: 'Task not found.' });
  const { error, data } = validate(req.body || {}, { partial: true });
  if (error) return res.status(400).json({ error });

  const fields = Object.entries(data);
  if (!fields.length) return res.json({ task: shape(existing) });
  const completedAt = data.status === 'completed' ? new Date().toISOString()
    : data.status && data.status !== 'completed' ? null : existing.completed_at;

  run(
    `UPDATE tasks SET ${fields.map(([k]) => `${k} = ?`).join(', ')}, completed_at = ? WHERE id = ? AND user_id = ?`,
    ...fields.map(([, v]) => v), completedAt, existing.id, req.user.id
  );
  if (data.status === 'completed' && existing.status !== 'completed') {
    logActivity(req.user.id, 'task', `Completed task “${existing.title}”`);
  }
  return res.json({ task: shape(get('SELECT * FROM tasks WHERE id = ?', existing.id)) });
});

router.post('/:id/toggle', (req, res) => {
  const existing = get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', Number(req.params.id), req.user.id);
  if (!existing) return res.status(404).json({ error: 'Task not found.' });
  const next = existing.status === 'completed' ? 'pending' : 'completed';
  run('UPDATE tasks SET status = ?, completed_at = ? WHERE id = ? AND user_id = ?',
    next, next === 'completed' ? new Date().toISOString() : null, existing.id, req.user.id);
  if (next === 'completed') logActivity(req.user.id, 'task', `Completed task “${existing.title}”`);
  res.json({ task: shape(get('SELECT * FROM tasks WHERE id = ?', existing.id)) });
});

router.delete('/:id', (req, res) => {
  const existing = get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', Number(req.params.id), req.user.id);
  if (!existing) return res.status(404).json({ error: 'Task not found.' });
  run('DELETE FROM tasks WHERE id = ? AND user_id = ?', existing.id, req.user.id);
  res.json({ ok: true });
});

router.post('/bulk', (req, res) => {
  const items = Array.isArray(req.body?.tasks) ? req.body.tasks.slice(0, 25) : [];
  if (!items.length) return res.status(400).json({ error: 'No tasks supplied.' });
  const now = new Date().toISOString();
  const created = [];
  for (const item of items) {
    const title = String(item?.title || '').trim();
    if (title.length < 2) continue;
    const info = run(
      `INSERT INTO tasks (user_id, title, notes, priority, status, due_date, source_type, source_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      req.user.id, title.slice(0, 200), String(item.notes || '').slice(0, 1000),
      PRIORITIES.includes(item.priority) ? item.priority : 'medium', 'pending',
      item.due ? String(item.due).slice(0, 10) : null,
      String(req.body?.sourceType || 'meeting').slice(0, 20), req.body?.sourceId || null, now
    );
    created.push(shape(get('SELECT * FROM tasks WHERE id = ?', Number(info.lastInsertRowid))));
  }
  if (created.length) logActivity(req.user.id, 'task', `Added ${created.length} task${created.length > 1 ? 's' : ''} from notes`);
  res.status(201).json({ tasks: created });
});

module.exports = router;
