'use strict';
const fs = require('node:fs');
const { get, post } = require('../lib/http');
const { db, audit } = require('../lib/db');
const sessions = require('../lib/session');
const sec = require('../lib/security');
const config = require('../lib/config');
const view = require('../views/admin');
const { httpError, requireUser, requireStaff, requireAdmin, requireRootAdmin, intParam } = require('./helpers');
const { getPermissions } = require('../lib/roles');

const q = {
  count: (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`),
  users: db.prepare(`
    SELECT id, username, email, role, staff_title, additional_title, avatar, created_at, last_login, banned, ban_reason
    FROM users ORDER BY created_at DESC LIMIT 100`),
  search: db.prepare(`
    SELECT id, username, email, role, staff_title, additional_title, avatar, created_at, last_login, banned, ban_reason
    FROM users WHERE username LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT 100`),
  user: db.prepare('SELECT * FROM users WHERE id = ?'),
  ban: db.prepare('UPDATE users SET banned = 1, ban_reason = ? WHERE id = ?'),
  unban: db.prepare('UPDATE users SET banned = 0, ban_reason = NULL, failed_logins = 0, locked_until = 0 WHERE id = ?'),
  role: db.prepare('UPDATE users SET role = ?, staff_title = ?, additional_title = ? WHERE id = ?'),
  stories: db.prepare('SELECT id, slug, title, created_at FROM stories ORDER BY created_at DESC LIMIT 100'),
  slugTaken: db.prepare('SELECT 1 FROM stories WHERE slug = ?'),
  insStory: db.prepare('INSERT INTO stories (slug, title, summary, body, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  delStory: db.prepare('DELETE FROM stories WHERE id = ?'),
  audit: db.prepare(`
    SELECT a.*, u.username FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.id DESC LIMIT 200`),
};

const scalar = (sql, ...args) => db.prepare(sql).get(...args).n;

/* ----------------------- Root Admin Master Console -------------------- */
get('/admin/root', requireUser, requireRootAdmin, async (ctx) => {
  if (config.supabase && config.supabase.enabled) {
    const { syncFromSupabase, syncLocalToSupabase } = require('../lib/supabase');
    await syncFromSupabase();
    await syncLocalToSupabase();
  }

  const qTerm = sec.cleanLine(ctx.query.get('q') || '', 40);
  const filterRole = sec.str(ctx.query.get('role') || 'all', 20);

  const stats = {
    users: scalar('SELECT COUNT(*) AS n FROM users'),
    roots: scalar("SELECT COUNT(*) AS n FROM users WHERE role = 'root_admin'"),
    admins: scalar("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'"),
    mods: scalar("SELECT COUNT(*) AS n FROM users WHERE role = 'mod'"),
    members: scalar("SELECT COUNT(*) AS n FROM users WHERE role = 'member'"),
    players: scalar("SELECT COUNT(*) AS n FROM users WHERE banned = 0"),
    banned: scalar('SELECT COUNT(*) AS n FROM users WHERE banned = 1'),
  };

  let sql = 'SELECT id, username, email, role, staff_title, additional_title, avatar, created_at, last_login, banned, ban_reason FROM users WHERE 1=1';
  const params = [];

  if (filterRole === 'banned') {
    sql += ' AND banned = 1';
  } else if (filterRole === 'leadership') {
    sql += " AND staff_title IN ('Governor', 'Election Commissioner', 'Faction Leader', 'State Leader', 'Crime Leader', 'State Deputy', 'Crime Deputy', 'Weazel News')";
  } else if (filterRole === 'member') {
    sql += ' AND banned = 0';
  } else if (['root_admin', 'admin', 'mod'].includes(filterRole)) {
    sql += ' AND role = ?';
    params.push(filterRole);
  }

  if (qTerm) {
    const like = `%${qTerm.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    sql += " AND (username LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')";
    params.push(like, like);
  }

  sql += ' ORDER BY created_at DESC LIMIT 150';
  const rawList = db.prepare(sql).all(...params);
  const list = rawList.map((u) => {
    const warns = scalar('SELECT COUNT(*) AS n FROM warnings WHERE user_id = ?', u.id);
    return { ...u, warning_count: warns };
  });

  ctx.html(view.rootConsole(ctx, { list, q: qTerm, filterRole, stats }));
});

