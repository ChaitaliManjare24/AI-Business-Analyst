'use strict';
const express = require('express');
const { all, get } = require('../db');
const ai = require('../ai');

const router = express.Router();

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

router.get('/', (req, res) => {
  const uid = req.user.id;
  const tasks = all('SELECT * FROM tasks WHERE user_id = ?', uid);
  const today = todayIso();
  const counts = {
    total: tasks.length,
    pending: tasks.filter((t) => t.status !== 'completed').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    overdue: tasks.filter((t) => t.status !== 'completed' && t.due_date && t.due_date < today).length,
    dueToday: tasks.filter((t) => t.status !== 'completed' && t.due_date === today).length,
    highPriority: tasks.filter((t) => t.status !== 'completed' && t.priority === 'high').length
  };

  const totals = (table) => get(`SELECT COUNT(*) AS c FROM ${table} WHERE user_id = ?`, uid).c;

  const series = [];
  for (let i = 13; i >= 0; i -= 1) {
    const day = addDays(-i);
    const created = tasks.filter((t) => (t.created_at || '').slice(0, 10) === day).length;
    const completed = tasks.filter((t) => (t.completed_at || '').slice(0, 10) === day).length;
    const docs = get(
      `SELECT
        (SELECT COUNT(*) FROM documents WHERE user_id = ? AND substr(created_at,1,10) = ?) +
        (SELECT COUNT(*) FROM meetings  WHERE user_id = ? AND substr(created_at,1,10) = ?) +
        (SELECT COUNT(*) FROM reports   WHERE user_id = ? AND substr(created_at,1,10) = ?) +
        (SELECT COUNT(*) FROM emails    WHERE user_id = ? AND substr(created_at,1,10) = ?) AS c`,
      uid, day, uid, day, uid, day, uid, day
    ).c;
    series.push({ day, created, completed, outputs: docs });
  }

  const upcoming = tasks
    .filter((t) => t.status !== 'completed' && t.due_date && t.due_date >= today && t.due_date <= addDays(7))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 6)
    .map((t) => ({ id: t.id, title: t.title, dueDate: t.due_date, priority: t.priority }));

  const activity = all('SELECT * FROM activity WHERE user_id = ? ORDER BY id DESC LIMIT 8', uid)
    .map((a) => ({ id: a.id, type: a.type, message: a.message, createdAt: a.created_at }));

  const completionRate = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0;
  const last7 = series.slice(7);
  const throughput = last7.reduce((s, d) => s + d.completed, 0);
  const outputs7 = last7.reduce((s, d) => s + d.outputs, 0);

  res.json({
    tasks: counts,
    completionRate,
    throughput,
    outputs7,
    library: {
      documents: totals('documents'),
      meetings: totals('meetings'),
      reports: totals('reports'),
      emails: totals('emails')
    },
    series,
    upcoming,
    activity,
    ai: ai.status()
  });
});

module.exports = router;
