'use server';

import { randomInt } from 'node:crypto';
import { redirect } from 'next/navigation';
import config from '../../lib/config.js';
import sec from '../../lib/security.js';
import { getCurrentSession, getCurrentUser } from '../../lib/next/auth.js';
import { getSupabase } from '../../lib/next/supabase.js';
import { auditEvent, createSession, destroySession, destroyUserSessions } from '../../lib/next/session.js';

const loginIpLimit = sec.limiter('next-login-ip', 15 * 60 * 1000, 20);
const loginNameLimit = sec.limiter('next-login-name', 15 * 60 * 1000, 8);
const registerLimit = sec.limiter('next-register', 60 * 60 * 1000, 5);
const resetLimit = sec.limiter('next-password-reset', 15 * 60 * 1000, 5);
const passwordLimit = sec.limiter('next-password-change', 15 * 60 * 1000, 8);
const genericLoginError = 'Incorrect username or password, or the account is temporarily locked.';
const genericResetMessage = 'If an eligible account exists, a verification code has been sent to its registered email address.';

function value(formData, key, max = 10000) {
  return sec.str(formData.get(key), max);
}

function cleanLine(formData, key, max) {
  return sec.cleanLine(formData.get(key), max);
}

function redirectWith(path, key, message) {
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);
}

