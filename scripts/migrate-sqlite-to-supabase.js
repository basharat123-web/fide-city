'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createClient } = require('@supabase/supabase-js');
const config = require('../lib/config');

const args = new Set(process.argv.slice(2));
const sqliteArg = process.argv.find((arg) => arg.startsWith('--sqlite='));
const dbPath = sqliteArg ? path.resolve(sqliteArg.slice('--sqlite='.length)) : config.dbPath;
const dryRun = !args.has('--apply');
const includeDemoData = args.has('--include-demo-data');
const demoUsers = new Set([
  'rafay.royal@fidecity.local',
  'marshmello.pluxury@fidecity.local',
]);
const demoThreadTitles = [
  /^Admin Application \| Faiz Rehman$/i,
  /^Leader Application \| Organization Team #\d+$/i,
  /^Rules for filling a complaint against players$/i,
  /^Player Complaint Guidelines & Format$/i,
  /^Personal Biography \| Nathan Miller$/i,
  /^Character Story \| Citizen Archive #\d+$/i,
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function batches(rows, size = 200) {
  const result = [];
  for (let i = 0; i < rows.length; i += size) result.push(rows.slice(i, i + size));
  return result;
}

function key(table, id) {
  return `sqlite:${table}:${id}`;
}

function isDemoThread(thread) {
  return demoThreadTitles.some((pattern) => pattern.test(thread.title || ''));
}

function safeRole(role) {
  return ['member', 'mod', 'admin', 'root_admin'].includes(role) ? role : 'member';
}

function rowsFrom(db, table) {
  return db.prepare(`SELECT * FROM "${table}"`).all();
}

async function insertInBatches(client, table, rows, options = {}) {
  for (const batch of batches(rows)) {
    const { error } = await client.from(table).upsert(batch, {
      onConflict: options.onConflict || 'migration_key',
      ignoreDuplicates: true,
    });
    if (error) throw new Error(`[migrate ${table}] ${error.message}`);
  }
}

async function fetchAll(client, table, columns) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from(table).select(columns).range(offset, offset + 999);
    if (error) throw new Error(`[read Supabase ${table}] ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

async function migrate() {
  assert(fs.existsSync(dbPath), `SQLite database not found: ${dbPath}`);
  const sqlite = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const local = {
      users: rowsFrom(sqlite, 'users'),
      categories: rowsFrom(sqlite, 'categories'),
      threads: rowsFrom(sqlite, 'threads'),
      posts: rowsFrom(sqlite, 'posts'),
      stories: rowsFrom(sqlite, 'stories'),
      sessions: rowsFrom(sqlite, 'sessions'),
      audit_log: rowsFrom(sqlite, 'audit_log'),
      warnings: rowsFrom(sqlite, 'warnings'),
      password_resets: rowsFrom(sqlite, 'password_resets'),
    };

    const users = local.users.filter((user) => includeDemoData || !demoUsers.has(String(user.email).toLowerCase()));
    const categories = local.categories;
    const demoThreadIds = new Set(
      includeDemoData ? [] : local.threads.filter(isDemoThread).map((thread) => Number(thread.id)),
    );
    const threads = local.threads.filter((thread) => !demoThreadIds.has(Number(thread.id)));
    const posts = local.posts.filter((post) => !demoThreadIds.has(Number(post.thread_id)));
    const stories = local.stories;
    const sessions = local.sessions.filter((session) => Number(session.expires) > Date.now());
    const warnings = local.warnings;
    const auditLog = local.audit_log;
    const activeResets = local.password_resets.filter(
      (reset) => Number(reset.used) === 0 && Number(reset.expires_at) > Date.now(),
    );
    const counts = {
      users: users.length,
      categories: categories.length,
      threads: threads.length,
      posts: posts.length,
      stories: stories.length,
      sessions: sessions.length,
      warnings: warnings.length,
      audit_log: auditLog.length,
      password_resets: activeResets.length,
      skippedDemoUsers: local.users.length - users.length,
      skippedDemoThreads: demoThreadIds.size,
      skippedExpiredSessions: local.sessions.length - sessions.length,
      skippedInactivePasswordResets: local.password_resets.length - activeResets.length,
    };
    console.log(`${dryRun ? 'Dry run' : 'Migration'} source: ${dbPath}`);
    console.table(counts);
    if (dryRun) {
      console.log('No data was written. Review the counts, then rerun with --apply after applying supabase/schema.sql.');
      return;
    }

    assert(config.supabase.url, 'SUPABASE_URL is required for --apply.');
    assert(
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
      'SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) is required for --apply.',
    );
    const client = createClient(config.supabase.url, config.supabase.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    await insertInBatches(client, 'categories', categories.map((category) => ({
      slug: category.slug,
      name: category.name,
      description: category.description || '',
      sort_order: category.sort_order || 0,
      staff_only: category.staff_only || 0,
      locked: category.locked || 0,
      group_name: category.group_name || 'FideCity RolePlay',
      icon: category.icon || '💬',
      parent_slug: category.parent_slug || null,
      has_subforums: category.has_subforums || 0,
    })), { onConflict: 'slug' });
    const remoteCategories = await fetchAll(client, 'categories', 'id,slug');
    const categoryIds = new Map(remoteCategories.map((row) => [row.slug, row.id]));

    const remoteUsers = await fetchAll(
      client,
      'users',
      'id,username,email,role,staff_title,additional_title,avatar,created_at,last_login,failed_logins,locked_until,banned,ban_reason,migration_key',
    );
    const usersByKey = new Map(remoteUsers.filter((row) => row.migration_key)
      .map((row) => [row.migration_key, row]));
    const usersByUsername = new Map(remoteUsers.map((row) => [String(row.username).toLowerCase(), row]));
    const usersByEmail = new Map(remoteUsers.map((row) => [String(row.email).toLowerCase(), row]));
    const userIds = new Map();
    const skipped = {
      threads: 0,
      posts: 0,
      stories: 0,
      warnings: 0,
      password_resets: 0,
      sessions: 0,
      invalidSessions: 0,
    };

    for (const user of users) {
      const sourceKey = key('users', user.id);
      let target = usersByKey.get(sourceKey);
      const byUsername = usersByUsername.get(String(user.username).toLowerCase());
      const byEmail = usersByEmail.get(String(user.email).toLowerCase());
      assert(!byUsername || !byEmail || String(byUsername.id) === String(byEmail.id),
        `Local user ${user.id} conflicts with different Supabase username/email records; no account was changed.`);
      target = target || byUsername || byEmail;
      if (!target) {
        const { data, error } = await client.from('users').insert({
          username: user.username,
          email: user.email,
          password_hash: user.password_hash,
          role: safeRole(user.role),
          staff_title: user.staff_title || 'EN | Player',
          additional_title: user.additional_title || 'EN | Player',
          avatar: user.avatar || null,
          created_at: user.created_at,
          last_login: user.last_login || null,
          failed_logins: user.failed_logins || 0,
          locked_until: user.locked_until || 0,
          banned: user.banned || 0,
          ban_reason: user.ban_reason || null,
          migration_key: sourceKey,
        }).select('id,username,email,role,staff_title,additional_title,avatar,created_at,last_login,failed_logins,locked_until,banned,ban_reason,migration_key').single();
        if (error) throw new Error(`[migrate user ${user.id}] ${error.message}`);
        target = data;
        usersByUsername.set(String(data.username).toLowerCase(), data);
        usersByEmail.set(String(data.email).toLowerCase(), data);
        usersByKey.set(sourceKey, data);
      }
      userIds.set(Number(user.id), target.id);
    }

    const remoteThreads = await fetchAll(client, 'threads', 'id,migration_key');
    const threadIds = new Map(remoteThreads.filter((row) => row.migration_key)
      .map((row) => [row.migration_key, row.id]));
    const threadRows = [];
    for (const thread of threads) {
      const categoryId = categoryIds.get(local.categories.find((category) => Number(category.id) === Number(thread.category_id))?.slug);
      const userId = userIds.get(Number(thread.user_id));
      if (!categoryId || !userId) {
        skipped.threads++;
        continue;
      }
      threadRows.push({
        category_id: categoryId,
        user_id: userId,
        title: thread.title,
        pinned: thread.pinned || 0,
        locked: thread.locked || 0,
        deleted: thread.deleted || 0,
        reply_count: thread.reply_count || 0,
        status: thread.status || null,
        created_at: thread.created_at,
        updated_at: thread.updated_at,
        migration_key: key('threads', thread.id),
      });
    }
    await insertInBatches(client, 'threads', threadRows);
    const allThreadRows = await fetchAll(client, 'threads', 'id,migration_key');
    for (const row of allThreadRows) {
      if (row.migration_key) threadIds.set(row.migration_key, row.id);
    }

    await insertInBatches(client, 'posts', posts.flatMap((post) => {
      const threadId = threadIds.get(key('threads', post.thread_id));
      const userId = userIds.get(Number(post.user_id));
      if (!threadId || !userId) {
        skipped.posts++;
        return [];
      }
      return [{
        thread_id: threadId,
        user_id: userId,
        body: post.body,
        deleted: post.deleted || 0,
        created_at: post.created_at,
        migration_key: key('posts', post.id),
      }];
    }));

    const existingStories = new Set((await fetchAll(client, 'stories', 'id,slug')).map((story) => story.slug));
    await insertInBatches(client, 'stories', stories.flatMap((story) => {
      const authorId = userIds.get(Number(story.author_id));
      if (existingStories.has(story.slug)) return [];
      if (!authorId) {
        skipped.stories++;
        return [];
      }
      return [{
        slug: story.slug,
        title: story.title,
        summary: story.summary,
        body: story.body,
        author_id: authorId,
        published: story.published ?? 1,
        created_at: story.created_at,
        migration_key: key('stories', story.id),
      }];
    }));

    await insertInBatches(client, 'warnings', warnings.flatMap((warning) => {
      const userId = userIds.get(Number(warning.user_id));
      const issuerId = userIds.get(Number(warning.issuer_id));
      if (!userId || !issuerId) {
        skipped.warnings++;
        return [];
      }
      return [{
        user_id: userId,
        issuer_id: issuerId,
        reason: warning.reason,
        created_at: warning.created_at,
        migration_key: key('warnings', warning.id),
      }];
    }));

    await insertInBatches(client, 'audit_log', auditLog.map((entry) => ({
      user_id: userIds.get(Number(entry.user_id)) || null,
      action: entry.action,
      detail: entry.detail || '',
      ip: entry.ip || '',
      created_at: entry.created_at,
      migration_key: key('audit_log', entry.id),
    })));

    await insertInBatches(client, 'password_resets', activeResets.flatMap((reset) => {
      const userId = userIds.get(Number(reset.user_id));
      if (!userId) {
        skipped.password_resets++;
        return [];
      }
      return [{
        user_id: userId,
        otp: reset.otp,
        expires_at: reset.expires_at,
        used: reset.used || 0,
        created_at: reset.created_at,
        migration_key: key('password_resets', reset.id),
      }];
    }));

    const sessionRows = sessions.flatMap((session) => {
      let data;
      try {
        data = JSON.parse(session.data);
      } catch {
        skipped.invalidSessions++;
        return [];
      }
      const localUserId = Number(data?.userId);
      const mappedUserId = userIds.get(localUserId);
      if (!mappedUserId) {
        skipped.sessions++;
        return [];
      }
      data.userId = mappedUserId;
      return [{
        sid: session.sid,
        data: JSON.stringify(data),
        expires: session.expires,
        user_id: mappedUserId,
      }];
    });
    for (const batch of batches(sessionRows)) {
      const { error } = await client.from('sessions').upsert(batch, {
        onConflict: 'sid',
        ignoreDuplicates: true,
      });
      if (error) throw new Error(`[migrate sessions] ${error.message}`);
    }

    console.log('Migration completed. Existing Supabase records were left unchanged; rerunning is safe.');
    if (Object.values(skipped).some(Boolean)) {
      console.warn('Rows not imported because their source references could not be mapped or session data was invalid:');
      console.table(skipped);
    }
  } finally {
    sqlite.close();
  }
}

migrate().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
