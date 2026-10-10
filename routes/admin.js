'use strict';
const { get, post } = require('../lib/http');
const { db, audit } = require('../lib/db');
const sessions = require('../lib/session');
const sec = require('../lib/security');
const view = require('../views/admin');
const { httpError, requireUser, requireStaff, requireAdmin, intParam } = require('./helpers');

const q = {
  count: (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`),
  users: db.prepare(`
    SELECT id, username, email, role, staff_title, created_at, last_login, banned, ban_reason
    FROM users ORDER BY created_at DESC LIMIT 100`),
  search: db.prepare(`
    SELECT id, username, email, role, staff_title, created_at, last_login, banned, ban_reason
    FROM users WHERE username LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT 100`),
  user: db.prepare('SELECT * FROM users WHERE id = ?'),
  ban: db.prepare('UPDATE users SET banned = 1, ban_reason = ? WHERE id = ?'),
  unban: db.prepare('UPDATE users SET banned = 0, ban_reason = NULL, failed_logins = 0, locked_until = 0 WHERE id = ?'),
  role: db.prepare('UPDATE users SET role = ?, staff_title = ? WHERE id = ?'),
  stories: db.prepare('SELECT id, slug, title, created_at FROM stories ORDER BY created_at DESC LIMIT 100'),
  slugTaken: db.prepare('SELECT 1 FROM stories WHERE slug = ?'),
  insStory: db.prepare('INSERT INTO stories (slug, title, summary, body, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  delStory: db.prepare('DELETE FROM stories WHERE id = ?'),
  audit: db.prepare(`
    SELECT a.*, u.username FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.id DESC LIMIT 200`),
};

const scalar = (sql, ...args) => db.prepare(sql).get(...args).n;

get('/admin', requireUser, requireStaff, (ctx) => {
  const isAdmin = ctx.user.role === 'admin';
  let tab = ctx.query.get('tab') || 'overview';
  if (!['overview', 'users', 'stories', 'audit'].includes(tab)) tab = 'overview';
  if (!isAdmin && (tab === 'stories' || tab === 'audit')) tab = 'overview';

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
    data = { q: term, list: term ? q.search.all(like, like) : q.users.all() };
  } else if (tab === 'stories') {
    data = { list: q.stories.all() };
  } else if (tab === 'audit') {
    data = { rows: q.audit.all() };
  }
  ctx.html(view.dashboard(ctx, { tab, data }));
});

/* --------------------------- Member moderation ------------------------ */
function targetUser(ctx) {
  const id = intParam(ctx.params.id);
  const u = id && q.user.get(id);
  if (!u) throw httpError(404, 'Page not found');
  if (u.id === ctx.user.id) throw httpError(400, 'You cannot do that to your own account.');
  return u;
}

post('/admin/users/:id/ban', requireUser, requireStaff, (ctx) => {
  const u = targetUser(ctx);
  // Mods may only ban plain members; admins may ban members and mods but never other admins.
  const actorIsAdmin = ctx.user.role === 'admin';
  if (u.role === 'admin' || (u.role === 'mod' && !actorIsAdmin)) throw httpError(403, 'You cannot ban this account.');
  const reason = sec.cleanLine(ctx.body.reason, 200) || 'No reason given';
  q.ban.run(reason, u.id);
  sessions.destroyAllForUser(u.id);
  audit(ctx.user.id, 'user_ban', `${u.username}: ${reason}`, ctx.ip);
  ctx.flash('ok', `${u.username} was banned.`);
  ctx.redirect('/admin?tab=users');
});

post('/admin/users/:id/unban', requireUser, requireStaff, (ctx) => {
  const u = targetUser(ctx);
  q.unban.run(u.id);
  audit(ctx.user.id, 'user_unban', u.username, ctx.ip);
  ctx.flash('ok', `${u.username} was unbanned.`);
  ctx.redirect('/admin?tab=users');
});

post('/admin/users/:id/role', requireUser, requireAdmin, (ctx) => {
  const u = targetUser(ctx);
  const role = sec.str(ctx.body.role, 10);
  if (!['member', 'mod', 'admin'].includes(role)) throw httpError(400, 'Invalid role.');
  const title = sec.cleanLine(ctx.body.title, 40) || null;
  q.role.run(role, role === 'member' ? null : title, u.id);
  sessions.destroyAllForUser(u.id); // force re-login so the new role takes effect cleanly
  audit(ctx.user.id, 'user_role', `${u.username}: ${u.role} -> ${role}`, ctx.ip);
  ctx.flash('ok', `${u.username} is now ${role}.`);
  ctx.redirect('/admin?tab=users');
});

/* -------------------------------- News -------------------------------- */
post('/admin/stories', requireUser, requireAdmin, (ctx) => {
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

post('/admin/stories/:id/delete', requireUser, requireAdmin, (ctx) => {
  const id = intParam(ctx.params.id);
  if (!id) throw httpError(404, 'Page not found');
  q.delStory.run(id);
  audit(ctx.user.id, 'story_delete', `story ${id}`, ctx.ip);
  ctx.flash('ok', 'Story deleted.');
  ctx.redirect('/admin?tab=stories');
});
