'use strict';
// SQLite via Node's built-in node:sqlite (no npm packages, nothing to compile).
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');
db.exec('PRAGMA synchronous = NORMAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','mod','admin','root_admin')),
  staff_title   TEXT DEFAULT 'EN | Player',
  created_at    INTEGER NOT NULL,
  last_login    INTEGER,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until  INTEGER NOT NULL DEFAULT 0,
  banned        INTEGER NOT NULL DEFAULT 0,
  ban_reason    TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  staff_only  INTEGER NOT NULL DEFAULT 0,  -- hidden from everyone except staff
  locked      INTEGER NOT NULL DEFAULT 0   -- only staff can start threads
);

CREATE TABLE IF NOT EXISTS threads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  pinned      INTEGER NOT NULL DEFAULT 0,
  locked      INTEGER NOT NULL DEFAULT 0,
  deleted     INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_threads_cat ON threads(category_id, deleted, pinned DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id  INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_thread ON posts(thread_id, id);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, id);

CREATE TABLE IF NOT EXISTS stories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL,
  summary    TEXT NOT NULL,
  body       TEXT NOT NULL,
  author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  published  INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  data    TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  action     TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS password_resets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp        TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pw_reset_user ON password_resets(user_id, used, expires_at);
`);

try {
  db.exec('ALTER TABLE users ADD COLUMN avatar TEXT;');
} catch (_) {}

try {
  db.exec('ALTER TABLE threads ADD COLUMN status TEXT DEFAULT NULL;');
} catch (_) {}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS warnings (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      issuer_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason     TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_warnings_user ON warnings(user_id, created_at DESC);
  `);
} catch (_) {}

try {
  db.exec("UPDATE users SET staff_title = 'EN | Player' WHERE staff_title IS NULL OR staff_title = '';");
} catch (_) {}

try {
  // Ensure non-root users (like Daniyal) who previously had Project Management or Curator titles get clamped to Chief Administrator
  db.prepare(`
    UPDATE users 
    SET role = 'admin', staff_title = 'Chief Administrator' 
    WHERE (staff_title = 'Project Management' OR staff_title = 'Curator Of Project' OR role = 'root_admin') 
      AND LOWER(email) != ?
  `).run(config.rootAdminEmail);
} catch (_) {}

try {
  db.exec("ALTER TABLE categories ADD COLUMN group_name TEXT DEFAULT 'FideCity RolePlay';");
} catch (_) {}

try {
  db.exec("ALTER TABLE categories ADD COLUMN icon TEXT DEFAULT '💬';");
} catch (_) {}

