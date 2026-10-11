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
  additional_title TEXT DEFAULT 'EN | Player',
  avatar        TEXT,
  created_at    BIGINT NOT NULL,
  last_login    BIGINT,
  failed_logins INT NOT NULL DEFAULT 0,
  locked_until  BIGINT NOT NULL DEFAULT 0,
  banned        INT NOT NULL DEFAULT 0,
  ban_reason    TEXT
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS additional_title TEXT DEFAULT 'EN | Player';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
UPDATE users SET additional_title = 'EN | Player' WHERE additional_title IS NULL OR additional_title = '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS migration_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_migration_key ON users(migration_key) WHERE migration_key IS NOT NULL;

-- Note: Run on existing DB:
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS additional_title TEXT DEFAULT 'EN | Player';
-- ALTER TABLE users ALTER COLUMN staff_title SET DEFAULT 'EN | Player';
-- UPDATE users SET staff_title = 'EN | Player' WHERE staff_title IS NULL;
-- UPDATE users SET role = 'admin', staff_title = 'Chief Administrator' WHERE ((staff_title = 'Project Management' AND role != 'admin') OR staff_title IN ('Creator of Project', 'Curator Of Project', 'Root Admin') OR role = 'root_admin') AND LOWER(email) != 'basharathussain.mail@gmail.com';

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

-- Run on existing DBs to upgrade categories created by older schema versions:
ALTER TABLE categories ADD COLUMN IF NOT EXISTS group_name TEXT DEFAULT 'FideCity RolePlay';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '💬';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_slug TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS has_subforums INT NOT NULL DEFAULT 0;

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
ALTER TABLE threads ADD COLUMN IF NOT EXISTS migration_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_threads_migration_key ON threads(migration_key) WHERE migration_key IS NOT NULL;

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

ALTER TABLE posts ADD COLUMN IF NOT EXISTS migration_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_migration_key ON posts(migration_key) WHERE migration_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_thread ON posts(thread_id, id);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, id);

