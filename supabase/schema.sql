-- ====================================================================
-- Fide City Roleplay - Complete Supabase PostgreSQL Schema
-- ====================================================================
-- Copy and paste this script directly into your Supabase SQL Editor:
-- Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ====================================================================

-- 1. Users table (Supports: root_admin, admin, mod, member)
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'mod', 'admin', 'root_admin')),
  staff_title   TEXT DEFAULT 'EN | Player',
  avatar        TEXT,
  created_at    BIGINT NOT NULL,
  last_login    BIGINT,
  failed_logins INT NOT NULL DEFAULT 0,
  locked_until  BIGINT NOT NULL DEFAULT 0,
  banned        INT NOT NULL DEFAULT 0,
  ban_reason    TEXT
);

-- Note: Run on existing DB:
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
-- ALTER TABLE users ALTER COLUMN staff_title SET DEFAULT 'EN | Player';
-- UPDATE users SET staff_title = 'EN | Player' WHERE staff_title IS NULL;
-- UPDATE users SET role = 'admin', staff_title = 'Chief Administrator' WHERE (staff_title = 'Project Management' OR staff_title = 'Curator Of Project' OR role = 'root_admin') AND LOWER(email) != 'basharathussain.mail@gmail.com';

CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- 2. Forum categories
CREATE TABLE IF NOT EXISTS categories (
  id          BIGSERIAL PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order  INT NOT NULL DEFAULT 0,
  staff_only  INT NOT NULL DEFAULT 0,  -- 1 = only staff (mod/admin/root_admin) can see
  locked      INT NOT NULL DEFAULT 0,  -- 1 = only staff can start threads
  group_name  TEXT DEFAULT 'FideCity RolePlay',
  icon        TEXT DEFAULT '💬',
  parent_slug TEXT DEFAULT NULL,
  has_subforums INT NOT NULL DEFAULT 0
);

-- 3. Forum threads
CREATE TABLE IF NOT EXISTS threads (
  id          BIGSERIAL PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  pinned      INT NOT NULL DEFAULT 0,
  locked      INT NOT NULL DEFAULT 0,
  deleted     INT NOT NULL DEFAULT 0,
  reply_count INT NOT NULL DEFAULT 0,
  status      TEXT,
  created_at  BIGINT NOT NULL,
  updated_at  BIGINT NOT NULL
);

-- Run on existing DBs so forum status/publish labels can be stored:
ALTER TABLE threads ADD COLUMN IF NOT EXISTS status TEXT;

CREATE INDEX IF NOT EXISTS idx_threads_cat ON threads(category_id, deleted, pinned DESC, updated_at DESC);

-- 4. Forum posts / replies
CREATE TABLE IF NOT EXISTS posts (
  id         BIGSERIAL PRIMARY KEY,
  thread_id  BIGINT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  deleted    INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_thread ON posts(thread_id, id);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, id);

-- 5. News & stories
CREATE TABLE IF NOT EXISTS stories (
  id         BIGSERIAL PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL,
  summary    TEXT NOT NULL,
  body       TEXT NOT NULL,
  author_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  published  INT NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL
);

-- 6. Sessions
CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  data    TEXT NOT NULL,
  expires BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);

-- 7. Audit log (Security event logging)
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at DESC);

-- 8. Password resets (OTP verification)
CREATE TABLE IF NOT EXISTS password_resets (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp        TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  used       INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pw_reset_user ON password_resets(user_id, used, expires_at);

-- ====================================================================
-- Default Forum Categories
-- ====================================================================
INSERT INTO categories (slug, name, description, sort_order, staff_only, locked)
VALUES
  ('announcements', 'Announcements', 'Official news, updates and server changes from the team.', 1, 0, 1),
  ('general', 'General discussion', 'Talk about the city, share clips and meet other players.', 2, 0, 0),
  ('support', 'Technical support', 'Crashes, connection problems and bugs. Say what you already tried.', 4, 0, 0),
  ('suggestions', 'Suggestions', 'Pitch features, scripts and rule changes for the city.', 7, 0, 0),
  ('staff', 'Staff room', 'Private. Only moderators, admins and root admin can see this.', 99, 1, 0)
ON CONFLICT (slug) DO NOTHING;

DELETE FROM categories WHERE slug IN ('new-players', 'reports', 'organizations');

-- ====================================================================
-- Helper query to promote any account to ROOT ADMIN:
-- (Aap registration ke baad apna username neeche likh kar chala sakte hain)
-- UPDATE users SET role = 'root_admin', staff_title = 'Server Founder & Root Admin' WHERE username = 'apna_username';
-- ====================================================================