/** Run fn inside a transaction (nested calls become savepoints). Returns fn's result. */
let depth = 0;
function tx(fn) {
  const name = `sp_${depth}`;
  db.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${name}`);
  depth++;
  try {
    const result = fn();
    depth--;
    db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${name}`);
    return result;
  } catch (err) {
    depth--;
    try {
      db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`);
    } catch (_) {
      /* connection already rolled back */
    }
    throw err;
  }
}

/** Record a security-relevant event. Never throws: logging must not break a request. */
const insAudit = db.prepare('INSERT INTO audit_log (user_id, action, detail, ip, created_at) VALUES (?, ?, ?, ?, ?)');
function audit(userId, action, detail, ip) {
  try {
    insAudit.run(userId || null, String(action).slice(0, 64), String(detail || '').slice(0, 500), String(ip || '').slice(0, 64), Date.now());
  } catch (err) {
    console.error('[audit] failed to write', err.message);
  }
}

/* First run: forum categories. Edit these in the database or here before first launch. */
if (db.prepare('SELECT COUNT(*) AS n FROM categories').get().n === 0) {
  const ins = db.prepare('INSERT INTO categories (slug, name, description, sort_order, staff_only, locked, group_name, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  tx(() => {
    ins.run('faq', 'Frequently Asked Questions [FAQ]', 'Official guides, frequently asked questions and roleplay basics.', 1, 0, 1, 'FideCity RolePlay', '💬');
    ins.run('support', 'Technical Section', 'Technical problems, game launcher bugs and connection troubleshooting.', 2, 0, 0, 'FideCity RolePlay', '💬');
    ins.run('rules-cat', 'Server Rules', 'Official server regulations, state laws and community rules.', 4, 0, 1, 'FideCity RolePlay', '💬');
    ins.run('announcements', 'Announcements', 'Official news, updates and server changes from the team.', 5, 0, 1, 'FideCity RolePlay', '💬');
    ins.run('new-players', 'New players', 'Questions about getting started, characters and how roleplay works.', 6, 0, 0, 'FideCity RolePlay', '💬');

    ins.run('english-server', 'English Server', 'Main server roleplay discussions, player biographies, and server lore.', 10, 0, 0, 'GAME SECTION', '💬');
    ins.run('reports', 'Player reports', 'Report rule-breaking with a clip or screenshot. Keep it factual.', 11, 0, 0, 'GAME SECTION', '💬');
    ins.run('organizations', 'Organizations and jobs', 'Hiring posts, applications and department news.', 12, 0, 0, 'GAME SECTION', '💬');

    ins.run('general', 'Communication', 'Talk about the city, share clips and meet other players.', 20, 0, 0, 'User Communication', '💬');
    ins.run('suggestions', 'Suggestions', 'Pitch features, scripts and rule changes for the city.', 21, 0, 0, 'User Communication', '💬');

    ins.run('staff', 'Staff room', 'Private. Only moderators and admins can see this.', 99, 1, 0, 'STAFF SECTION', '💬');
  });
} else {
  try {
    const existingSlugs = new Set(db.prepare('SELECT slug FROM categories').all().map(c => c.slug));
    const insCat = db.prepare('INSERT INTO categories (slug, name, description, sort_order, staff_only, locked, group_name, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

    if (!existingSlugs.has('faq')) {
      insCat.run('faq', 'Frequently Asked Questions [FAQ]', 'Official guides, frequently asked questions and roleplay basics.', 1, 0, 1, 'FideCity RolePlay', '💬');
    }
    if (!existingSlugs.has('rules-cat')) {
      insCat.run('rules-cat', 'Server Rules', 'Official server regulations, state laws and community rules.', 4, 0, 1, 'FideCity RolePlay', '💬');
    }
    if (!existingSlugs.has('english-server')) {
      insCat.run('english-server', 'English Server', 'Main server roleplay discussions, player biographies, and server lore.', 10, 0, 0, 'GAME SECTION', '💬');
    }

    db.exec(`
      UPDATE categories SET group_name = 'FideCity RolePlay', sort_order = 1 WHERE slug = 'faq';
      UPDATE categories SET group_name = 'FideCity RolePlay', name = 'Technical Section', sort_order = 2 WHERE slug = 'support';
      UPDATE categories SET group_name = 'FideCity RolePlay', sort_order = 4 WHERE slug = 'rules-cat';
      UPDATE categories SET group_name = 'FideCity RolePlay', sort_order = 5 WHERE slug = 'announcements';
      UPDATE categories SET group_name = 'FideCity RolePlay', sort_order = 6 WHERE slug = 'new-players';

      UPDATE categories SET group_name = 'GAME SECTION', sort_order = 10 WHERE slug = 'english-server';
      UPDATE categories SET group_name = 'GAME SECTION', sort_order = 11 WHERE slug = 'reports';
      UPDATE categories SET group_name = 'GAME SECTION', sort_order = 12 WHERE slug = 'organizations';

      UPDATE categories SET group_name = 'User Communication', name = 'Communication', sort_order = 20 WHERE slug = 'general';
      UPDATE categories SET group_name = 'User Communication', sort_order = 21 WHERE slug = 'suggestions';

      UPDATE categories SET group_name = 'STAFF SECTION', sort_order = 99 WHERE slug = 'staff';
    `);
  } catch (_) {}
}

// Housekeeping: drop expired sessions every 15 minutes.
setInterval(() => {
  try {
    db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  } catch (_) {
    /* ignore */
  }
}, 15 * 60 * 1000).unref();

module.exports = { db, tx, audit };
