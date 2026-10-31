'use strict';
/**
 * SQLite persistence layer built on node:sqlite (bundled with Node 22+).
 * No native modules, no external database server — the whole app is portable.
 */
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'bizassist.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  company TEXT DEFAULT '',
  role TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  due_date TEXT,
  source_type TEXT DEFAULT 'manual',
  source_id INTEGER,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_name TEXT DEFAULT '',
  mime TEXT DEFAULT '',
  word_count INTEGER DEFAULT 0,
  reading_minutes REAL DEFAULT 0,
  summary TEXT DEFAULT '',
  key_points TEXT DEFAULT '[]',
  dates TEXT DEFAULT '[]',
  figures TEXT DEFAULT '[]',
  actions TEXT DEFAULT '[]',
  raw_text TEXT DEFAULT '',
  engine TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  tone TEXT NOT NULL,
  recipient TEXT DEFAULT '',
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  brief TEXT DEFAULT '',
  engine TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  attendees TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  decisions TEXT DEFAULT '[]',
  actions TEXT DEFAULT '[]',
  raw_text TEXT DEFAULT '',
  engine TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  period TEXT DEFAULT '',
  metrics TEXT DEFAULT '[]',
  content_md TEXT NOT NULL,
  engine TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id, created_at);
`);

/** Small helpers so route code stays readable. */
const all = (sql, ...params) => db.prepare(sql).all(...params);
const get = (sql, ...params) => db.prepare(sql).get(...params);
const run = (sql, ...params) => db.prepare(sql).run(...params);

function logActivity(userId, type, message) {
  run(
    'INSERT INTO activity (user_id, type, message, created_at) VALUES (?,?,?,?)',
    userId, type, message, new Date().toISOString()
  );
}

module.exports = { db, all, get, run, logActivity, DATA_DIR };
