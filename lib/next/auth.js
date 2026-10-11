import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import config from '../config.js';
import { getSupabase } from './supabase.js';

const sessionCookie = config.isProd ? '__Host-fc_sid' : 'fc_sid';

function validSignature(sid, signature) {
  const expected = createHmac('sha256', config.sessionSecret).update(sid).digest('base64url');
  const receivedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const value = cookieStore.get(sessionCookie)?.value || '';
  if (value.length > 200) return null;
  const separator = value.indexOf('.');
  if (separator < 1) return null;

  const sid = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!validSignature(sid, signature)) return null;

  const { data: session, error } = await getSupabase()
    .from('sessions')
    .select('data, expires')
    .eq('sid', sid)
    .gt('expires', Date.now())
    .maybeSingle();
  if (error) throw new Error(`[next auth session] ${error.message}`);
  if (!session) return null;

  let data;
  try {
    data = typeof session.data === 'string' ? JSON.parse(session.data) : session.data;
  } catch (error) {
    console.error('[next auth session] Stored session data is invalid JSON.', error);
    return null;
  }
  if (!data || !Number.isSafeInteger(Number(data.userId))) return null;
  return { sid, data };
}

export async function getCurrentUser() {
  const session = await getCurrentSession();
  if (!session) return null;

  const { data: user, error } = await getSupabase()
    .from('users')
    .select('id, username, email, role, staff_title, avatar, banned')
    .eq('id', session.data.userId)
    .maybeSingle();
  if (error) throw new Error(`[next auth user] ${error.message}`);
  if (!user || user.banned) return null;

  const isRoot = user.email?.trim().toLowerCase() === config.rootAdminEmail;
  const role = isRoot ? 'root_admin' : user.role === 'root_admin' ? 'admin' : user.role;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar || null,
    role,
    staff_title: user.staff_title || (role === 'admin' ? 'Chief Administrator' : 'EN | Player'),
    staffTitle: user.staff_title || (role === 'admin' ? 'Chief Administrator' : 'EN | Player'),
    isRoot,
    canOpenAdmin: ['mod', 'admin', 'root_admin'].includes(role),
    csrfToken: session.data.csrf || '',
  };
}
