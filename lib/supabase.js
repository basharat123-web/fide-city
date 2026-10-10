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
    const isRootEmail = u.email && u.email.toLowerCase().trim() === config.rootAdminEmail;
    let role = u.role || 'member';
    let staffTitle = u.staff_title || 'EN | Player';

    if (!isRootEmail) {
      if (role === 'root_admin') role = 'admin';
      if (staffTitle === 'Project Management' || staffTitle === 'Curator Of Project' || staffTitle === 'Root Admin') {
        staffTitle = 'Chief Administrator';
      }
    } else {
      role = 'root_admin';
      staffTitle = 'Project Management';
    }

    const payload = {
      id: u.id,
      username: u.username,
      email: u.email,
      password_hash: u.password_hash,
      role: role,
      staff_title: staffTitle,
      avatar: u.avatar || null,
      created_at: Number(u.created_at) || Date.now(),
      last_login: u.last_login ? Number(u.last_login) : null,
      failed_logins: Number(u.failed_logins) || 0,
      locked_until: Number(u.locked_until) || 0,
      banned: u.banned ? 1 : 0,
      ban_reason: u.ban_reason || null,
    };

    let { error } = await supabase.from('users').upsert(payload, { onConflict: 'username' });
    if (error && error.message && error.message.includes('avatar')) {
      delete payload.avatar;
      const retry = await supabase.from('users').upsert(payload, { onConflict: 'username' });
      error = retry.error;
    }

    if (error) {
      console.error('[supabase saveUser error]:', error.message);
    } else {
      console.log(`[supabase] User "${u.username}" saved to Supabase.`);
    }
  } catch (err) {
    console.error('[supabase saveUser exception]:', err.message);
  }
}

/** Save a user record from Supabase directly into local SQLite */
function saveUserLocal(u) {
  if (!u) return;
  try {
    const isRootEmail = u.email && u.email.toLowerCase().trim() === config.rootAdminEmail;
    let finalRole = isRootEmail ? 'root_admin' : (u.role === 'root_admin' ? 'admin' : (u.role || 'member'));
    let finalTitle = u.staff_title || 'EN | Player';

    if (!isRootEmail) {
      if (finalTitle === 'Project Management' || finalTitle === 'Curator Of Project' || finalTitle === 'Root Admin') {
        finalTitle = 'Chief Administrator';
        finalRole = 'admin';
      }
    } else {
      finalRole = 'root_admin';
      finalTitle = 'Project Management';
    }

    const upsertSql = db.prepare(`
      INSERT INTO users (id, username, email, password_hash, role, staff_title, avatar, created_at, last_login, failed_logins, locked_until, banned, ban_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        id = excluded.id,
        role = excluded.role,
        staff_title = excluded.staff_title,
        avatar = CASE WHEN excluded.avatar IS NOT NULL AND excluded.avatar != '' THEN excluded.avatar ELSE users.avatar END,
        password_hash = excluded.password_hash,
        last_login = excluded.last_login,
        banned = excluded.banned,
        ban_reason = excluded.ban_reason
    `);

    upsertSql.run(
      u.id,
      u.username,
      u.email,
      u.password_hash,
      finalRole,
      finalTitle,
      u.avatar || null,
      Number(u.created_at) || Date.now(),
      u.last_login ? Number(u.last_login) : null,
      Number(u.failed_logins) || 0,
      Number(u.locked_until) || 0,
      u.banned ? 1 : 0,
      u.ban_reason || null
    );
  } catch (e) {
    console.error('[supabase saveUserLocal error]', e.message);
  }
}

