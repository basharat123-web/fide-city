'use strict';
const { createClient } = require('@supabase/supabase-js');
const config = require('./config');
const { db } = require('./db');

let supabase = null;

if (config.supabase && config.supabase.enabled) {
  try {
    supabase = createClient(config.supabase.url, config.supabase.key, {
      auth: { persistSession: false },
    });
    console.log('[supabase] Client initialized with URL:', config.supabase.url);
  } catch (err) {
    console.error('[supabase] Initialization error:', err.message);
  }
}

/** Save or update a single user record in Supabase */
async function saveUser(u) {
  if (!supabase || !u) return;
  try {
    const { error } = await supabase.from('users').upsert({
      id: u.id,
      username: u.username,
      email: u.email,
      password_hash: u.password_hash,
      role: u.role || 'member',
      staff_title: u.staff_title || 'EN | Player',
      created_at: Number(u.created_at) || Date.now(),
      last_login: u.last_login ? Number(u.last_login) : null,
      failed_logins: Number(u.failed_logins) || 0,
      locked_until: Number(u.locked_until) || 0,
      banned: u.banned ? 1 : 0,
      ban_reason: u.ban_reason || null,
    }, { onConflict: 'username' });

    if (error) {
      console.error('[supabase saveUser error]:', error.message);
    } else {
      console.log(`[supabase] User "${u.username}" saved to Supabase.`);
    }
  } catch (err) {
    console.error('[supabase saveUser exception]:', err.message);
  }
}

/** Update user role & staff title in Supabase */
async function updateUserRole(username, role, staffTitle) {
  if (!supabase || !username) return;
  try {
    const { error } = await supabase.from('users').update({
      role: role,
      staff_title: staffTitle || 'EN | Player',
    }).eq('username', username);
    if (error) console.error('[supabase updateUserRole error]:', error.message);
    else console.log(`[supabase] Updated role for ${username} to ${role} (${staffTitle || 'EN | Player'})`);
  } catch (err) {
    console.error('[supabase updateUserRole exception]:', err.message);
  }
}

/** Update user ban status in Supabase */
async function updateUserBan(username, banned, banReason) {
  if (!supabase || !username) return;
  try {
    const { error } = await supabase.from('users').update({
      banned: banned ? 1 : 0,
      ban_reason: banReason || null,
    }).eq('username', username);
    if (error) console.error('[supabase updateUserBan error]:', error.message);
  } catch (err) {
    console.error('[supabase updateUserBan exception]:', err.message);
  }
}

/** Sync all users from Supabase down into local SQLite cache */
async function syncFromSupabase() {
  if (!supabase) return;
  try {
    const { data: users, error } = await supabase.from('users').select('*');
    if (error) {
      console.error('[supabase syncFromSupabase error]:', error.message);
      return;
    }
    if (Array.isArray(users) && users.length > 0) {
      const upsertSql = db.prepare(`
        INSERT INTO users (id, username, email, password_hash, role, staff_title, created_at, last_login, failed_logins, locked_until, banned, ban_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(username) DO UPDATE SET
          role = excluded.role,
          staff_title = excluded.staff_title,
          password_hash = excluded.password_hash,
          last_login = excluded.last_login,
          banned = excluded.banned,
          ban_reason = excluded.ban_reason
      `);
      for (const u of users) {
        try {
          const isRootEmail = u.email && u.email.toLowerCase().trim() === config.rootAdminEmail;
          const finalRole = isRootEmail ? 'root_admin' : (u.role === 'root_admin' ? 'admin' : (u.role || 'member'));
          const finalTitle = isRootEmail ? 'Project Management' : (u.staff_title || 'EN | Player');

          upsertSql.run(
            u.id,
            u.username,
            u.email,
            u.password_hash,
            finalRole,
            finalTitle,
            Number(u.created_at) || Date.now(),
            u.last_login ? Number(u.last_login) : null,
            Number(u.failed_logins) || 0,
            Number(u.locked_until) || 0,
            u.banned ? 1 : 0,
            u.ban_reason || null
          );
        } catch (e) {
          console.error('[supabase local upsert error]', e.message);
        }
      }
      console.log(`[supabase] Synced ${users.length} users from Supabase to local DB.`);
    }
  } catch (err) {
    console.error('[supabase syncFromSupabase exception]:', err.message);
  }
}

/** Sync any local SQLite users up to Supabase */
async function syncLocalToSupabase() {
  if (!supabase) return;
  try {
    const localUsers = db.prepare('SELECT * FROM users').all();
    if (Array.isArray(localUsers) && localUsers.length > 0) {
      for (const u of localUsers) {
        await saveUser(u);
      }
    }
  } catch (err) {
    console.error('[supabase syncLocalToSupabase exception]:', err.message);
  }
}

module.exports = {
  supabase,
  saveUser,
  updateUserRole,
  updateUserBan,
  syncFromSupabase,
  syncLocalToSupabase,
};
