'use strict';
const { get, post } = require('../lib/http');
const { db, audit, tx } = require('../lib/db');
const config = require('../lib/config');
const sessions = require('../lib/session');
const sec = require('../lib/security');
const authViews = require('../views/auth');
const pages = require('../views/pages');
const { requireUser } = require('./helpers');

const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60 * 1000;
const MIN_FORM_MS = 2500;

const loginIpLimit = sec.limiter('login-ip', 15 * 60 * 1000, 20);
const loginNameLimit = sec.limiter('login-name', 15 * 60 * 1000, 8);
// Attempts (typos, validation errors) get a generous cap; accounts actually created per IP get a strict one.
// Shared mobile networks put many real players behind one IP, so failed attempts must not lock them out.
const registerLimit = sec.limiter('register-attempt', 60 * 60 * 1000, 40);
const registerCreateLimit = sec.limiter('register-create', 60 * 60 * 1000, 5);
const passwordLimit = sec.limiter('password', 15 * 60 * 1000, 8);

const q = {
  byName: db.prepare('SELECT * FROM users WHERE username = ? OR email = ?'),
  byId: db.prepare('SELECT * FROM users WHERE id = ?'),
  exists: db.prepare('SELECT username, email FROM users WHERE username = ? OR email = ?'),
  insert: db.prepare('INSERT INTO users (username, email, password_hash, created_at, last_login) VALUES (?, ?, ?, ?, ?)'),
  fail: db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?'),
  ok: db.prepare('UPDATE users SET failed_logins = 0, locked_until = 0, last_login = ? WHERE id = ?'),
  setPass: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
  del: db.prepare('DELETE FROM users WHERE id = ?'),
  adminCount: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND banned = 0"),
};

function startSession(ctx, userId) {
  ctx.session.regenerate(); // new session id: defeats session fixation
  ctx.session.set('userId', userId);
  ctx.session.set('csrf', sec.newToken(32)); // rotate CSRF token on privilege change
  ctx.session.delete('formAt');
}

/* ------------------------------- Login -------------------------------- */
get('/login', (ctx) => {
  if (ctx.user) return ctx.redirect('/');
  ctx.html(authViews.login(ctx));
});

post('/login', async (ctx) => {
  const ident = sec.cleanLine(ctx.body.username, 254);
  const password = sec.str(ctx.body.password, 128);
  const GENERIC = 'Incorrect username or password, or the account is temporarily locked.';

  const ipRl = loginIpLimit(ctx.ip);
  const nameRl = loginNameLimit(ident.toLowerCase() || 'empty');
  if (!ipRl.ok || !nameRl.ok) {
    audit(null, 'login_throttled', ident.slice(0, 60), ctx.ip);
    return ctx.html(authViews.login(ctx, { error: 'Too many sign-in attempts. Wait a few minutes and try again.', username: ident }), 429);
  }

  if (!(await sec.verifyTurnstile(sec.str(ctx.body['cf-turnstile-response'], 2048), ctx.ip))) {
    return ctx.html(authViews.login(ctx, { error: 'Could not verify you are human. Try again.', username: ident }), 400);
  }

  if (config.supabase && config.supabase.enabled) {
    const { syncFromSupabase } = require('../lib/supabase');
    await syncFromSupabase();
  }
  let user = ident ? q.byName.get(ident, ident) : null;
  const now = Date.now();
  const locked = user && user.locked_until > now;

  let valid = false;
  if (user && !locked) valid = await sec.verifyPassword(password, user.password_hash);
  else await sec.dummyVerify(password); // keep timing similar for unknown/locked accounts

  if (!valid) {
    if (user && !locked) {
      const fails = user.failed_logins + 1;
      if (fails >= LOCK_AFTER) {
        q.fail.run(0, now + LOCK_MS, user.id);
        audit(user.id, 'account_locked', `after ${LOCK_AFTER} failed sign-ins`, ctx.ip);
      } else {
        q.fail.run(fails, 0, user.id);
      }
    }
    audit(user ? user.id : null, 'login_failed', user ? '' : ident.slice(0, 60), ctx.ip);
    return ctx.html(authViews.login(ctx, { error: GENERIC, username: ident }), 401);
  }

  if (user.banned) {
    audit(user.id, 'login_blocked_banned', '', ctx.ip);
    return ctx.html(authViews.login(ctx, { error: 'This account has been suspended. Contact the staff on Discord if you think this is a mistake.', username: ident }), 403);
  }

  q.ok.run(now, user.id);
  startSession(ctx, user.id);
  audit(user.id, 'login', '', ctx.ip);
  ctx.flash('ok', `Welcome back, ${user.username}.`);
  ctx.redirect('/');
});

