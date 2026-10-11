'use strict';

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

/** Middleware: sign-in required. */
function requireUser(ctx) {
  if (!ctx.user) {
    ctx.flash('error', 'Sign in to continue.');
    ctx.redirect('/login');
  }
}

/** Middleware: moderators, admins, and root admins. Non-staff get a plain 404 so staff URLs are not advertised. */
async function requireStaff(ctx) {
  if (!ctx.user) throw httpError(404, 'Page not found');
  if (!['mod', 'admin', 'root_admin'].includes(ctx.user.role)) {
    const config = require('../lib/config');
    if (config.supabase && config.supabase.enabled) {
      const { syncFromSupabase } = require('../lib/supabase');
      await syncFromSupabase();
      const { db } = require('../lib/db');
      const u = db.prepare('SELECT id, username, email, role, staff_title, additional_title, avatar, created_at, banned FROM users WHERE id = ?').get(ctx.user.id);
      if (u) ctx.user = u;
    }
  }
  if (!ctx.user || !['mod', 'admin', 'root_admin'].includes(ctx.user.role)) throw httpError(404, 'Page not found');
}

async function requireAdmin(ctx) {
  if (!ctx.user) throw httpError(404, 'Page not found');
  if (!['admin', 'root_admin'].includes(ctx.user.role)) {
    const config = require('../lib/config');
    if (config.supabase && config.supabase.enabled) {
      const { syncFromSupabase } = require('../lib/supabase');
      await syncFromSupabase();
      const { db } = require('../lib/db');
      const u = db.prepare('SELECT id, username, email, role, staff_title, additional_title, avatar, created_at, banned FROM users WHERE id = ?').get(ctx.user.id);
      if (u) ctx.user = u;
    }
  }
  if (!ctx.user || !['admin', 'root_admin'].includes(ctx.user.role)) throw httpError(404, 'Page not found');
}

async function requireRootAdmin(ctx) {
  if (!ctx.user) throw httpError(404, 'Page not found');
  const config = require('../lib/config');
  const isMatch = ctx.user.email && ctx.user.email.toLowerCase().trim() === config.rootAdminEmail;
  if (!isMatch) throw httpError(404, 'Page not found');
}

const isStaff = (u) => Boolean(u && ['mod', 'admin', 'root_admin'].includes(u.role));
const isAdmin = (u) => Boolean(u && ['admin', 'root_admin'].includes(u.role));
const isRootAdmin = (u) => {
  if (!u || !u.email) return false;
  const config = require('../lib/config');
  return u.email.toLowerCase().trim() === config.rootAdminEmail;
};

function intParam(v) {
  return /^\d{1,9}$/.test(String(v)) ? Number(v) : null;
}

function pageParam(ctx) {
  const n = intParam(ctx.query.get('page') || '1');
  return n && n > 0 && n < 100000 ? n : 1;
}

module.exports = { httpError, requireUser, requireStaff, requireAdmin, requireRootAdmin, isStaff, isAdmin, isRootAdmin, intParam, pageParam };
