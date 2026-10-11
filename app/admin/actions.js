'use server';

import { randomInt } from 'node:crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import config from '../../lib/config.js';
import { getCurrentUser } from '../../lib/next/auth.js';
import { getSupabase } from '../../lib/next/supabase.js';
import { DEFAULT_ROLE_NAME, findRoleByName, getPermissions } from '../../lib/roles.js';
import sec from '../../lib/security.js';

function clean(formData, key, max) {
  return sec.clean(formData.get(key), max);
}

async function destroyUserSessions(targetId) {
  const client = getSupabase();
  const matchingSids = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from('sessions')
      .select('sid, data').range(offset, offset + 999);
    if (error) throw new Error(`[admin invalidate sessions] ${error.message}`);
    for (const session of data || []) {
      let payload;
      try {
        payload = typeof session.data === 'string' ? JSON.parse(session.data) : session.data;
      } catch {
        continue;
      }
      if (Number(payload?.userId) === Number(targetId)) matchingSids.push(session.sid);
    }
    if (!data || data.length < 1000) break;
  }
  for (let offset = 0; offset < matchingSids.length; offset += 500) {
    const { error } = await client.from('sessions').delete()
      .in('sid', matchingSids.slice(offset, offset + 500));
    if (error) throw new Error(`[admin invalidate sessions] ${error.message}`);
  }
}

function requireCsrf(user, formData) {
  const token = clean(formData, 'csrf', 128);
  if (!user?.csrfToken || !sec.safeEqual(token, user.csrfToken)) {
    throw new Error('Your session expired. Refresh the page and try again.');
  }
}

async function requireStaffAction(formData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  requireCsrf(user, formData);
  if (!['mod', 'admin', 'root_admin'].includes(user.role)) redirect('/');
  return user;
}

function userId(formData) {
  const id = Number.parseInt(clean(formData, 'userId', 12), 10);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid account.');
  return id;
}

async function getTarget(id) {
  const { data, error } = await getSupabase().from('users')
    .select('id, username, email, role, staff_title, additional_title, banned')
    .eq('id', id).maybeSingle();
  if (error) throw new Error(`[admin target user] ${error.message}`);
  if (!data) throw new Error('Account not found.');
  return data;
}

async function writeAudit(actorId, action, detail) {
  let ip = '';
  const trustedHops = Number(config.trustProxy);
  if (Number.isInteger(trustedHops) && trustedHops > 0) {
    const forwarded = (await headers()).get('x-forwarded-for') || '';
    const chain = forwarded.split(',').map((part) => part.trim()).filter(Boolean);
    ip = chain[Math.max(0, chain.length - trustedHops)] || '';
  }
  const { error } = await getSupabase().from('audit_log').insert({
    user_id: actorId,
    action,
    detail,
    ip,
    created_at: Date.now(),
  });
  if (error) throw new Error(`[admin audit ${action}] ${error.message}`);
}

function refreshAdmin() {
  revalidatePath('/admin');
  revalidatePath('/admin/root');
  revalidatePath('/news');
  revalidateTag('stories', 'max');
  revalidateTag('users', 'max');
}

function destination(formData) {
  return clean(formData, 'returnTo', 12) === 'root'
    ? '/admin/root'
    : '/admin?tab=users';
}