/* ------------------------------ Register ------------------------------ */
get('/register', (ctx) => {
  if (ctx.user) return ctx.redirect('/');
  ctx.session.set('formAt', Date.now());
  ctx.html(authViews.register(ctx, { closed: !config.registrationOpen }));
});

post('/register', async (ctx) => {
  if (ctx.user) return ctx.redirect('/');
  if (!config.registrationOpen) return ctx.html(authViews.register(ctx, { closed: true }), 403);

  const rl = registerLimit(ctx.ip);
  if (!rl.ok) {
    return ctx.html(authViews.register(ctx, { errors: { form: 'Too many sign-ups from your network. Try again later.' } }), 429);
  }

  const username = sec.str(ctx.body.username, 40).trim();
  const email = sec.cleanLine(ctx.body.email, 254).toLowerCase();
  const password = sec.str(ctx.body.password, 200);
  const confirm = sec.str(ctx.body.confirm, 200);
  const values = { username, email };
  const errors = {};

  // Bot traps: hidden honeypot field + a minimum time between loading and submitting the form.
  const formAt = ctx.session.get('formAt');
  const honeypotFilled = sec.str(ctx.body.website, 200) !== '';
  if (honeypotFilled || !formAt || Date.now() - formAt < MIN_FORM_MS) {
    audit(null, 'register_bot_trap', username.slice(0, 40), ctx.ip);
    // A filled honeypot is refused every time anyway; only the "too fast" case needs the wait restarted.
    if (!honeypotFilled) ctx.session.set('formAt', Date.now());
    return ctx.html(authViews.register(ctx, { values, errors: { form: 'That was too fast. Check your details and submit again.' } }), 400);
  }

  if (!(await sec.verifyTurnstile(sec.str(ctx.body['cf-turnstile-response'], 2048), ctx.ip))) {
    errors.form = 'Could not verify you are human. Try again.';
  }

  const uErr = sec.validUsername(username);
  if (uErr) errors.username = uErr;
  const eErr = sec.validEmail(email);
  if (eErr) errors.email = eErr;
  const pErr = sec.validPassword(password, username);
  if (pErr) errors.password = pErr;
  else if (password !== confirm) errors.confirm = 'Passwords do not match.';
  if (ctx.body.agree !== 'yes') errors.agree = 'You must agree to continue.';

  if (!Object.keys(errors).length) {
    const clash = q.exists.all(username, email);
    for (const row of clash) {
      if (row.username.toLowerCase() === username.toLowerCase()) errors.username = 'That username is taken.';
      if (row.email.toLowerCase() === email) errors.email = 'An account may already exist with that email. Try signing in.';
    }
  }

  if (Object.keys(errors).length) {
    ctx.session.set('formAt', Date.now() - MIN_FORM_MS); // let the retry through without another wait
    return ctx.html(authViews.register(ctx, { errors, values }), 400);
  }

  if (!registerCreateLimit(ctx.ip).ok) {
    audit(null, 'register_throttled', username.slice(0, 40), ctx.ip);
    return ctx.html(authViews.register(ctx, { values, errors: { form: 'Too many accounts were created from your network recently. Try again in an hour or ask staff on Discord.' } }), 429);
  }

  const hash = await sec.hashPassword(password);
  let id;
  const now = Date.now();
  try {
    id = Number(q.insert.run(username, email, hash, now, now).lastInsertRowid);
  } catch (_) {
    // Unique constraint race: someone registered the same name between our check and insert.
    return ctx.html(authViews.register(ctx, { errors: { form: 'That username or email is already in use.' }, values }), 409);
  }

  // Sync to Supabase
  const { saveUser } = require('../lib/supabase');
  saveUser({ id, username, email, password_hash: hash, role: 'member', created_at: now, last_login: now });

  startSession(ctx, id);
  audit(id, 'register', '', ctx.ip);
  ctx.flash('ok', 'Account created. Welcome to Fide City.');
  ctx.redirect('/forum');
});

