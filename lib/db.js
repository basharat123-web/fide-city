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

try {
  db.exec("ALTER TABLE categories ADD COLUMN parent_slug TEXT DEFAULT NULL;");
} catch (_) {}

try {
  db.exec("ALTER TABLE categories ADD COLUMN has_subforums INTEGER DEFAULT 0;");
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

    ins.run('english-server', 'English Server', 'Main server roleplay discussions, player biographies, and server lore.', 10, 0, 0, 'GAME SECTION', '💬');

    ins.run('general', 'Communication', 'Talk about the city, share clips and meet other players.', 20, 0, 0, 'User Communication', '💬');
    ins.run('suggestions', 'Suggestions', 'Pitch features, scripts and rule changes for the city.', 21, 0, 0, 'User Communication', '💬');

    ins.run('staff', 'Staff room', 'Private. Only moderators and admins can see this.', 99, 1, 0, 'STAFF SECTION', '💬');
  });
} else {
  try {
    const existingSlugs = new Set(db.prepare('SELECT slug FROM categories').all().map(c => c.slug));
    const insCat = db.prepare('INSERT INTO categories (slug, name, description, sort_order, staff_only, locked, group_name, icon, parent_slug, has_subforums) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

    if (!existingSlugs.has('faq')) {
      insCat.run('faq', 'Frequently Asked Questions [FAQ]', 'Official guides, frequently asked questions and roleplay basics.', 1, 0, 1, 'FideCity RolePlay', '💬', null, 0);
    }
    if (!existingSlugs.has('rules-cat')) {
      insCat.run('rules-cat', 'Server Rules', 'Official server regulations, state laws and community rules.', 4, 0, 1, 'FideCity RolePlay', '💬', null, 0);
    }
    if (!existingSlugs.has('english-server')) {
      insCat.run('english-server', 'English Server', 'Main server roleplay discussions, player biographies, and server lore.', 10, 0, 0, 'GAME SECTION', '💬', null, 1);
    }
  } catch (_) {}
}

// Ensure sub-forums for English Server and child categories are created
try {
  const subcategoriesToEnsure = [
    // 7 Sub-forums under 'english-server'
    { slug: 'application', name: 'Application', description: 'Staff, leader and assistant applications for Fide City.', sort: 1, parent: 'english-server', has_sub: 1 },
    { slug: 'complaints', name: 'Complaints', description: 'File complaints against players or staff members.', sort: 2, parent: 'english-server', has_sub: 1 },
    { slug: 'state-organizations', name: 'State Organizations', description: 'Government, law enforcement, and medical departments.', sort: 3, parent: 'english-server', has_sub: 1 },
    { slug: 'global-events', name: 'Global Events', description: 'City-wide tournaments, races and server events.', sort: 4, parent: 'english-server', has_sub: 0 },
    { slug: 'weazel-news', name: 'Radio Station "Weazel News"', description: 'Official news reports, interviews and city announcements.', sort: 5, parent: 'english-server', has_sub: 0 },
    { slug: 'ghetto', name: 'Ghetto', description: 'Gangs, territory wars and underworld crime roleplay.', sort: 6, parent: 'english-server', has_sub: 1 },
    { slug: 'roleplay-biographies', name: 'Role Play biographies', description: 'Character biographies, corrupt bios and background lore.', sort: 7, parent: 'english-server', has_sub: 1 },

    // Sub-forums under 'application'
    { slug: 'admin-application', name: 'Admin Application', description: 'Applications for server administration staff.', sort: 1, parent: 'application', has_sub: 0 },
    { slug: 'leader-application', name: 'Leader Application', description: 'Applications for leading organizations and factions.', sort: 2, parent: 'application', has_sub: 0 },
    { slug: 'assistant-application', name: 'Assistant Application', description: 'Applications for server assistants.', sort: 3, parent: 'application', has_sub: 0 },

    // Sub-forums under 'complaints'
    { slug: 'complaints-players', name: 'Complaints about players', description: 'Reports of rule violations committed by players.', sort: 1, parent: 'complaints', has_sub: 0 },
    { slug: 'complaints-staff', name: 'Complaints about staff', description: 'Reports of staff misconduct or incorrect punishment decisions.', sort: 2, parent: 'complaints', has_sub: 0 },

    // Sub-forums under 'state-organizations'
    { slug: 'org-government', name: 'Government', description: 'Executive branch and city hall.', sort: 1, parent: 'state-organizations', has_sub: 0 },
    { slug: 'org-lspd', name: 'LSPD', description: 'Los Santos Police Department.', sort: 2, parent: 'state-organizations', has_sub: 0 },
    { slug: 'org-sahp', name: 'SAHP', description: 'San Andreas Highway Patrol.', sort: 3, parent: 'state-organizations', has_sub: 0 },
    { slug: 'org-ems', name: 'EMS', description: 'Emergency Medical Services.', sort: 4, parent: 'state-organizations', has_sub: 0 },
    { slug: 'org-lifeinvader', name: 'Lifeinvader', description: 'Media, journalism and public broadcast network.', sort: 5, parent: 'state-organizations', has_sub: 0 },

    // Sub-forums under 'ghetto'
    { slug: 'ghetto-bloods', name: 'Bloods Street Gang', description: 'Bloods gang discussions.', sort: 1, parent: 'ghetto', has_sub: 0 },
    { slug: 'ghetto-marabunta', name: 'Marabunta Grande', description: 'Marabunta gang discussions.', sort: 2, parent: 'ghetto', has_sub: 0 },
    { slug: 'ghetto-vagos', name: 'Los Santos Vagos', description: 'Vagos gang discussions.', sort: 3, parent: 'ghetto', has_sub: 0 },
    { slug: 'ghetto-families', name: 'The Families', description: 'Families gang discussions.', sort: 4, parent: 'ghetto', has_sub: 0 },
    { slug: 'ghetto-ballas', name: 'East Side Ballas', description: 'Ballas gang discussions.', sort: 5, parent: 'ghetto', has_sub: 0 },

    // Sub-forums under 'roleplay-biographies'
    { slug: 'bio-character', name: 'Character Biography', description: 'General character biographies.', sort: 1, parent: 'roleplay-biographies', has_sub: 0 },
    { slug: 'bio-corrupt', name: 'Corrupt Bio', description: 'Corrupt state organization biographies.', sort: 2, parent: 'roleplay-biographies', has_sub: 0 },
  ];

  const upsertSub = db.prepare(`
    INSERT INTO categories (slug, name, description, sort_order, staff_only, locked, group_name, icon, parent_slug, has_subforums)
    VALUES (?, ?, ?, ?, 0, 0, 'GAME SECTION', '💬', ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      sort_order = excluded.sort_order,
      parent_slug = excluded.parent_slug,
      has_subforums = excluded.has_subforums
  `);

  for (const s of subcategoriesToEnsure) {
    upsertSub.run(s.slug, s.name, s.description, s.sort, s.parent, s.has_sub);
  }

  // Ensure top-level categories have parent_slug = NULL and proper groups
  db.exec(`
    UPDATE categories SET group_name = 'FideCity RolePlay', sort_order = 1, parent_slug = NULL WHERE slug = 'faq';
    UPDATE categories SET group_name = 'FideCity RolePlay', name = 'Technical Section', sort_order = 2, parent_slug = NULL WHERE slug = 'support';
    UPDATE categories SET group_name = 'FideCity RolePlay', sort_order = 4, parent_slug = NULL WHERE slug = 'rules-cat';
    UPDATE categories SET group_name = 'FideCity RolePlay', sort_order = 5, parent_slug = NULL WHERE slug = 'announcements';

    UPDATE categories SET group_name = 'GAME SECTION', sort_order = 10, parent_slug = NULL, has_subforums = 1 WHERE slug = 'english-server';

    UPDATE categories SET group_name = 'User Communication', name = 'Communication', sort_order = 20, parent_slug = NULL WHERE slug = 'general';
    UPDATE categories SET group_name = 'User Communication', sort_order = 21, parent_slug = NULL WHERE slug = 'suggestions';

    UPDATE categories SET group_name = 'STAFF SECTION', sort_order = 99, parent_slug = NULL WHERE slug = 'staff';
    DELETE FROM categories WHERE slug IN ('new-players', 'reports', 'organizations');
  `);

  // Ensure seed users Rafay Royal and Marshmello Pluxury exist
  const insSeedUser = db.prepare(`
    INSERT INTO users (username, email, password_hash, role, staff_title, created_at, avatar)
    VALUES (?, ?, 'scrypt$dummyseedhash', 'admin', ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      avatar = excluded.avatar,
      staff_title = excluded.staff_title
  `);
  insSeedUser.run(
    'Rafay Royal',
    'rafay.royal@fidecity.local',
    'Senior Administrator',
    Date.now() - 7 * 86400000,
    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&h=120&q=80'
  );
  insSeedUser.run(
    'Marshmello Pluxury',
    'marshmello.pluxury@fidecity.local',
    'Administrator',
    Date.now() - 14 * 86400000,
    'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=120&h=120&q=80'
  );

  const rafay = db.prepare("SELECT id FROM users WHERE username = 'Rafay Royal'").get();
  const marshmello = db.prepare("SELECT id FROM users WHERE username = 'Marshmello Pluxury'").get();
  const appCat = db.prepare("SELECT id FROM categories WHERE slug = 'application'").get();
  const compCat = db.prepare("SELECT id FROM categories WHERE slug = 'complaints'").get();
  const bioCat = db.prepare("SELECT id FROM categories WHERE slug = 'roleplay-biographies'").get();

  if (appCat && rafay) {
    const existing = db.prepare("SELECT COUNT(*) AS n FROM threads WHERE category_id = ?").get(appCat.id).n;
    if (existing === 0) {
      const now = Date.now() - 3600000 * 3;
      const t1 = db.prepare("INSERT INTO threads (category_id, user_id, title, status, reply_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(appCat.id, rafay.id, 'Admin Application | Faiz Rehman', 'Approved', 17, now - 86400000, now);
      db.prepare("INSERT INTO posts (thread_id, user_id, body, created_at) VALUES (?, ?, ?, ?)")
        .run(t1.lastInsertRowid, rafay.id, 'Congratulations! Your admin application has been reviewed and approved. Welcome to the team.', now);

      for (let i = 1; i <= 7; i++) {
        const dummyT = db.prepare("INSERT INTO threads (category_id, user_id, title, status, reply_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(appCat.id, rafay.id, `Leader Application | Organization Team #${i}`, 'Reviewed', 0, now - (i * 86400000), now - (i * 86400000));
        db.prepare("INSERT INTO posts (thread_id, user_id, body, created_at) VALUES (?, ?, ?, ?)")
          .run(dummyT.lastInsertRowid, rafay.id, 'Application submitted for review.', now - (i * 86400000));
      }
    }
  }

  if (compCat && marshmello) {
    const existing = db.prepare("SELECT COUNT(*) AS n FROM threads WHERE category_id = ?").get(compCat.id).n;
    if (existing === 0) {
      const tTime = Date.now() - 86400000 * 2;
      const t2 = db.prepare("INSERT INTO threads (category_id, user_id, title, status, reply_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(compCat.id, marshmello.id, 'Rules for filling a complaint against players', 'IMPORTANT', 0, tTime - 3600000, tTime);
      db.prepare("INSERT INTO posts (thread_id, user_id, body, created_at) VALUES (?, ?, ?, ?)")
        .run(t2.lastInsertRowid, marshmello.id, 'Please read all rules carefully before submitting a complaint against any player.', tTime);

      const t2b = db.prepare("INSERT INTO threads (category_id, user_id, title, status, reply_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(compCat.id, marshmello.id, 'Player Complaint Guidelines & Format', 'Reviewed', 0, tTime - 86400000, tTime - 86400000);
      db.prepare("INSERT INTO posts (thread_id, user_id, body, created_at) VALUES (?, ?, ?, ?)")
        .run(t2b.lastInsertRowid, marshmello.id, 'Follow the standardized format when submitting evidence.', tTime - 86400000);
    }
  }

  if (bioCat && rafay) {
    const existing = db.prepare("SELECT COUNT(*) AS n FROM threads WHERE category_id = ?").get(bioCat.id).n;
    if (existing === 0) {
      const bTime = Date.now() - 3600000 * 2;
      const t3 = db.prepare("INSERT INTO threads (category_id, user_id, title, status, reply_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(bioCat.id, rafay.id, 'Personal Biography | Nathan Miller', 'IMPORTANT', 0, bTime - 3600000, bTime);
      db.prepare("INSERT INTO posts (thread_id, user_id, body, created_at) VALUES (?, ?, ?, ?)")
        .run(t3.lastInsertRowid, rafay.id, 'Nathan Miller is a dedicated paramedic in Los Santos with an extensive background in emergency medicine.', bTime);

      for (let j = 1; j <= 2; j++) {
        const dummyBio = db.prepare("INSERT INTO threads (category_id, user_id, title, status, reply_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(bioCat.id, rafay.id, `Character Story | Citizen Archive #${j}`, 'Approved', 0, bTime - (j * 86400000), bTime - (j * 86400000));
        db.prepare("INSERT INTO posts (thread_id, user_id, body, created_at) VALUES (?, ?, ?, ?)")
          .run(dummyBio.lastInsertRowid, rafay.id, 'Approved character biography record.', bTime - (j * 86400000));
      }
    }
  }
} catch (_) {}

// Housekeeping: drop expired sessions every 15 minutes.
setInterval(() => {
  try {
    db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  } catch (_) {
    /* ignore */
  }
}, 15 * 60 * 1000).unref();

module.exports = { db, tx, audit };