function withNotice(path, key, value) {
  return `${path}${path.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;
}

function isRootAccount(user) {
  return user.role === 'root_admin'
    || user.email?.trim().toLowerCase() === config.rootAdminEmail;
}

async function requireTargetPermission(user, target, permission) {
  const permissions = getPermissions(user);
  if (!permissions[permission]) throw new Error('You do not have permission to perform this action.');
  if (Number(target.id) === Number(user.id)) throw new Error('You cannot do that to your own account.');
}

export async function banUserAction(formData) {
  const user = await requireStaffAction(formData);
  const target = await getTarget(userId(formData));
  await requireTargetPermission(user, target, 'canBan');
  const isRoot = user.isRoot === true;
  const isAdmin = user.role === 'admin' || isRoot;
  if (isRootAccount(target)) throw new Error('Root admin accounts cannot be banned.');
  if (target.role === 'admin' && !isRoot) throw new Error('Only Root Admin can ban an admin.');
  if (target.role === 'mod' && !isAdmin) throw new Error('Only Admins can ban a moderator.');

  const reason = clean(formData, 'reason', 200) || 'No reason given';
  const { error } = await getSupabase().from('users')
    .update({ banned: 1, ban_reason: reason }).eq('id', target.id);
  if (error) throw new Error(`[admin ban user] ${error.message}`);
  await destroyUserSessions(target.id);
  await writeAudit(user.id, 'user_ban', `${target.username}: ${reason}`);
  refreshAdmin();
  redirect(withNotice(destination(formData), 'notice', `${target.username} was banned.`));
}

export async function unbanUserAction(formData) {
  const user = await requireStaffAction(formData);
  const target = await getTarget(userId(formData));
  await requireTargetPermission(user, target, 'canUnban');
  if ((target.role === 'admin' || isRootAccount(target)) && user.isRoot !== true) {
    throw new Error('Only Root Admin can unban this account.');
  }
  const { error } = await getSupabase().from('users')
    .update({ banned: 0, ban_reason: null, failed_logins: 0, locked_until: 0 })
    .eq('id', target.id);
  if (error) throw new Error(`[admin unban user] ${error.message}`);
  await writeAudit(user.id, 'user_unban', target.username);
  refreshAdmin();
  redirect(withNotice(destination(formData), 'notice', `${target.username} was unbanned.`));
}

export async function warnUserAction(formData) {
  const user = await requireStaffAction(formData);
  const target = await getTarget(userId(formData));
  await requireTargetPermission(user, target, 'canWarn');
  if (isRootAccount(target)) throw new Error('Root administrator accounts cannot be warned.');
  const reason = clean(formData, 'reason', 200) || 'Staff moderation warning';
  const { error } = await getSupabase().from('warnings').insert({
    user_id: target.id,
    issuer_id: user.id,
    reason,
    created_at: Date.now(),
  });
  if (error) throw new Error(`[admin warning] ${error.message}`);
  await writeAudit(user.id, 'user_warn', `${target.username} (user ${target.id}): ${reason}`);
  refreshAdmin();
  redirect(withNotice(destination(formData), 'notice', `Warning issued to ${target.username}.`));
}

export async function recoverUserAction(formData) {
  const user = await requireStaffAction(formData);
  const target = await getTarget(userId(formData));
  await requireTargetPermission(user, target, 'canRecoverAccount');
  const otp = String(randomInt(100000, 999999));
  const now = Date.now();
  const expiresAt = now + 15 * 60 * 1000;
  const client = getSupabase();
  const { error: resetError } = await client.from('password_resets').insert({
    user_id: target.id,
    otp,
    expires_at: expiresAt,
    created_at: now,
  });
  if (resetError) throw new Error(`[admin account recovery] ${resetError.message}`);
  const { error: userError } = await client.from('users')
    .update({ failed_logins: 0, locked_until: 0 }).eq('id', target.id);
  if (userError) throw new Error(`[admin account recovery unlock] ${userError.message}`);
  await writeAudit(user.id, 'account_recovery', `Generated recovery OTP for ${target.username}`);
  const cookieStore = await cookies();
  cookieStore.set('fc_admin_recovery', `${target.username}|${otp}`, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'strict',
    path: '/admin',
    maxAge: 180,
  });
  refreshAdmin();
  redirect(withNotice(destination(formData), 'recovery', '1'));
}

export async function dismissRecoveryAction(formData) {
  const user = await requireStaffAction(formData);
  if (!getPermissions(user).canRecoverAccount) redirect('/admin');
  const cookieStore = await cookies();
  cookieStore.set('fc_admin_recovery', '', {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'strict',
    path: '/admin',
    maxAge: 0,
  });
  redirect('/admin?tab=users');
}

export async function changeUserRoleAction(formData) {
  const user = await requireStaffAction(formData);
  if (!getPermissions(user).canChangeRole) throw new Error('You do not have permission to assign roles.');
  const target = await getTarget(userId(formData));
  const isCallerRoot = user.isRoot === true;
  const isSelf = Number(target.id) === Number(user.id);
  if (isSelf && !isCallerRoot) throw new Error('You cannot change your own role.');
  if (!isCallerRoot && isRootAccount(target)) {
    throw new Error('Only Root Admin can modify an Executive account.');
  }

  const targetRoot = isRootAccount(target) || (isCallerRoot && isSelf);
  const requestedTitle = clean(formData, targetRoot ? 'additional_title' : 'title', 50);
  const assignedRole = findRoleByName(requestedTitle);
  if (!assignedRole) {
    if (targetRoot) throw new Error('Select a valid additional role.');
    throw new Error('Select a valid role.');
  }

  let role;
  let title;
  let additionalTitle = target.additional_title || DEFAULT_ROLE_NAME;
  if (targetRoot) {
    role = 'root_admin';
    title = assignedRole.name;
    additionalTitle = assignedRole.name;
  } else {
    if (assignedRole.systemRole === 'root_admin' && !isCallerRoot) {
      throw new Error('Only Root Admin can assign Executive titles.');
    }
    role = assignedRole.systemRole === 'root_admin' ? 'admin' : assignedRole.systemRole;
    title = assignedRole.name;
    if (role === 'root_admin') role = 'admin';
    if (['Creator of Project', 'Curator Of Project', 'Root Admin'].includes(title) && !isCallerRoot) {
      throw new Error('Only Root Admin can assign Executive titles.');
    }
  }

  const { error } = await getSupabase().from('users')
    .update({ role, staff_title: title, additional_title: additionalTitle })
    .eq('id', target.id);
  if (error) throw new Error(`[admin change user role] ${error.message}`);
  await destroyUserSessions(target.id);
  await writeAudit(user.id, 'user_role', `${target.username}: ${target.role} (${target.staff_title || ''}) -> ${role} (${title})`);
  refreshAdmin();
  redirect(withNotice(destination(formData), 'notice', `${target.username} role updated to ${title}.`));
}

export async function createStoryAction(formData) {
  const user = await requireStaffAction(formData);
  if (!getPermissions(user).hasNews) throw new Error('You do not have permission to publish news.');
  const title = sec.cleanLine(formData.get('title'), 120);
  const summary = sec.cleanLine(formData.get('summary'), 200);
  const body = sec.clean(formData.get('body'), 10000);
  if (title.length < 3 || summary.length < 3 || body.length < 20) {
    redirect('/admin?tab=stories&error=story');
  }
  const slugBase = sec.slugify(title);
  let slug = slugBase;
  for (let suffix = 2; ; suffix += 1) {
    const { data, error } = await getSupabase().from('stories')
      .select('id').eq('slug', slug).maybeSingle();
    if (error) throw new Error(`[admin story slug check] ${error.message}`);
    if (!data) break;
    slug = `${slugBase.slice(0, 55)}-${suffix}`;
  }
  const { error } = await getSupabase().from('stories').insert({
    slug,
    title,
    summary,
    body,
    author_id: user.id,
    created_at: Date.now(),
    published: 1,
  });
  if (error) throw new Error(`[admin publish story] ${error.message}`);
  await writeAudit(user.id, 'story_publish', title);
  refreshAdmin();
  redirect('/admin?tab=stories&notice=published');
}

export async function deleteStoryAction(formData) {
  const user = await requireStaffAction(formData);
  if (!getPermissions(user).hasNews) throw new Error('You do not have permission to delete news.');
  const id = Number.parseInt(clean(formData, 'storyId', 12), 10);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid story.');
  const { data: story, error: lookupError } = await getSupabase().from('stories')
    .select('id, title').eq('id', id).maybeSingle();
  if (lookupError) throw new Error(`[admin story lookup] ${lookupError.message}`);
  if (!story) throw new Error('Story not found.');
  const { error } = await getSupabase().from('stories').delete().eq('id', id);
  if (error) throw new Error(`[admin delete story] ${error.message}`);
  await writeAudit(user.id, 'story_delete', `story ${id}: ${story.title}`);
  refreshAdmin();
  redirect('/admin?tab=stories&notice=deleted');
}
