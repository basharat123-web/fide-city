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
function requireStaff(ctx) {
  if (!ctx.user || !['mod', 'admin', 'root_admin'].includes(ctx.user.role)) throw httpError(404, 'Page not found');
}

function requireAdmin(ctx) {
  if (!ctx.user || !['admin', 'root_admin'].includes(ctx.user.role)) throw httpError(404, 'Page not found');
}

function requireRootAdmin(ctx) {
  if (!ctx.user || ctx.user.role !== 'root_admin') throw httpError(404, 'Page not found');
}

const isStaff = (u) => Boolean(u && ['mod', 'admin', 'root_admin'].includes(u.role));
const isAdmin = (u) => Boolean(u && ['admin', 'root_admin'].includes(u.role));
const isRootAdmin = (u) => Boolean(u && u.role === 'root_admin');

function intParam(v) {
  return /^\d{1,9}$/.test(String(v)) ? Number(v) : null;
}

function pageParam(ctx) {
  const n = intParam(ctx.query.get('page') || '1');
  return n && n > 0 && n < 100000 ? n : 1;
}

module.exports = { httpError, requireUser, requireStaff, requireAdmin, requireRootAdmin, isStaff, isAdmin, isRootAdmin, intParam, pageParam };