-- Public-only forum counts, including visible descendants, in one cached read.
CREATE OR REPLACE FUNCTION forum_category_counts(category_slugs TEXT[])
RETURNS TABLE(slug TEXT, thread_count BIGINT, post_count BIGINT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE category_tree(root_id, category_slug, path) AS (
    SELECT id, slug, ARRAY[slug]::TEXT[]
    FROM categories
    WHERE slug = ANY(category_slugs) AND staff_only = 0
    UNION ALL
    SELECT tree.root_id, child.slug, tree.path || child.slug
    FROM category_tree AS tree
    JOIN categories AS child ON child.parent_slug = tree.category_slug
    WHERE child.staff_only = 0 AND NOT child.slug = ANY(tree.path)
  )
  SELECT root.slug,
         COUNT(DISTINCT thread.id) FILTER (WHERE thread.id IS NOT NULL),
         COUNT(post.id) FILTER (WHERE post.id IS NOT NULL)
  FROM categories AS root
  LEFT JOIN category_tree AS tree ON tree.root_id = root.id
  LEFT JOIN categories AS visible_category ON visible_category.slug = tree.category_slug
  LEFT JOIN threads AS thread
    ON thread.category_id = visible_category.id AND thread.deleted = 0
  LEFT JOIN posts AS post
    ON post.thread_id = thread.id AND post.deleted = 0
  WHERE root.slug = ANY(category_slugs) AND root.staff_only = 0
  GROUP BY root.slug;
$$;

REVOKE ALL ON FUNCTION forum_category_counts(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION forum_category_counts(TEXT[]) TO anon, authenticated;

CREATE OR REPLACE FUNCTION create_forum_thread(
  p_category_id BIGINT,
  p_user_id BIGINT,
  p_title TEXT,
  p_body TEXT,
  p_created_at BIGINT
)
RETURNS BIGINT
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_thread_id BIGINT;
  target_category categories%ROWTYPE;
  posting_user users%ROWTYPE;
BEGIN
  SELECT * INTO target_category FROM categories WHERE id = p_category_id;
  SELECT * INTO posting_user FROM users WHERE id = p_user_id;
  IF target_category.id IS NULL OR posting_user.id IS NULL OR posting_user.banned <> 0 THEN
    RAISE EXCEPTION 'Category or user is unavailable';
  END IF;
  IF target_category.staff_only <> 0 THEN
    RAISE EXCEPTION 'Category is not public';
  END IF;
  IF target_category.locked <> 0 AND posting_user.role NOT IN ('mod', 'admin', 'root_admin') THEN
    RAISE EXCEPTION 'Only staff can start threads in this category';
  END IF;

  INSERT INTO threads (category_id, user_id, title, created_at, updated_at)
  VALUES (p_category_id, p_user_id, p_title, p_created_at, p_created_at)
  RETURNING id INTO new_thread_id;
  INSERT INTO posts (thread_id, user_id, body, created_at)
  VALUES (new_thread_id, p_user_id, p_body, p_created_at);
  RETURN new_thread_id;
END;
$$;

CREATE OR REPLACE FUNCTION create_forum_reply(
  p_thread_id BIGINT,
  p_user_id BIGINT,
  p_body TEXT,
  p_created_at BIGINT
)
RETURNS BIGINT
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_thread threads%ROWTYPE;
  posting_user users%ROWTYPE;
  target_category categories%ROWTYPE;
  new_post_id BIGINT;
BEGIN
  SELECT * INTO target_thread FROM threads WHERE id = p_thread_id FOR UPDATE;
  SELECT * INTO posting_user FROM users WHERE id = p_user_id;
  SELECT * INTO target_category FROM categories WHERE id = target_thread.category_id;
  IF target_thread.id IS NULL OR target_thread.deleted <> 0 OR target_thread.locked <> 0
     OR posting_user.id IS NULL OR posting_user.banned <> 0 OR target_category.id IS NULL THEN
    RAISE EXCEPTION 'Thread or user is unavailable';
  END IF;
  IF target_category.staff_only <> 0 AND posting_user.role NOT IN ('mod', 'admin', 'root_admin') THEN
    RAISE EXCEPTION 'Thread is not available';
  END IF;

  INSERT INTO posts (thread_id, user_id, body, created_at)
  VALUES (p_thread_id, p_user_id, p_body, p_created_at)
  RETURNING id INTO new_post_id;
  UPDATE threads
  SET reply_count = reply_count + 1, updated_at = p_created_at
  WHERE id = p_thread_id;
  RETURN new_post_id;
END;
$$;

REVOKE ALL ON FUNCTION create_forum_thread(BIGINT, BIGINT, TEXT, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION create_forum_reply(BIGINT, BIGINT, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_forum_thread(BIGINT, BIGINT, TEXT, TEXT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION create_forum_reply(BIGINT, BIGINT, TEXT, BIGINT) TO service_role;

CREATE OR REPLACE FUNCTION update_forum_post(
  p_post_id BIGINT,
  p_title TEXT,
  p_body TEXT,
  p_user_id BIGINT,
  p_updated_at BIGINT
)
RETURNS BIGINT
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_post posts%ROWTYPE;
  target_thread threads%ROWTYPE;
  first_post_id BIGINT;
BEGIN
  SELECT * INTO target_post FROM posts WHERE id = p_post_id AND deleted = 0 FOR UPDATE;
  IF target_post.id IS NULL THEN
    RAISE EXCEPTION 'Post is unavailable';
  END IF;
  SELECT * INTO target_thread FROM threads WHERE id = target_post.thread_id AND deleted = 0 FOR UPDATE;
  IF target_thread.id IS NULL THEN
    RAISE EXCEPTION 'Thread is unavailable';
  END IF;
  SELECT MIN(id) INTO first_post_id FROM posts WHERE thread_id = target_thread.id AND deleted = 0;

  UPDATE posts SET body = p_body WHERE id = target_post.id;
  IF target_post.id = first_post_id AND p_title IS NOT NULL THEN
    UPDATE threads SET title = p_title, updated_at = p_updated_at WHERE id = target_thread.id;
  ELSE
    UPDATE threads SET updated_at = p_updated_at WHERE id = target_thread.id;
  END IF;
  INSERT INTO audit_log (user_id, action, detail, ip, created_at)
  VALUES (p_user_id, 'forum_post_edit', 'post ' || target_post.id || ' in thread ' || target_thread.id, '', p_updated_at);
  RETURN target_thread.id;
END;
$$;

REVOKE ALL ON FUNCTION update_forum_post(BIGINT, TEXT, TEXT, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION update_forum_post(BIGINT, TEXT, TEXT, BIGINT, BIGINT) TO service_role;

CREATE OR REPLACE FUNCTION delete_forum_reply(
  p_post_id BIGINT,
  p_updated_at BIGINT
)
RETURNS BIGINT
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_post posts%ROWTYPE;
  target_thread threads%ROWTYPE;
  first_post_id BIGINT;
  remaining_posts BIGINT;
BEGIN
  SELECT * INTO target_post FROM posts WHERE id = p_post_id AND deleted = 0 FOR UPDATE;
  IF target_post.id IS NULL THEN
    RAISE EXCEPTION 'Post is unavailable';
  END IF;
  SELECT * INTO target_thread FROM threads WHERE id = target_post.thread_id AND deleted = 0 FOR UPDATE;
  IF target_thread.id IS NULL THEN
    RAISE EXCEPTION 'Thread is unavailable';
  END IF;
  SELECT MIN(id) INTO first_post_id FROM posts WHERE thread_id = target_thread.id AND deleted = 0;
  IF first_post_id = target_post.id THEN
    RAISE EXCEPTION 'The first post cannot be deleted as a reply';
  END IF;

  UPDATE posts SET deleted = 1 WHERE id = target_post.id;
  SELECT COUNT(*) INTO remaining_posts FROM posts WHERE thread_id = target_thread.id AND deleted = 0;
  UPDATE threads
  SET reply_count = GREATEST(0, remaining_posts - 1), updated_at = p_updated_at
  WHERE id = target_thread.id;
  RETURN target_thread.id;
END;
$$;

REVOKE ALL ON FUNCTION delete_forum_reply(BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_forum_reply(BIGINT, BIGINT) TO service_role;

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

ALTER TABLE stories ADD COLUMN IF NOT EXISTS migration_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_stories_migration_key ON stories(migration_key) WHERE migration_key IS NOT NULL;

-- 6. Sessions
CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  data    TEXT NOT NULL,
  expires BIGINT NOT NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- 7. Audit log (Security event logging)
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL
);

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS migration_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_migration_key ON audit_log(migration_key) WHERE migration_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at DESC);

-- 8. Password resets (OTP verification)
CREATE TABLE IF NOT EXISTS password_resets (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp        TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  used       INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  migration_key TEXT UNIQUE
);

ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS migration_key TEXT;
CREATE INDEX IF NOT EXISTS idx_pw_reset_user ON password_resets(user_id, used, expires_at);

CREATE TABLE IF NOT EXISTS warnings (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issuer_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason     TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  migration_key TEXT UNIQUE
);
ALTER TABLE warnings ADD COLUMN IF NOT EXISTS migration_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_warnings_migration_key ON warnings(migration_key) WHERE migration_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warnings_user ON warnings(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION delete_user_sessions(p_user_id BIGINT)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM sessions
  WHERE user_id = p_user_id
     OR (data::jsonb ->> 'userId') = p_user_id::TEXT;
$$;

CREATE OR REPLACE FUNCTION reset_password_with_otp(
  p_user_id BIGINT,
  p_otp TEXT,
  p_password_hash TEXT,
  p_now BIGINT
)
RETURNS BIGINT
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reset_id BIGINT;
BEGIN
  SELECT id INTO reset_id
  FROM password_resets
  WHERE user_id = p_user_id
    AND otp = p_otp
    AND used = 0
    AND expires_at > p_now
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF reset_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE password_resets SET used = 1 WHERE id = reset_id;
  UPDATE users
  SET password_hash = p_password_hash, failed_logins = 0, locked_until = 0
  WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account is unavailable';
  END IF;
  RETURN p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION delete_user_sessions(BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reset_password_with_otp(BIGINT, TEXT, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_user_sessions(BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION reset_password_with_otp(BIGINT, TEXT, TEXT, BIGINT) TO service_role;

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