get('/admin', requireUser, requireStaff, async (ctx) => {
  const perms = getPermissions(ctx.user);
  if (!perms.hasAdminPanel) throw httpError(403, 'Access denied. Your staff tier operates directly on forum sections.');

  let tab = ctx.query.get('tab') || 'overview';
  if (!['overview', 'users', 'stories', 'audit', 'system'].includes(tab)) tab = 'overview';
  
  if (tab === 'users' && !perms.hasFullUsers) tab = 'overview';
  if (tab === 'stories' && !perms.hasNews) tab = 'overview';
  if (tab === 'audit' && !perms.hasAuditLog) tab = 'overview';
  if (tab === 'system' && !perms.hasSystemPanel) tab = 'overview';

  if (config.supabase && config.supabase.enabled) {
    const { syncFromSupabase, syncLocalToSupabase } = require('../lib/supabase');
    await syncFromSupabase();
    await syncLocalToSupabase();
  }

  let data = {};
  if (tab === 'overview') {
    data = {
      stats: {
        users: scalar('SELECT COUNT(*) AS n FROM users'),
        threads: scalar('SELECT COUNT(*) AS n FROM threads WHERE deleted = 0'),
        posts: scalar('SELECT COUNT(*) AS n FROM posts WHERE deleted = 0'),
        newUsers: scalar('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', Date.now() - 7 * 86400000),
        banned: scalar('SELECT COUNT(*) AS n FROM users WHERE banned = 1'),
        sessions: scalar('SELECT COUNT(*) AS n FROM sessions WHERE expires > ?', Date.now()),
      },
    };
  } else if (tab === 'users') {
    const term = sec.cleanLine(ctx.query.get('q') || '', 40);
    const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rawList = term ? q.search.all(like, like) : q.users.all();
    const list = rawList.map((u) => {
      const warns = scalar('SELECT COUNT(*) AS n FROM warnings WHERE user_id = ?', u.id);
      return { ...u, warning_count: warns };
    });
    data = { q: term, list };
  } else if (tab === 'stories') {
    data = { list: q.stories.all() };
  } else if (tab === 'audit') {
    data = { rows: q.audit.all() };
  } else if (tab === 'system') {
    let dbSize = 0;
    try {
      if (fs.existsSync(config.dbPath)) dbSize = fs.statSync(config.dbPath).size;
    } catch (_) {}
    data = {
      dbPath: config.dbPath,
      dbSize,
      supabaseEnabled: Boolean(config.supabase && config.supabase.enabled),
      userCount: scalar('SELECT COUNT(*) AS n FROM users'),
      threadCount: scalar('SELECT COUNT(*) AS n FROM threads WHERE deleted = 0'),
      postCount: scalar('SELECT COUNT(*) AS n FROM posts WHERE deleted = 0'),
    };
  }
  ctx.html(view.dashboard(ctx, { tab, data }));
});

/* --------------------------- Member moderation ------------------------ */
async function targetUser(ctx, { allowSelf = false } = {}) {
  const id = intParam(ctx.params.id);
  let u = id && q.user.get(id);
  if (!u && config.supabase && config.supabase.enabled) {
    const { syncFromSupabase } = require('../lib/supabase');
    await syncFromSupabase();
    u = id && q.user.get(id);
  }
  if (!u) throw httpError(404, 'Page not found');
  if (!allowSelf && u.id === ctx.user.id) throw httpError(400, 'You cannot do that to your own account.');
  return u;
}

function redirectBack(ctx) {
  const ref = String(ctx.req.headers.referer || '');
  return ref.includes('/admin/root') ? '/admin/root' : '/admin?tab=users';
}

post('/admin/users/:id/ban', requireUser, requireStaff, async (ctx) => {
  const perms = getPermissions(ctx.user);
  if (!perms.canBan) throw httpError(403, 'You do not have permission to ban users.');

  const u = await targetUser(ctx);
  const isRoot = ctx.user.role === 'root_admin';
  const isAdmin = ctx.user.role === 'admin' || isRoot;

  if (u.role === 'root_admin') throw httpError(403, 'Root admin accounts cannot be banned.');
  if (u.role === 'admin' && !isRoot) throw httpError(403, 'Only Root Admin can ban an admin.');
  if (u.role === 'mod' && !isAdmin) throw httpError(403, 'Only Admins can ban a moderator.');

  const reason = sec.cleanLine(ctx.body.reason, 200) || 'No reason given';
  q.ban.run(reason, u.id);
  sessions.destroyAllForUser(u.id);
  const { updateUserBan } = require('../lib/supabase');
  await updateUserBan(u.username, 1, reason);
  audit(ctx.user.id, 'user_ban', `${u.username}: ${reason}`, ctx.ip);
  ctx.flash('ok', `${u.username} was banned.`);
  ctx.redirect(redirectBack(ctx));
});

