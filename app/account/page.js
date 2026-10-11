import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../lib/next/auth.js';
import { getSupabase } from '../../lib/next/supabase.js';
import { getAssignedRoleMeta, getRoleMeta } from '../../lib/roles.js';
import { changePasswordAction, deleteAccountAction } from '../auth/actions.js';
import AvatarForm from './avatar-form.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My account', robots: { index: false, follow: false } };

export default async function AccountPage({ searchParams }) {
  const [{ error, message }, user] = await Promise.all([searchParams, getCurrentUser()]);
  if (!user) redirect('/login');
  const { data: threads, error: queryError } = await getSupabase().from('threads')
    .select('id, title, reply_count, created_at, categories!inner(name, slug, staff_only)')
    .eq('user_id', user.id).eq('deleted', 0).eq('categories.staff_only', 0)
    .order('created_at', { ascending: false }).limit(50);
  if (queryError) throw new Error(`[next account threads] ${queryError.message}`);
  const meta = user.isRoot ? getAssignedRoleMeta(user) : getRoleMeta(user);
  return <div className="wrap prose-wrap">
    <div className="page-head"><div><h1 className="page-title">Your account</h1><p className="page-lead">{user.username}</p></div>
      {user.isRoot ? <a className="btn btn-primary" href="/admin/root">Root Admin console</a> : user.canOpenAdmin ? <a className="btn btn-primary" href="/admin">Staff panel</a> : null}
    </div>
    {error && <p className="form-error banner" role="alert">{error}</p>}
    {message && <p className="form-ok banner" role="status">{message}</p>}
    <dl className="facts">
      <div><dt>Username</dt><dd>{user.username}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div>
      {user.isRoot && <div><dt>Access</dt><dd><span className="badge">Root Admin</span></dd></div>}
      <div><dt>Assigned role</dt><dd><span className="badge" style={{ color: meta.color }}>{meta.icon} {meta.name}</span></dd></div>
      <div><dt>Citizen role</dt><dd>🎮 EN | Player (Permanent)</dd></div>
    </dl>
    <AvatarForm avatar={user.avatar} csrfToken={user.csrfToken} username={user.username} />
    <form className="form card" action={changePasswordAction} autoComplete="off">
      <h2>Change password</h2><input type="hidden" name="csrf" value={user.csrfToken} />
      <label htmlFor="current">Current password</label><input id="current" name="current" type="password" autoComplete="current-password" maxLength="128" required />
      <label htmlFor="new-password">New password</label><input id="new-password" name="password" type="password" autoComplete="new-password" minLength="10" maxLength="128" required />
      <label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" name="confirm" type="password" autoComplete="new-password" maxLength="128" required />
      <p className="hint">At least 10 characters. Other active sessions will be signed out.</p><button className="btn btn-primary" type="submit">Change password</button>
    </form>
    {!user.isRoot && <form className="form card danger" action={deleteAccountAction}>
      <h2>Delete account</h2><p>This permanently removes your account and its posts. It cannot be undone.</p>
      <input type="hidden" name="csrf" value={user.csrfToken} />
      <label htmlFor="delete-password">Confirm with your password</label><input id="delete-password" name="password" type="password" autoComplete="current-password" maxLength="128" required />
      <button className="btn btn-danger" type="submit">Delete my account</button>
    </form>}
    <section className="card">
      <h2>My forum threads</h2><p className="muted">Threads you created are public and appear in their forums.</p>
      {threads?.length ? <ul className="fc-thread-list">{threads.map((thread) => {
        const category = Array.isArray(thread.categories) ? thread.categories[0] : thread.categories;
        return category ? <li className="fc-thread-row" key={thread.id}><div className="fc-thread-main"><h3><a href={`/forum/thread/${thread.id}`}>{thread.title}</a></h3><p className="muted"><a href={`/forum/${category.slug}`}>{category.name}</a> · {thread.reply_count} replies · {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(Number(thread.created_at))}</p></div></li> : null;
      })}</ul> : <p className="empty">You have not started any threads yet. <a href="/forum/post-thread">Browse forums</a>.</p>}
    </section>
  </div>;
}
