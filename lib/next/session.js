import { createHmac } from 'node:crypto';
import { cookies } from 'next/headers';
import config from '../config.js';
import { getSupabase } from './supabase.js';
import sec from '../security.js';

const cookieName = config.isProd ? '__Host-fc_sid' : 'fc_sid';
const maxAgeSeconds = 7 * 24 * 60 * 60;

function signedValue(sid) {
  const signature = createHmac('sha256', config.sessionSecret).update(sid).digest('base64url');
  return `${sid}.${signature}`;
}

export async function createSession(userId) {
  const sid = sec.newToken(32);
  const csrf = sec.newToken(32);
  const expires = Date.now() + maxAgeSeconds * 1000;
  const data = JSON.stringify({ userId, csrf });
  const { error } = await getSupabase().from('sessions').upsert({
    sid,
    data,
    expires,
    user_id: userId,
  });
  if (error) throw new Error(`[next session create] ${error.message}`);
  const cookieStore = await cookies();
  cookieStore.set(cookieName, signedValue(sid), {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });
  return { sid, csrf };
}

export async function destroySession(sid) {
  if (sid) {
    const { error } = await getSupabase().from('sessions').delete().eq('sid', sid);
    if (error) throw new Error(`[next session destroy] ${error.message}`);
  }
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}

export async function destroyUserSessions(userId) {
  const { error } = await getSupabase().rpc('delete_user_sessions', { p_user_id: userId });
  if (error) throw new Error(`[next user sessions destroy] ${error.message}`);
}

export async function auditEvent(userId, action, detail = '') {
  const { error } = await getSupabase().from('audit_log').insert({
    user_id: userId || null,
    action,
    detail,
    ip: '',
    created_at: Date.now(),
  });
  if (error) throw new Error(`[next audit] ${error.message}`);
}