post('/admin/users/:id/unban', requireUser, requireStaff, async (ctx) => {
  const perms = getPermissions(ctx.user);
  if (!perms.canUnban) throw httpError(403, 'You do not have permission to unban users.');

  const u = await targetUser(ctx);
  const isRoot = ctx.user.role === 'root_admin';
  if ((u.role === 'admin' || u.role === 'root_admin') && !isRoot) {
    throw httpError(403, 'Only Root Admin can unban this account.');
  }
  q.unban.run(u.id);
  const { updateUserBan } = require('../lib/supabase');
  await updateUserBan(u.username, 0, null);
  audit(ctx.user.id, 'user_unban', u.username, ctx.ip);
  ctx.flash('ok', `${u.username} was unbanned.`);
  ctx.redirect(redirectBack(ctx));
});

post('/admin/users/:id/warn', requireUser, requireStaff, async (ctx) => {
  const perms = getPermissions(ctx.user);
  if (!perms.canWarn) throw httpError(403, 'You do not have permission to issue warnings.');
  const u = await targetUser(ctx);
  if (u.role === 'root_admin') throw httpError(403, 'Root administrator accounts cannot be warned.');
  const reason = sec.cleanLine(ctx.body.reason, 200) || 'Staff moderation warning';
  db.prepare('INSERT INTO warnings (user_id, issuer_id, reason, created_at) VALUES (?, ?, ?, ?)').run(u.id, ctx.user.id, reason, Date.now());
  audit(ctx.user.id, 'user_warn', `${u.username}: ${reason}`, ctx.ip);
  ctx.flash('ok', `Warning issued to ${u.username}: "${reason}".`);
  ctx.redirect(redirectBack(ctx));
});

post('/admin/users/:id/recover', requireUser, requireStaff, async (ctx) => {
  const perms = getPermissions(ctx.user);
  if (!perms.canRecoverAccount) throw httpError(403, 'You do not have permission to perform account recovery.');
  const u = await targetUser(ctx);
  const crypto = require('node:crypto');
  const otp = String(crypto.randomInt(100000, 999999));
  const expiresAt = Date.now() + 15 * 60 * 1000;
  db.prepare('INSERT INTO password_resets (user_id, otp, expires_at, created_at) VALUES (?, ?, ?, ?)').run(u.id, otp, expiresAt, Date.now());
  db.prepare('UPDATE users SET failed_logins = 0, locked_until = 0 WHERE id = ?').run(u.id);
  if (config.supabase && config.supabase.enabled) {
    const { savePasswordResetOtp } = require('../lib/supabase');
    await savePasswordResetOtp(u.id, otp, expiresAt);
  }
  audit(ctx.user.id, 'account_recovery', `Generated recovery OTP for ${u.username}`, ctx.ip);
  ctx.flash('ok', `Temporary recovery OTP generated for ${u.username}: ${otp} (Valid for 15 minutes).`);
  ctx.redirect(redirectBack(ctx));
});