function requestKey(headers) {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function escapedLike(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

async function findUser(identifier) {
  const client = getSupabase();
  const normalized = identifier.trim();
  const escaped = escapedLike(normalized);
  const [byName, byEmail] = await Promise.all([
    client.from('users').select('*').ilike('username', escaped).maybeSingle(),
    client.from('users').select('*').eq('email', normalized.toLowerCase()).maybeSingle(),
  ]);
  if (byName.error) throw new Error(`[next auth lookup username] ${byName.error.message}`);
  if (byEmail.error) throw new Error(`[next auth lookup email] ${byEmail.error.message}`);
  if (byName.data && byEmail.data && byName.data.id !== byEmail.data.id) return null;
  return byName.data || byEmail.data || null;
}

async function verifyCaptcha(formData, headers) {
  if (!config.turnstile.enabled) return true;
  return sec.verifyTurnstile(value(formData, 'cf-turnstile-response', 2048), requestKey(headers));
}

export async function loginAction(formData) {
  const { headers } = await import('next/headers');
  const requestHeaders = await headers();
  const identifier = cleanLine(formData, 'username', 254);
  const password = value(formData, 'password', 128);
  const ip = requestKey(requestHeaders);
  const ipLimit = loginIpLimit(ip);
  const nameLimit = loginNameLimit(identifier.toLowerCase() || 'empty');
  if (!ipLimit.ok || !nameLimit.ok) {
    await auditEvent(null, 'login_throttled', identifier.slice(0, 60));
    redirectWith('/login', 'error', 'Too many sign-in attempts. Wait a few minutes and try again.');
  }
  if (!(await verifyCaptcha(formData, requestHeaders))) {
    redirectWith('/login', 'error', 'Could not verify you are human. Try again.');
  }

  const user = identifier ? await findUser(identifier) : null;
  const now = Date.now();
  const locked = user && Number(user.locked_until || 0) > now;
  const valid = user && !locked
    ? await sec.verifyPassword(password, user.password_hash)
    : await sec.dummyVerify(password);
  if (!valid || !user) {
    if (user && !locked) {
      const failures = Number(user.failed_logins || 0) + 1;
      const lockout = failures >= 5;
      const { error } = await getSupabase().from('users').update({
        failed_logins: lockout ? 0 : failures,
        locked_until: lockout ? now + 15 * 60 * 1000 : 0,
      }).eq('id', user.id);
      if (error) throw new Error(`[next auth failed login update] ${error.message}`);
      if (lockout) await auditEvent(user.id, 'account_locked', 'after 5 failed sign-ins');
    }
    await auditEvent(user?.id || null, 'login_failed', user ? '' : identifier.slice(0, 60));
    redirectWith('/login', 'error', genericLoginError);
  }
  if (user.banned) {
    await auditEvent(user.id, 'login_blocked_banned');
    redirectWith('/login', 'error', 'This account has been suspended. Contact staff if you think this is a mistake.');
  }

  const { error } = await getSupabase().from('users').update({
    failed_logins: 0,
    locked_until: 0,
    last_login: now,
  }).eq('id', user.id);
  if (error) throw new Error(`[next auth successful login update] ${error.message}`);
  await createSession(user.id);
  await auditEvent(user.id, 'login');
  redirect('/');
}

export async function registerAction(formData) {
  if (await getCurrentUser()) redirect('/');
  if (!config.registrationOpen) redirectWith('/register', 'error', 'Registration is currently closed.');
  const { headers } = await import('next/headers');
  const requestHeaders = await headers();
  if (!registerLimit(requestKey(requestHeaders)).ok) {
    redirectWith('/register', 'error', 'Too many sign-ups from your network. Try again later.');
  }
  if (value(formData, 'website', 200) !== '') {
    await auditEvent(null, 'register_bot_trap', cleanLine(formData, 'username', 40));
    redirectWith('/register', 'error', 'Unable to create this account.');
  }
  if (!(await verifyCaptcha(formData, requestHeaders))) {
    redirectWith('/register', 'error', 'Could not verify you are human. Try again.');
  }

  const username = value(formData, 'username', 40).trim();
  const email = cleanLine(formData, 'email', 254).toLowerCase();
  const password = value(formData, 'password', 200);
  const confirm = value(formData, 'confirm', 200);
  const usernameError = sec.validUsername(username);
  const emailError = sec.validEmail(email);
  const passwordError = sec.validPassword(password, username);
  if (usernameError || emailError || passwordError || password !== confirm || value(formData, 'agree', 10) !== 'yes') {
    const error = usernameError || emailError || passwordError
      || (password !== confirm ? 'Passwords do not match.' : 'You must agree to continue.');
    redirectWith('/register', 'error', error);
  }
  const existing = await findUser(username);
  if (existing) redirectWith('/register', 'error', 'That username is already in use.');
  const emailExisting = await findUser(email);
  if (emailExisting) redirectWith('/register', 'error', 'An account may already exist with that email.');

  const now = Date.now();
  const passwordHash = await sec.hashPassword(password);
  const { data: user, error } = await getSupabase().from('users').insert({
    username,
    email,
    password_hash: passwordHash,
    role: 'member',
    staff_title: 'EN | Player',
    additional_title: 'EN | Player',
    created_at: now,
    last_login: now,
  }).select('id').single();
  if (error) {
    if (error.code === '23505') redirectWith('/register', 'error', 'That username or email is already in use.');
    throw new Error(`[next auth register] ${error.message}`);
  }
  await createSession(user.id);
  await auditEvent(user.id, 'register');
  redirect('/forum');
}

export async function logoutAction(formData) {
  const user = await getCurrentUser();
  if (user) {
    const token = sec.clean(formData.get('csrf'), 128);
    if (!user.csrfToken || !sec.safeEqual(token, user.csrfToken)) {
      throw new Error('Your session expired. Refresh the page and try again.');
    }
    await auditEvent(user.id, 'logout');
  }
  const session = await getCurrentSession();
  await destroySession(session?.sid);
  redirect('/');
}

async function sendResetEmail(email, otp) {
  if (!config.passwordReset.resendApiKey || !config.passwordReset.fromEmail) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.passwordReset.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.passwordReset.fromEmail,
      to: [email],
      subject: 'Fide City password reset code',
      text: `Your Fide City password reset code is ${otp}. It expires in 15 minutes. If you did not request this, ignore this email.`,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error('[next password reset email] Provider rejected message:', response.status, detail.slice(0, 500));
    return false;
  }
  return true;
}

export async function requestPasswordResetAction(formData) {
  const { headers } = await import('next/headers');
  const requestHeaders = await headers();
  const ip = requestKey(requestHeaders);
  const identifier = cleanLine(formData, 'ident', 254);
  if (!resetLimit(ip).ok) redirectWith('/forgot-password', 'error', genericResetMessage);
  if (!(await verifyCaptcha(formData, requestHeaders))) {
    redirectWith('/forgot-password', 'error', 'Could not verify you are human. Try again.');
  }
  if (!identifier) redirectWith('/forgot-password', 'error', 'Enter your username or email address.');
  if (!config.passwordReset.resendApiKey || !config.passwordReset.fromEmail) {
    redirectWith('/forgot-password', 'error', 'Password recovery is temporarily unavailable. Contact support.');
  }

  const user = await findUser(identifier);
  if (!user || user.banned) {
    await auditEvent(user?.id || null, 'password_reset_otp_requested');
    redirectWith('/forgot-password', 'message', genericResetMessage);
  }
  const otp = String(randomInt(100000, 1000000));
  const client = getSupabase();
  const now = Date.now();
  const { error: expireError } = await client.from('password_resets').update({ used: 1 })
    .eq('user_id', user.id).eq('used', 0);
  if (expireError) throw new Error(`[next password reset invalidate prior codes] ${expireError.message}`);
  const { error } = await client.from('password_resets').insert({
    user_id: user.id,
    otp,
    expires_at: now + 15 * 60 * 1000,
    created_at: now,
  });
  if (error) throw new Error(`[next password reset create code] ${error.message}`);
  const sent = await sendResetEmail(user.email, otp);
  if (!sent) {
    const { error: invalidateError } = await client.from('password_resets').update({ used: 1 })
      .eq('user_id', user.id).eq('otp', otp);
    if (invalidateError) throw new Error(`[next password reset invalidate undelivered code] ${invalidateError.message}`);
    await auditEvent(user.id, 'password_reset_email_failed');
    redirectWith('/forgot-password', 'message', genericResetMessage);
  }
  await auditEvent(user.id, 'password_reset_otp_requested');
  redirectWith('/forgot-password', 'message', genericResetMessage);
}

export async function resetPasswordAction(formData) {
  if (await getCurrentUser()) redirect('/account');
  const { headers } = await import('next/headers');
  const requestHeaders = await headers();
  if (!resetLimit(requestKey(requestHeaders)).ok) {
    redirectWith('/reset-password', 'error', 'Too many attempts. Wait a few minutes and try again.');
  }
  if (!(await verifyCaptcha(formData, requestHeaders))) {
    redirectWith('/reset-password', 'error', 'Could not verify you are human. Try again.');
  }
  const identifier = cleanLine(formData, 'ident', 254);
  const otp = cleanLine(formData, 'otp', 6);
  const password = value(formData, 'password', 128);
  const confirm = value(formData, 'confirm', 128);
  if (!identifier || !/^\d{6}$/.test(otp) || !password) {
    redirectWith('/reset-password', 'error', 'Enter your account, six-digit code, and new password.');
  }
  if (password !== confirm) redirectWith('/reset-password', 'error', 'Passwords do not match.');
  const user = await findUser(identifier);
  if (!user) redirectWith('/reset-password', 'error', 'Invalid or expired verification code.');
  const passwordError = sec.validPassword(password, user.username);
  if (passwordError) redirectWith('/reset-password', 'error', passwordError);
  const passwordHash = await sec.hashPassword(password);
  const { data: userId, error } = await getSupabase().rpc('reset_password_with_otp', {
    p_user_id: user.id,
    p_otp: otp,
    p_password_hash: passwordHash,
    p_now: Date.now(),
  });
  if (error) throw new Error(`[next password reset] ${error.message}`);
  if (!userId) {
    await auditEvent(user.id, 'password_reset_invalid_otp');
    redirectWith('/reset-password', 'error', 'Invalid or expired verification code.');
  }
  await destroyUserSessions(user.id);
  await auditEvent(user.id, 'password_reset_success');
  redirectWith('/login', 'message', 'Password changed. Sign in with your new password.');
}

export async function updateAvatarAction(formData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const csrf = sec.clean(formData.get('csrf'), 128);
  if (!user.csrfToken || !sec.safeEqual(csrf, user.csrfToken)) {
    throw new Error('Your session expired. Refresh the page and try again.');
  }
  let avatar = null;
  if (value(formData, 'remove', 2) !== '1') {
    const data = value(formData, 'avatar', 250001).trim();
    const url = cleanLine(formData, 'avatar_url', 500).trim();
    if (data) {
      if (data.length > 250000 || !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(data)) {
        redirectWith('/account', 'error', 'Choose a valid image smaller than 180 KB.');
      }
      avatar = data;
    } else if (url) {
      let parsed;
      try { parsed = new URL(url.includes('://') ? url : `https://${url}`); } catch { redirectWith('/account', 'error', 'Enter a valid HTTPS image URL.'); }
      if (parsed.protocol !== 'https:' || parsed.href.length > 500) {
        redirectWith('/account', 'error', 'Enter a valid HTTPS image URL.');
      }
      avatar = parsed.href;
    } else {
      redirectWith('/account', 'error', 'Choose an image or enter a valid image URL.');
    }
  }
  const { error } = await getSupabase().from('users').update({ avatar }).eq('id', user.id);
  if (error) throw new Error(`[next account avatar] ${error.message}`);
  await auditEvent(user.id, avatar ? 'avatar_updated' : 'avatar_removed');
  redirectWith('/account', 'message', avatar ? 'Profile picture updated.' : 'Profile picture removed.');
}

export async function changePasswordAction(formData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const csrf = sec.clean(formData.get('csrf'), 128);
  if (!user.csrfToken || !sec.safeEqual(csrf, user.csrfToken)) {
    throw new Error('Your session expired. Refresh the page and try again.');
  }
  if (!passwordLimit(String(user.id)).ok) redirectWith('/account', 'error', 'Too many password attempts. Wait a few minutes.');
  const current = value(formData, 'current', 128);
  const password = value(formData, 'password', 128);
  const confirm = value(formData, 'confirm', 128);
  const { data: record, error: readError } = await getSupabase().from('users')
    .select('password_hash').eq('id', user.id).single();
  if (readError) throw new Error(`[next account password read] ${readError.message}`);
  if (!(await sec.verifyPassword(current, record.password_hash))) {
    await auditEvent(user.id, 'password_change_failed');
    redirectWith('/account', 'error', 'Your current password is incorrect.');
  }
  const passwordError = sec.validPassword(password, user.username);
  if (passwordError) redirectWith('/account', 'error', passwordError);
  if (password !== confirm) redirectWith('/account', 'error', 'Passwords do not match.');
  const passwordHash = await sec.hashPassword(password);
  const { error } = await getSupabase().from('users').update({
    password_hash: passwordHash,
    failed_logins: 0,
    locked_until: 0,
  }).eq('id', user.id);
  if (error) throw new Error(`[next account password update] ${error.message}`);
  await destroyUserSessions(user.id);
  await createSession(user.id);
  await auditEvent(user.id, 'password_changed');
  redirectWith('/account', 'message', 'Password changed. Other devices were signed out.');
}

export async function deleteAccountAction(formData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const csrf = sec.clean(formData.get('csrf'), 128);
  if (!user.csrfToken || !sec.safeEqual(csrf, user.csrfToken)) {
    throw new Error('Your session expired. Refresh the page and try again.');
  }
  if (user.isRoot) redirectWith('/account', 'error', 'The Root Admin account cannot be deleted from this page.');
  if (!passwordLimit(String(user.id)).ok) redirectWith('/account', 'error', 'Too many attempts. Wait a few minutes.');
  const { data: record, error: readError } = await getSupabase().from('users')
    .select('password_hash, role').eq('id', user.id).single();
  if (readError) throw new Error(`[next account deletion read] ${readError.message}`);
  if (!(await sec.verifyPassword(value(formData, 'password', 128), record.password_hash))) {
    redirectWith('/account', 'error', 'Password is incorrect.');
  }
  if (record.role === 'admin') {
    const { count, error } = await getSupabase().from('users')
      .select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('banned', 0);
    if (error) throw new Error(`[next account admin count] ${error.message}`);
    if ((count || 0) <= 1) redirectWith('/account', 'error', 'You are the only admin. Promote another admin first.');
  }
  const session = await getCurrentSession();
  await destroyUserSessions(user.id);
  const { error } = await getSupabase().from('users').delete().eq('id', user.id);
  if (error) throw new Error(`[next account delete] ${error.message}`);
  await auditEvent(null, 'account_deleted', `user ${user.username}`);
  await destroySession(session?.sid);
  redirect('/');
}