/** Fetch user from Supabase by numeric ID */
async function getUserByIdFromSupabase(id) {
  if (!supabase || !id) return null;
  try {
    const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
    if (error) {
      console.error('[supabase getUserById error]:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[supabase getUserById exception]:', err.message);
    return null;
  }
}

/** Fetch user from Supabase by username or email */
async function getUserByEmailOrUsername(ident) {
  if (!supabase || !ident) return null;
  try {
    const clean = String(ident).trim();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .or(`username.ilike.${clean},email.ilike.${clean}`)
      .maybeSingle();
    if (error) {
      console.error('[supabase getUserByEmailOrUsername error]:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[supabase getUserByEmailOrUsername exception]:', err.message);
    return null;
  }
}

/** Update user role & staff title in Supabase */
async function updateUserRole(idOrUsername, role, staffTitle, email) {
  if (!supabase || !idOrUsername) return;
  try {
    const isTargetRootEmail = email && email.toLowerCase().trim() === config.rootAdminEmail;
    let finalRole = role;
    let finalTitle = staffTitle;

    if (!isTargetRootEmail) {
      if (finalRole === 'root_admin') finalRole = 'admin';
      if (finalTitle === 'Project Management' || finalTitle === 'Curator Of Project' || finalTitle === 'Root Admin') {
        finalTitle = 'Chief Administrator';
      }
    } else {
      finalRole = 'root_admin';
      finalTitle = 'Project Management';
    }

    const updates = {
      role: finalRole,
      staff_title: finalTitle || 'EN | Player',
    };

    let query = supabase.from('users').update(updates);
    if (typeof idOrUsername === 'number' || (typeof idOrUsername === 'string' && /^\d+$/.test(idOrUsername))) {
      query = query.eq('id', Number(idOrUsername));
    } else {
      query = query.ilike('username', String(idOrUsername));
    }

    const { error } = await query;
    if (error) console.error('[supabase updateUserRole error]:', error.message);
    else console.log(`[supabase] Updated role for ${idOrUsername} to ${finalRole} (${finalTitle})`);
  } catch (err) {
    console.error('[supabase updateUserRole exception]:', err.message);
  }
}

/** Update user avatar in Supabase */
async function updateUserAvatar(userId, avatar) {
  if (!supabase || !userId) return;
  try {
    let query = supabase.from('users').update({ avatar: avatar || null });
    if (typeof userId === 'number' || (typeof userId === 'string' && /^\d+$/.test(userId))) {
      query = query.eq('id', Number(userId));
    } else {
      query = query.ilike('username', String(userId));
    }
    const { error } = await query;
    if (error) console.error('[supabase updateUserAvatar error]:', error.message);
    else console.log(`[supabase] Avatar updated for user ${userId}`);
  } catch (err) {
    console.error('[supabase updateUserAvatar exception]:', err.message);
  }
}

/** Update user password hash in Supabase */
async function updateUserPassword(userId, passwordHash) {
  if (!supabase || !userId || !passwordHash) return;
  try {
    let query = supabase.from('users').update({
      password_hash: passwordHash,
      failed_logins: 0,
      locked_until: 0,
    });
    if (typeof userId === 'number' || (typeof userId === 'string' && /^\d+$/.test(userId))) {
      query = query.eq('id', Number(userId));
    } else {
      query = query.ilike('username', String(userId));
    }
    const { error } = await query;
    if (error) console.error('[supabase updateUserPassword error]:', error.message);
    else console.log(`[supabase] Password updated for user ${userId}`);
  } catch (err) {
    console.error('[supabase updateUserPassword exception]:', err.message);
  }
}

/** Update user ban status in Supabase */
async function updateUserBan(username, banned, banReason) {
  if (!supabase || !username) return;
  try {
    const { error } = await supabase.from('users').update({
      banned: banned ? 1 : 0,
      ban_reason: banReason || null,
    }).ilike('username', username);
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
      for (const u of users) {
        try {
          const isRootEmail = u.email && u.email.toLowerCase().trim() === config.rootAdminEmail;
          let finalRole = isRootEmail ? 'root_admin' : (u.role === 'root_admin' ? 'admin' : (u.role || 'member'));
          let finalTitle = u.staff_title || 'EN | Player';

          if (!isRootEmail) {
            if (finalTitle === 'Project Management' || finalTitle === 'Curator Of Project' || finalTitle === 'Root Admin') {
              finalTitle = 'Chief Administrator';
              finalRole = 'admin';
              // Asynchronously clean up stale record in Supabase cloud
              supabase.from('users').update({ role: 'admin', staff_title: 'Chief Administrator' }).eq('id', u.id).then(() => {}).catch(() => {});
            }
          } else {
            finalRole = 'root_admin';
            finalTitle = 'Project Management';
          }

          u.role = finalRole;
          u.staff_title = finalTitle;
          saveUserLocal(u);
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

/* ====================================================================
   SESSION PERSISTENCE (Survives Vercel Serverless Rotations & Cold Starts)
   ==================================================================== */

async function saveSessionToSupabase(sid, dataStr, expires) {
  if (!supabase || !sid) return;
  try {
    const { error } = await supabase.from('sessions').upsert({
      sid,
      data: dataStr,
      expires: Number(expires),
    }, { onConflict: 'sid' });
    if (error) console.error('[supabase saveSession error]:', error.message);
  } catch (err) {
    console.error('[supabase saveSession exception]:', err.message);
  }
}

async function getSessionFromSupabase(sid) {
  if (!supabase || !sid) return null;
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('sid, data, expires')
      .eq('sid', sid)
      .gt('expires', Date.now())
      .maybeSingle();
    if (error) {
      console.error('[supabase getSession error]:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[supabase getSession exception]:', err.message);
    return null;
  }
}

async function deleteSessionFromSupabase(sid) {
  if (!supabase || !sid) return;
  try {
    await supabase.from('sessions').delete().eq('sid', sid);
  } catch (_) {}
}

async function deleteSessionsForUserFromSupabase(userId) {
  if (!supabase || !userId) return;
  try {
    // Look up sessions containing the userId string
    await supabase.from('sessions').delete().like('data', `%"userId":${userId}%`);
  } catch (_) {}
}

/* ====================================================================
   PASSWORD RESET (OTP)
   ==================================================================== */

async function savePasswordResetOtp(userId, otp, expiresAt) {
  if (!supabase || !userId) return;
  try {
    await supabase.from('password_resets').insert({
      user_id: userId,
      otp: String(otp),
      expires_at: Number(expiresAt),
      used: 0,
      created_at: Date.now(),
    });
  } catch (err) {
    console.error('[supabase savePasswordResetOtp error]:', err.message);
  }
}

module.exports = {
  supabase,
  saveUser,
  saveUserLocal,
  getUserByIdFromSupabase,
  getUserByEmailOrUsername,
  updateUserRole,
  updateUserAvatar,
  updateUserPassword,
  updateUserBan,
  syncFromSupabase,
  syncLocalToSupabase,
  saveSessionToSupabase,
  getSessionFromSupabase,
  deleteSessionFromSupabase,
  deleteSessionsForUserFromSupabase,
  savePasswordResetOtp,
};