post('/admin/users/:id/role', requireUser, requireStaff, async (ctx) => {
  const perms = getPermissions(ctx.user);
  if (!perms.canChangeRole) throw httpError(403, 'You do not have permission to assign roles.');

  const isCallerRoot = ctx.user.role === 'root_admin' || (ctx.user.email && ctx.user.email.toLowerCase().trim() === config.rootAdminEmail);
  const u = await targetUser(ctx, { allowSelf: isCallerRoot });

  // Non-root staff cannot modify a Root Admin account
  if (!isCallerRoot && (u.role === 'root_admin' || (u.email && u.email.toLowerCase().trim() === config.rootAdminEmail))) {
    throw httpError(403, 'Only Root Admin can modify an Executive account.');
  }

  let title = sec.cleanLine(ctx.body.title, 50);
  let additionalTitle = sec.cleanLine(ctx.body.additional_title, 50);
  let role = sec.str(ctx.body.role, 15);

  const { findRoleByName, DEFAULT_ROLE_NAME } = require('../lib/roles');
  const isTargetRootEmail = u.email && u.email.toLowerCase().trim() === config.rootAdminEmail;
  if (isTargetRootEmail) {
    const assignedRole = findRoleByName(additionalTitle);
    if (!assignedRole || assignedRole.systemRole === 'root_admin') {
      throw httpError(400, 'Select a valid additional role.');
    }
    role = 'root_admin';
    title = u.staff_title || 'Project Management';
    additionalTitle = assignedRole.name;
  }

  const cityRole = isTargetRootEmail ? null : findRoleByName(title);
  if (cityRole) {
    title = cityRole.name;
    role = cityRole.systemRole;
  } else if (!role) {
    role = 'member';
    title = DEFAULT_ROLE_NAME;
  }

  // Protection: only the official root email can hold root_admin / Executive titles
  if (!isTargetRootEmail) {
    if (role === 'root_admin') role = 'admin';
    if (title === 'Project Management' || title === 'Creator of Project' || title === 'Curator Of Project' || title === 'Root Admin') {
      title = 'Chief Administrator';
    }
  }

  // Non-root staff cannot promote someone to Executive / Root
  if (!isCallerRoot && (role === 'root_admin' || title === 'Project Management' || title === 'Creator of Project')) {
    throw httpError(403, 'Only Root Admin can assign Executive titles.');
  }

  const allowedRoles = isTargetRootEmail ? ['member', 'mod', 'admin', 'root_admin'] : ['member', 'mod', 'admin'];
  if (!allowedRoles.includes(role)) throw httpError(400, 'Invalid role or insufficient permissions.');

  q.role.run(role, title, isTargetRootEmail ? additionalTitle : (u.additional_title || 'EN | Player'), u.id);
  sessions.destroyAllForUser(u.id); // force re-login so the new role takes effect cleanly

  const { updateUserRole } = require('../lib/supabase');
  await updateUserRole(u.id, role, title, u.email, isTargetRootEmail ? additionalTitle : (u.additional_title || 'EN | Player'));

  audit(ctx.user.id, 'user_role', `${u.username}: ${u.role} (${u.staff_title || ''}) -> ${role} (${isTargetRootEmail ? additionalTitle : title})`, ctx.ip);
  ctx.flash('ok', `${u.username} role updated to: ${isTargetRootEmail ? additionalTitle : title}.`);
  ctx.redirect(redirectBack(ctx));
});

/* -------------------------------- News -------------------------------- */
post('/admin/stories', requireUser, requireStaff, (ctx) => {
  const perms = getPermissions(ctx.user);
  if (!perms.hasNews) throw httpError(403, 'You do not have permission to publish news.');
  const title = sec.cleanLine(ctx.body.title, 120);
  const summary = sec.cleanLine(ctx.body.summary, 200);
  const body = sec.clean(ctx.body.body, 10000);
  const values = { title, summary, body };
  if (title.length < 3 || summary.length < 3 || body.length < 20) {
    return ctx.html(view.dashboard(ctx, { tab: 'stories', data: { list: q.stories.all(), values, errors: { form: 'Add a title, a short summary and at least 20 characters of story.' } } }), 400);
  }
  let slug = sec.slugify(title);
  for (let i = 2; q.slugTaken.get(slug); i++) slug = `${sec.slugify(title).slice(0, 55)}-${i}`;
  q.insStory.run(slug, title, summary, body, ctx.user.id, Date.now());
  audit(ctx.user.id, 'story_publish', title, ctx.ip);
  ctx.flash('ok', 'Story published.');
  ctx.redirect('/admin?tab=stories');
});

post('/admin/stories/:id/delete', requireUser, requireStaff, (ctx) => {
  const perms = getPermissions(ctx.user);
  if (!perms.hasNews) throw httpError(403, 'You do not have permission to delete news.');
  const id = intParam(ctx.params.id);
  if (!id) throw httpError(404, 'Page not found');
  q.delStory.run(id);
  audit(ctx.user.id, 'story_delete', `story ${id}`, ctx.ip);
  ctx.flash('ok', 'Story deleted.');
  ctx.redirect('/admin?tab=stories');
});
