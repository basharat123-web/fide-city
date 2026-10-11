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
    const wasRootRole = role === 'root_admin';
    let staffTitle = u.staff_title || 'EN | Player';
    const additionalTitle = u.additional_title || 'EN | Player';

    if (!isRootEmail) {
      if (role === 'root_admin') role = 'admin';
      if ((staffTitle === 'Project Management' && (role !== 'admin' || wasRootRole)) || staffTitle === 'Creator of Project' || staffTitle === 'Curator Of Project' || staffTitle === 'Root Admin') {
        staffTitle = 'Chief Administrator';
      }
    } else {
      role = 'root_admin';
      staffTitle = staffTitle || 'Project Management';
    }

    const payload = {
      id: u.id,
      username: u.username,
      email: u.email,
      password_hash: u.password_hash,
      role: role,
      staff_title: staffTitle,
      additional_title: additionalTitle,
      avatar: u.avatar || null,
      created_at: Number(u.created_at) || Date.now(),
      last_login: u.last_login ? Number(u.last_login) : null,
      failed_logins: Number(u.failed_logins) || 0,
      locked_until: Number(u.locked_until) || 0,
      banned: u.banned ? 1 : 0,
      ban_reason: u.ban_reason || null,
    };

    let { error } = await supabase.from('users').upsert(payload, { onConflict: 'username' });
    if (error) {
      // Keep older Supabase schemas usable while reporting that the new fields need migration.
      if (error.message && (error.message.includes('avatar') || error.message.includes('additional_title') || error.message.includes('column'))) {
        const retryPayload = { ...payload };
        if (error.message.includes('avatar') || error.message.includes('column')) delete retryPayload.avatar;
        if (error.message.includes('additional_title') || error.message.includes('column')) delete retryPayload.additional_title;
        const retry = await supabase.from('users').upsert(retryPayload, { onConflict: 'username' });
        if (retry.error) {
          console.error('[supabase saveUser error (no-avatar retry)]:', retry.error.message);
          return;
        }
        // Now try updating the avatar column separately
        if (u.avatar && !Object.hasOwn(retryPayload, 'avatar')) {
          const avatarResult = await supabase.from('users').update({ avatar: u.avatar }).eq('id', u.id);
          if (avatarResult.error) {
            console.error('[supabase saveUser avatar column missing – run migration]:', avatarResult.error.message);
          }
        }
        if (!Object.hasOwn(retryPayload, 'additional_title')) {
          console.error('[supabase saveUser] Additional role was not saved; apply supabase/schema.sql to add users.additional_title.');
        }
        return;
      }
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
    // Never import fake seed users
    if (u.email && (u.email === 'rafay.royal@fidecity.local' || u.email === 'marshmello.pluxury@fidecity.local')) return;

    const isRootEmail = u.email && u.email.toLowerCase().trim() === config.rootAdminEmail;
    let finalRole = isRootEmail ? 'root_admin' : (u.role === 'root_admin' ? 'admin' : (u.role || 'member'));
    let finalTitle = u.staff_title || 'EN | Player';
    const finalAdditionalTitle = u.additional_title || 'EN | Player';

    if (!isRootEmail) {
      if ((finalTitle === 'Project Management' && (finalRole !== 'admin' || u.role === 'root_admin')) || finalTitle === 'Creator of Project' || finalTitle === 'Curator Of Project' || finalTitle === 'Root Admin') {
        finalTitle = 'Chief Administrator';
        finalRole = 'admin';
        supabase.from('users').update({ role: 'admin', staff_title: 'Chief Administrator' }).eq('id', u.id).then(() => {}).catch(() => {});
      }
    } else {
      finalRole = 'root_admin';
      finalTitle = finalTitle || 'Project Management';
    }

    // Ensure no conflict on ID or email before inserting/updating
    try {
      db.prepare('DELETE FROM users WHERE id = ? AND username != ?').run(u.id, u.username);
      db.prepare('DELETE FROM users WHERE LOWER(email) = LOWER(?) AND id != ?').run(u.email, u.id);
    } catch (_) {}

    const upsertSql = db.prepare(`
      INSERT INTO users (id, username, email, password_hash, role, staff_title, additional_title, avatar, created_at, last_login, failed_logins, locked_until, banned, ban_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        id = excluded.id,
        email = excluded.email,
        role = excluded.role,
        staff_title = excluded.staff_title,
        additional_title = excluded.additional_title,
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
      finalAdditionalTitle,
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
async function updateUserRole(idOrUsername, role, staffTitle, email, additionalTitle) {
  if (!supabase || !idOrUsername) return;
  try {
    const isTargetRootEmail = role === 'root_admin' || (email && email.toLowerCase().trim() === config.rootAdminEmail);
    let finalRole = role;
    let finalTitle = staffTitle;

    if (!isTargetRootEmail) {
      if (finalRole === 'root_admin') finalRole = 'admin';
      if (finalTitle === 'Project Management' || finalTitle === 'Curator Of Project' || finalTitle === 'Root Admin') {
        finalTitle = 'Chief Administrator';
      }
    } else {
      finalRole = 'root_admin';
      finalTitle = finalTitle || 'Project Management';
    }

    const updates = {
      role: finalRole,
      staff_title: finalTitle || 'EN | Player',
      additional_title: additionalTitle || 'EN | Player',
    };

    const applyUpdate = async (payload) => {
      let query = supabase.from('users').update(payload);
      if (typeof idOrUsername === 'number' || (typeof idOrUsername === 'string' && /^\d+$/.test(idOrUsername))) {
        query = query.eq('id', Number(idOrUsername));
      } else {
        query = query.ilike('username', String(idOrUsername));
      }
      return query;
    };

    let { error } = await applyUpdate(updates);
    if (error && error.message && error.message.includes('additional_title')) {
      // Older production schemas can still persist a root user's assigned title in staff_title.
      const { additional_title: _additionalTitle, ...legacyUpdates } = updates;
      ({ error } = await applyUpdate(legacyUpdates));
    }
    if (error) throw new Error(`[supabase updateUserRole error]: ${error.message}`);
    console.log(`[supabase] Updated role for ${idOrUsername} to ${finalRole} (${isTargetRootEmail ? additionalTitle : finalTitle})`);
  } catch (err) {
    console.error('[supabase updateUserRole exception]:', err.message);
    throw err;
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
    try {
      await supabase.from('users').delete().in('email', ['rafay.royal@fidecity.local', 'marshmello.pluxury@fidecity.local']);
      db.exec("DELETE FROM users WHERE email IN ('rafay.royal@fidecity.local', 'marshmello.pluxury@fidecity.local');");
    } catch (_) {}

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
            if ((finalTitle === 'Project Management' && (finalRole !== 'admin' || u.role === 'root_admin')) || finalTitle === 'Creator of Project' || finalTitle === 'Curator Of Project' || finalTitle === 'Root Admin') {
              finalTitle = 'Chief Administrator';
              finalRole = 'admin';
              // Asynchronously clean up stale record in Supabase cloud
              supabase.from('users').update({ role: 'admin', staff_title: 'Chief Administrator' }).eq('id', u.id).then(() => {}).catch(() => {});
            }
          } else {
            finalRole = 'root_admin';
            finalTitle = finalTitle || 'Project Management';
          }

          u.role = finalRole;
          u.staff_title = finalTitle;
          u.additional_title = u.additional_title || (isRootEmail ? finalTitle : 'EN | Player');
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
    const localUsers = db.prepare("SELECT * FROM users WHERE email NOT LIKE '%@fidecity.local'").all();
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

function requireForumSupabase() {
  if (!supabase) throw new Error('Supabase is not configured; forum form data could not be saved.');
  return supabase;
}

async function ensureForumCategory(category) {
  const client = requireForumSupabase();
  const { data: existing, error: lookupError } = await client.from('categories')
    .select('id')
    .eq('slug', category.slug)
    .maybeSingle();
  if (lookupError) throw new Error(`[supabase forum category lookup] ${lookupError.message}`);
  if (existing) return existing.id;

  const { data: created, error: insertError } = await client.from('categories')
    .insert({
      slug: category.slug,
      name: category.name,
      description: category.description || '',
      sort_order: category.sort_order || 0,
      staff_only: category.staff_only ? 1 : 0,
      locked: category.locked ? 1 : 0,
    })
    .select('id')
    .single();
  if (insertError) throw new Error(`[supabase forum category create] ${insertError.message}`);
  return created.id;
}

async function ensureForumUser(userId) {
  const client = requireForumSupabase();
  const local = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!local) throw new Error('Your account is not available locally; the form was not submitted.');

  const { data: remote, error } = await client.from('users')
    .select('id')
    .eq('id', userId)
    .eq('username', local.username)
    .maybeSingle();
  if (error) throw new Error(`[supabase forum user lookup] ${error.message}`);
  if (remote) return remote.id;

  const { data: byUsername, error: usernameError } = await client.from('users')
    .select('id')
    .eq('username', local.username)
    .maybeSingle();
  if (usernameError) throw new Error(`[supabase forum user lookup] ${usernameError.message}`);
  if (byUsername) return byUsername.id;

  await saveUser(local);
  const { data: saved, error: saveError } = await client.from('users')
    .select('id')
    .eq('username', local.username)
    .maybeSingle();
  if (saveError) throw new Error(`[supabase forum user sync] ${saveError.message}`);
  if (!saved) throw new Error('Your account could not be synced to Supabase; the form was not submitted.');
  return saved.id;
}

async function listForumThreads(category, limit, offset) {
  const client = requireForumSupabase();
  const categoryId = await ensureForumCategory(category);
  const { data, error, count } = await client.from('threads')
    .select('*', { count: 'exact' })
    .eq('category_id', categoryId)
    .eq('deleted', 0)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`[supabase forum threads] ${error.message}`);

  const userIds = [...new Set((data || []).map((thread) => thread.user_id))];
  const usersById = new Map();
  if (userIds.length) {
    const { data: users, error: usersError } = await client.from('users')
      .select('id, username')
      .in('id', userIds);
    if (usersError) throw new Error(`[supabase forum authors] ${usersError.message}`);
    for (const user of users || []) usersById.set(user.id, user.username);
  }
  return {
    total: count || 0,
    threads: (data || []).map((thread) => ({ ...thread, username: usersById.get(thread.user_id) || 'Unknown user' })),
  };
}

async function getForumCategoryCounts(categories) {
  const client = requireForumSupabase();
  if (!categories.length) return new Map();

  const categoryIds = new Map();
  const slugs = categories.map((category) => category.slug);
  const { data: existing, error: lookupError } = await client.from('categories')
    .select('id, slug')
    .in('slug', slugs);
  if (lookupError) throw new Error(`[supabase forum category counts lookup] ${lookupError.message}`);
  for (const category of existing || []) categoryIds.set(category.slug, category.id);

  for (const category of categories) {
    if (!categoryIds.has(category.slug)) {
      categoryIds.set(category.slug, await ensureForumCategory(category));
    }
  }

  const directCounts = new Map();
  await Promise.all(categories.map(async (category) => {
    const categoryId = categoryIds.get(category.slug);
    const [threadResult, postResult] = await Promise.all([
      client.from('threads')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', categoryId)
        .eq('deleted', 0),
      client.from('posts')
        .select('id, threads!inner(category_id,deleted)', { count: 'exact', head: true })
        .eq('deleted', 0)
        .eq('threads.category_id', categoryId)
        .eq('threads.deleted', 0),
    ]);
    if (threadResult.error) throw new Error(`[supabase forum thread counts] ${threadResult.error.message}`);
    if (postResult.error) throw new Error(`[supabase forum message counts] ${postResult.error.message}`);
    directCounts.set(category.slug, {
      threads: threadResult.count || 0,
      posts: postResult.count || 0,
    });
  }));

  return rollUpForumCategoryCounts(categories, directCounts);
}

function rollUpForumCategoryCounts(categories, directCounts) {
  const childrenByParent = new Map();
  for (const category of categories) {
    if (!category.parent_slug) continue;
    const children = childrenByParent.get(category.parent_slug) || [];
    children.push(category.slug);
    childrenByParent.set(category.parent_slug, children);
  }

  const totals = new Map();
  for (const category of categories) {
    const visiting = new Set();
    function totalFor(slug) {
      if (visiting.has(slug)) return { threads: 0, posts: 0 };
      visiting.add(slug);
      const direct = directCounts.get(slug) || { threads: 0, posts: 0 };
      const total = { threads: direct.threads, posts: direct.posts };
      for (const childSlug of childrenByParent.get(slug) || []) {
        const childTotal = totalFor(childSlug);
        total.threads += childTotal.threads;
        total.posts += childTotal.posts;
      }
      visiting.delete(slug);
      return total;
    }
    totals.set(category.slug, totalFor(category.slug));
  }
  return totals;
}

const APPLICATION_FORUM_SLUGS = new Set([
  'application',
  'admin-application',
  'leader-application',
  'assistant-application',
]);

async function getForumThreadRecord(threadId, pageNo = 1, perPage = 20) {
  if (!Number.isSafeInteger(threadId) || threadId < 1) return null;
  const client = requireForumSupabase();
  const { data: thread, error } = await client.from('threads')
    .select('*')
    .eq('id', threadId)
    .eq('deleted', 0)
    .maybeSingle();
  if (error) throw new Error(`[supabase forum thread] ${error.message}`);
  if (!thread) return null;

  const { data: category, error: categoryError } = await client.from('categories')
    .select('*')
    .eq('id', thread.category_id)
    .maybeSingle();
  if (categoryError) throw new Error(`[supabase forum category lookup] ${categoryError.message}`);
  if (!category || category.staff_only || !APPLICATION_FORUM_SLUGS.has(category.slug)) return null;

  const { count, error: countError } = await client.from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', thread.id)
    .eq('deleted', 0);
  if (countError) throw new Error(`[supabase forum post count] ${countError.message}`);
  const total = count || 0;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(pageNo, pageCount);
  const { data: posts, error: postsError } = await client.from('posts')
    .select('*')
    .eq('thread_id', thread.id)
    .eq('deleted', 0)
    .order('id', { ascending: true })
    .range((page - 1) * perPage, page * perPage - 1);
  if (postsError) throw new Error(`[supabase forum posts] ${postsError.message}`);
  const { data: firstPost, error: firstPostError } = await client.from('posts')
    .select('id')
    .eq('thread_id', thread.id)
    .eq('deleted', 0)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (firstPostError) throw new Error(`[supabase forum first post] ${firstPostError.message}`);

  const userIds = [...new Set([thread.user_id, ...(posts || []).map((post) => post.user_id)])];
  const usersById = new Map();
  if (userIds.length) {
    const { data: users, error: usersError } = await client.from('users')
      .select('id, username, role, staff_title, additional_title, avatar')
      .in('id', userIds);
    if (usersError) throw new Error(`[supabase forum authors] ${usersError.message}`);
    for (const user of users || []) usersById.set(user.id, user);
  }

  return {
    t: { ...thread, first_post_id: firstPost ? firstPost.id : null },
    cat: category,
    posts: (posts || []).map((post) => ({
      ...post,
      ...(usersById.get(post.user_id) || { username: 'Unknown user', role: 'member', staff_title: 'EN | Player', additional_title: 'EN | Player', avatar: null }),
    })),
    pageNo: page,
    pages: pageCount,
    total,
  };
}

async function getForumPostRecord(postId) {
  const client = requireForumSupabase();
  const { data: post, error } = await client.from('posts')
    .select('*')
    .eq('id', postId)
    .eq('deleted', 0)
    .maybeSingle();
  if (error) throw new Error(`[supabase forum post] ${error.message}`);
  if (!post) return null;
  const record = await getForumThreadRecord(post.thread_id);
  if (!record) return null;
  return { post, thread: record.t, cat: record.cat, isFirstPost: record.t.first_post_id === post.id };
}

async function createForumThreadRecord(category, user, title, body, status) {
  const client = requireForumSupabase();
  const categoryId = await ensureForumCategory(category);
  const authorId = await ensureForumUser(user.id);
  const now = Date.now();
  const payload = {
    category_id: categoryId,
    user_id: authorId,
    title,
    created_at: now,
    updated_at: now,
  };
  if (status) payload.status = status;
  const { data: thread, error } = await client.from('threads').insert(payload).select('*').single();
  if (error) throw new Error(`[supabase forum create thread] ${error.message}`);

  const { error: postError } = await client.from('posts').insert({
    thread_id: thread.id,
    user_id: authorId,
    body,
    created_at: now,
  });
  if (postError) {
    const { error: rollbackError } = await client.from('threads').delete().eq('id', thread.id);
    if (rollbackError) console.error('[supabase forum rollback error]:', rollbackError.message);
    throw new Error(`[supabase forum create form] ${postError.message}`);
  }
  return thread.id;
}

async function createForumReplyRecord(threadId, user, body) {
  const client = requireForumSupabase();
  const authorId = await ensureForumUser(user.id);
  const now = Date.now();
  const { data: post, error } = await client.from('posts')
    .insert({ thread_id: threadId, user_id: authorId, body, created_at: now })
    .select('*')
    .single();
  if (error) throw new Error(`[supabase forum reply] ${error.message}`);

  const { count, error: countError } = await client.from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', threadId)
    .eq('deleted', 0);
  if (countError) throw new Error(`[supabase forum reply count] ${countError.message}`);
  const { error: updateError } = await client.from('threads')
    .update({ reply_count: Math.max(0, (count || 0) - 1), updated_at: now })
    .eq('id', threadId);
  if (updateError) throw new Error(`[supabase forum thread update] ${updateError.message}`);
  return post;
}

async function updateForumThreadRecord(threadId, updates) {
  const { error } = await requireForumSupabase().from('threads')
    .update({ ...updates, updated_at: Date.now() })
    .eq('id', threadId);
  if (error) throw new Error(`[supabase forum update] ${error.message}`);
}

async function updateForumPostRecord(postId, threadId, body, title) {
  const client = requireForumSupabase();
  const { error } = await client.from('posts').update({ body }).eq('id', postId).eq('thread_id', threadId);
  if (error) throw new Error(`[supabase forum edit post] ${error.message}`);
  const updates = title ? { title } : {};
  await updateForumThreadRecord(threadId, updates);
}

async function deleteForumThreadRecord(threadId) {
  const { error } = await requireForumSupabase().from('threads').delete().eq('id', threadId);
  if (error) throw new Error(`[supabase forum delete thread] ${error.message}`);
}

async function deleteForumPostRecord(postId, threadId) {
  const client = requireForumSupabase();
  const { error } = await client.from('posts').update({ deleted: 1 }).eq('id', postId).eq('thread_id', threadId);
  if (error) throw new Error(`[supabase forum delete post] ${error.message}`);
  const { count, error: countError } = await client.from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', threadId)
    .eq('deleted', 0);
  if (countError) throw new Error(`[supabase forum post count] ${countError.message}`);
  const { error: updateError } = await client.from('threads')
    .update({ reply_count: Math.max(0, (count || 0) - 1), updated_at: Date.now() })
    .eq('id', threadId);
  if (updateError) throw new Error(`[supabase forum thread update] ${updateError.message}`);
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
  ensureForumCategory,
  listForumThreads,
  getForumCategoryCounts,
  rollUpForumCategoryCounts,
  getForumThreadRecord,
  getForumPostRecord,
  createForumThreadRecord,
  createForumReplyRecord,
  updateForumThreadRecord,
  updateForumPostRecord,
  deleteForumThreadRecord,
  deleteForumPostRecord,
};