/* ------------------------------- Logout ------------------------------- */
post('/logout', (ctx) => {
  if (ctx.user) audit(ctx.user.id, 'logout', '', ctx.ip);
  ctx.session.destroy();
  ctx.redirect('/');
});

/* ------------------------------- Account ------------------------------ */
get('/account', requireUser, async (ctx) => {
  if (config.supabase && config.supabase.enabled) {
    const { syncFromSupabase } = require('../lib/supabase');
    await syncFromSupabase();
    const loadUser = db.prepare('SELECT id, username, email, role, staff_title, created_at, banned FROM users WHERE id = ?');
    ctx.user = loadUser.get(ctx.user.id);
  }
  ctx.html(pages.account(ctx));
});

post('/account/password', requireUser, async (ctx) => {
  const rl = passwordLimit(String(ctx.user.id));
  if (!rl.ok) return ctx.html(pages.account(ctx, { errors: { password: 'Too many attempts. Wait a few minutes.' } }), 429);

  const current = sec.str(ctx.body.current, 128);
  const next = sec.str(ctx.body.password, 200);
  const row = q.byId.get(ctx.user.id);

  if (!(await sec.verifyPassword(current, row.password_hash))) {
    audit(ctx.user.id, 'password_change_failed', '', ctx.ip);
    return ctx.html(pages.account(ctx, { errors: { password: 'Your current password is incorrect.' } }), 400);
  }
  const err = sec.validPassword(next, ctx.user.username);
  if (err) return ctx.html(pages.account(ctx, { errors: { password: err } }), 400);

  q.setPass.run(await sec.hashPassword(next), ctx.user.id);
  sessions.destroyAllForUser(ctx.user.id); // sign out everywhere
  startSession(ctx, ctx.user.id); // …then keep this device signed in with a fresh session
  audit(ctx.user.id, 'password_changed', '', ctx.ip);
  ctx.flash('ok', 'Password changed. Other devices were signed out.');
  ctx.redirect('/account');
});

post('/account/delete', requireUser, async (ctx) => {
  const rl = passwordLimit(String(ctx.user.id));
  if (!rl.ok) return ctx.html(pages.account(ctx, { errors: { delete: 'Too many attempts. Wait a few minutes.' } }), 429);

  const row = q.byId.get(ctx.user.id);
  if (!(await sec.verifyPassword(sec.str(ctx.body.password, 128), row.password_hash))) {
    return ctx.html(pages.account(ctx, { errors: { delete: 'Password is incorrect.' } }), 400);
  }
  if (row.role === 'admin' && q.adminCount.get().n <= 1) {
    return ctx.html(pages.account(ctx, { errors: { delete: 'You are the only admin. Promote another admin first.' } }), 400);
  }
  const id = row.id;
  const name = row.username;
  tx(() => {
    q.del.run(id);
    audit(null, 'account_deleted', `user ${name}`, ctx.ip);
  });
  sessions.destroyAllForUser(id);
  ctx.session.destroy();
  ctx.redirect('/');
});
