import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '../../lib/next/auth.js';
import { getSupabase } from '../../lib/next/supabase.js';
import { CITY_ROLES, getPermissions, getRoleMeta, getAssignedRoleMeta } from '../../lib/roles.js';
import config from '../../lib/config.js';
import {
  banUserAction,
  changeUserRoleAction,
  createStoryAction,
  deleteStoryAction,
  dismissRecoveryAction,
  recoverUserAction,
  unbanUserAction,
  warnUserAction,
} from './actions.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Staff dashboard', robots: { index: false, follow: false } };

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false,
});
const fmtDate = (value) => dateFmt.format(new Date(Number(value)));
const fmtDateTime = (value) => `${dateTimeFmt.format(new Date(Number(value)))} UTC`;

function Csrf({ token }) {
  return <input type="hidden" name="csrf" value={token} />;
}

function UserId({ id }) {
  return <input type="hidden" name="userId" value={id} />;
}

function CityRole({ person }) {
  const root = person.role === 'root_admin' || person.email?.trim().toLowerCase() === config.rootAdminEmail;
  const meta = root ? getAssignedRoleMeta(person) : getRoleMeta(person);
  return <span className="badge" style={{ background: `${meta.color}25`, border: `1px solid ${meta.color}88`, color: meta.color, fontWeight: 800 }}>
    {root ? '👑 Root Admin · ' : ''}{meta.icon} {meta.name}
  </span>;
}

function RoleEditor({ person, user, tab }) {
  const isRootTarget = person.role === 'root_admin'
    || person.email?.trim().toLowerCase() === config.rootAdminEmail;
  const selected = isRootTarget
    ? person.additional_title || person.staff_title || 'EN | Player'
    : person.staff_title || 'EN | Player';
  const groups = [
    ['Executive Management', CITY_ROLES.filter((role) => role.category === 'Executive')],
    ['Operations & Administration', CITY_ROLES.filter((role) => ['Engineering', 'Operations Head'].includes(role.category))],
    ['Staff & Moderation', CITY_ROLES.filter((role) => ['Senior Staff', 'Field Staff', 'Staff'].includes(role.category))],
    ['City & Faction Leadership', CITY_ROLES.filter((role) => role.category === 'City Leadership')],
    ['Community & Citizens', CITY_ROLES.filter((role) => role.category === 'Community')],
  ];
  return <form action={changeUserRoleAction} className="row-form role-update-form">
    <Csrf token={user.csrfToken} /><UserId id={person.id} />
    <input type="hidden" name="returnTo" value={tab === 'root' ? 'root' : 'admin'} />
    <label className="sr" htmlFor={`role-${person.id}`}>City role for {person.username}</label>
    <select id={`role-${person.id}`} name={isRootTarget ? 'additional_title' : 'title'} defaultValue={selected} className="admin-role-select">
      {groups.map(([label, roles]) => <optgroup label={label} key={label}>
        {roles.map((role) => <option value={role.name} key={role.name}>{role.icon} {role.name}</option>)}
      </optgroup>)}
    </select>
    <button className="btn btn-ghost btn-sm" type="submit">Save role</button>
  </form>;
}

async function count(table, configure) {
  let query = getSupabase().from(table).select('id', { count: 'exact', head: true });
  if (configure) query = configure(query);
  const { count: total, error } = await query;
  if (error) throw new Error(`[admin count ${table}] ${error.message}`);
  return total || 0;
}

async function getUsers(term, limit = 100) {
  const client = getSupabase();
  const columns = 'id, username, email, role, staff_title, additional_title, avatar, created_at, last_login, banned, ban_reason';
  let data;
  if (term) {
    const pattern = `%${term.replace(/[%_\\]/g, '\\$&')}%`;
    const [byName, byEmail] = await Promise.all([
      client.from('users').select(columns).ilike('username', pattern).order('created_at', { ascending: false }).limit(limit),
      client.from('users').select(columns).ilike('email', pattern).order('created_at', { ascending: false }).limit(limit),
    ]);
    if (byName.error) throw new Error(`[admin user search] ${byName.error.message}`);
    if (byEmail.error) throw new Error(`[admin user search] ${byEmail.error.message}`);
    data = [...new Map([...(byName.data || []), ...(byEmail.data || [])].map((person) => [String(person.id), person])).values()]
      .sort((a, b) => Number(b.created_at) - Number(a.created_at)).slice(0, limit);
  } else {
    const result = await client.from('users').select(columns).order('created_at', { ascending: false }).limit(limit);
    if (result.error) throw new Error(`[admin users] ${result.error.message}`);
    data = result.data || [];
  }
  return addWarningCounts(data);
}

async function addWarningCounts(people) {
  if (!people.length) return people;
  const data = [];
  for (let offset = 0; ; offset += 1000) {
    const { data: page, error } = await getSupabase().from('warnings')
      .select('user_id').range(offset, offset + 999);
    if (error) throw new Error(`[admin warning counts] ${error.message}`);
    data.push(...(page || []));
    if (!page || page.length < 1000) break;
  }
  const counts = new Map();
  for (const row of data || []) {
    const key = String(row.user_id);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return people.map((person) => ({ ...person, warning_count: counts.get(String(person.id)) || 0 }));
}

async function overviewData() {
  const [users, threads, posts, newUsers, banned, sessions] = await Promise.all([
    count('users'),
    count('threads', (query) => query.eq('deleted', 0)),
    count('posts', (query) => query.eq('deleted', 0)),
    count('users', (query) => query.gt('created_at', Date.now() - 7 * 86400000)),
    count('users', (query) => query.eq('banned', 1)),
    count('sessions', (query) => query.gt('expires', Date.now())),
  ]);
  return { users, threads, posts, newUsers, banned, sessions };
}

function Tabs({ active, perms }) {
  const entries = [['overview', 'Overview']];
  if (perms.hasFullUsers) entries.push(['users', 'Members']);
  if (perms.hasSystemPanel) entries.push(['system', 'System & DB']);
  if (perms.hasNews) entries.push(['stories', 'News']);
  if (perms.hasAuditLog) entries.push(['audit', 'Security log']);
  return <nav className="tabs" aria-label="Staff sections"><ul>
    {entries.map(([key, label]) => <li key={key}><a href={`/admin?tab=${key}`} aria-current={active === key ? 'page' : undefined}>{label}</a></li>)}
  </ul></nav>;
}

function Overview({ stats }) {
  return <>
    <dl className="stat-grid">
      <div><dt>Members</dt><dd>{stats.users}</dd></div>
      <div><dt>Threads</dt><dd>{stats.threads}</dd></div>
      <div><dt>Replies</dt><dd>{stats.posts}</dd></div>
      <div><dt>New members (7 days)</dt><dd>{stats.newUsers}</dd></div>
      <div><dt>Banned</dt><dd>{stats.banned}</dd></div>
      <div><dt>Active sessions</dt><dd>{stats.sessions}</dd></div>
    </dl>
    <p className="muted">Staff permissions follow the configured role hierarchy. Actions are recorded in the Supabase security audit log.</p>
  </>;
}

function UserTable({ people, user, perms, term }) {
  const root = user.isRoot;
  return <>
    <form className="inline-search" method="get" action="/admin" role="search">
      <input type="hidden" name="tab" value="users" />
      <label className="sr" htmlFor="admin-user-search">Search members</label>
      <input id="admin-user-search" name="q" type="search" value={term} maxLength={40} placeholder="Search username or email" />
      <button className="btn btn-ghost" type="submit">Search</button>
    </form>
    <div className="table-scroll"><table className="data">
      <thead><tr><th scope="col">Member</th><th scope="col">Role &amp; title</th><th scope="col">Joined</th><th scope="col">Last sign-in</th><th scope="col">Actions</th></tr></thead>
      <tbody>{people.map((person) => <tr key={person.id}>
        <th scope="row"><strong>{person.username}</strong><br /><span className="muted">{person.email}</span>
          {person.banned ? <><br /><span className="badge badge-danger">Banned</span> <span className="muted">{person.ban_reason || ''}</span></> : null}
          {person.warning_count ? <><br /><span className="badge">⚠️ {person.warning_count} {person.warning_count === 1 ? 'Warning' : 'Warnings'}</span></> : null}
        </th>
        <td><CityRole person={person} /></td><td>{fmtDate(person.created_at)}</td>
        <td>{person.last_login ? fmtDateTime(person.last_login) : 'Never'}</td>
        <td className="actions">
          {Number(person.id) === Number(user.id)
            ? root ? <RoleEditor person={person} user={user} tab="admin" /> : <span className="muted">You</span>
            : <>
              {person.banned
                ? perms.canUnban ? <form action={unbanUserAction}><Csrf token={user.csrfToken} /><UserId id={person.id} /><button className="btn btn-ghost btn-sm" type="submit">Unban</button></form> : null
                : person.role === 'root_admin' || person.email?.trim().toLowerCase() === config.rootAdminEmail
                  ? <span className="muted">Protected</span>
                  : perms.canBan && (person.role !== 'admin' || root)
                    ? <form action={banUserAction} className="row-form"><Csrf token={user.csrfToken} /><UserId id={person.id} /><label className="sr" htmlFor={`ban-${person.id}`}>Ban reason</label><input id={`ban-${person.id}`} name="reason" maxLength={200} placeholder="Ban reason" required /><button className="btn btn-danger btn-sm" type="submit">Ban</button></form>
                    : null}
              {perms.canWarn && person.role !== 'root_admin' && person.email?.trim().toLowerCase() !== config.rootAdminEmail
                ? <form action={warnUserAction} className="row-form"><Csrf token={user.csrfToken} /><UserId id={person.id} /><label className="sr" htmlFor={`warn-${person.id}`}>Warning reason</label><input id={`warn-${person.id}`} name="reason" maxLength={200} placeholder="Reason" required /><button className="btn btn-ghost btn-sm" type="submit">Warn</button></form>
                : null}
              {perms.canRecoverAccount
                ? <form action={recoverUserAction}><Csrf token={user.csrfToken} /><UserId id={person.id} /><button className="btn btn-ghost btn-sm" type="submit" title="Generate temporary recovery OTP">🔑 Recover</button></form>
                : null}
              {perms.canChangeRole && (person.role !== 'root_admin' || root) ? <RoleEditor person={person} user={user} tab="admin" /> : null}
            </>}
        </td>
      </tr>)}</tbody>
    </table></div>
    {!people.length ? <p className="empty">No accounts found.</p> : null}
  </>;
}

async function Stories({ user, error }) {
  const { data: stories, error: queryError } = await getSupabase().from('stories')
    .select('id, slug, title, created_at').order('created_at', { ascending: false }).limit(100);
  if (queryError) throw new Error(`[admin stories] ${queryError.message}`);
  return <>
    <form className="form card" action={createStoryAction}>
      <h2>Publish news</h2>
      {error ? <p className="form-error banner" role="alert">Add a title, a short summary and at least 20 characters of story.</p> : null}
      <Csrf token={user.csrfToken} />
      <label htmlFor="story-title">Title</label><input id="story-title" name="title" maxLength={120} required />
      <label htmlFor="story-summary">Short summary</label><input id="story-summary" name="summary" maxLength={200} required />
      <label htmlFor="story-body">Story</label><textarea id="story-body" name="body" rows={10} maxLength={10000} required />
      <p className="hint">Plain text. Leave a blank line between paragraphs.</p>
      <button className="btn btn-primary" type="submit">Publish</button>
    </form>
    <h2 className="sub-title">Published</h2>
    {stories?.length ? <ul className="admin-list">{stories.map((story) => <li key={story.id}>
      <div><a href={`/news/${story.slug}`}>{story.title}</a> <span className="muted">{fmtDate(story.created_at)}</span></div>
      <form action={deleteStoryAction}><Csrf token={user.csrfToken} /><input type="hidden" name="storyId" value={story.id} />
        <button className="btn btn-danger btn-sm" type="submit">Delete</button></form>
    </li>)}</ul> : <p className="empty">No stories yet.</p>}
  </>;
}

async function AuditLog() {
  const { data: rows, error } = await getSupabase().from('audit_log')
    .select('id, user_id, action, detail, ip, created_at')
    .order('id', { ascending: false }).limit(200);
  if (error) throw new Error(`[admin audit log] ${error.message}`);
  const userIds = [...new Set((rows || []).map((row) => row.user_id).filter(Boolean))];
  let names = new Map();
  if (userIds.length) {
    const result = await getSupabase().from('users').select('id, username').in('id', userIds);
    if (result.error) throw new Error(`[admin audit log users] ${result.error.message}`);
    names = new Map((result.data || []).map((person) => [String(person.id), person.username]));
  }
  return <><div className="table-scroll"><table className="data">
    <thead><tr><th scope="col">When</th><th scope="col">Member</th><th scope="col">Action</th><th scope="col">Detail</th><th scope="col">IP</th></tr></thead>
    <tbody>{(rows || []).map((row) => <tr key={row.id}>
      <td>{fmtDateTime(row.created_at)}</td><td>{names.get(String(row.user_id)) || ''}</td>
      <td><code>{row.action}</code></td><td>{row.detail || ''}</td><td>{row.ip || ''}</td>
    </tr>)}</tbody>
  </table></div><p className="muted">Entries older than 90 days are removed automatically.</p></>;
}

async function SystemPanel() {
  const [users, threads, posts] = await Promise.all([
    count('users'),
    count('threads', (query) => query.eq('deleted', 0)),
    count('posts', (query) => query.eq('deleted', 0)),
  ]);
  return <div className="card">
    <h2>Technical &amp; Database Operations</h2>
    <p className="muted">This App Router dashboard reads and writes Supabase directly. Local database controls are not available here.</p>
    <dl className="stat-grid">
      <div><dt>Total citizens</dt><dd>{users}</dd></div>
      <div><dt>Active threads</dt><dd>{threads}</dd></div>
      <div><dt>Total posts</dt><dd>{posts}</dd></div>
      <div><dt>Storage</dt><dd>Managed by Supabase</dd></div>
      <div><dt>Cloud status</dt><dd style={{ color: '#4ade80' }}>Supabase active</dd></div>
    </dl>
    <a className="btn btn-ghost btn-sm" href="/api/status" target="_blank" rel="noreferrer">View API health endpoint</a>
  </div>;
}

export default async function AdminPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!['mod', 'admin', 'root_admin'].includes(user.role)) notFound();
  const perms = getPermissions(user);
  if (!perms.hasAdminPanel) return <div className="wrap"><h1 className="page-title">Staff dashboard</h1><p className="banner">Access denied. Your staff tier operates directly on forum sections.</p></div>;

  const params = await searchParams;
  let tab = params?.tab || 'overview';
  if (!['overview', 'users', 'stories', 'audit', 'system'].includes(tab)) tab = 'overview';
  if ((tab === 'users' && !perms.hasFullUsers)
      || (tab === 'stories' && !perms.hasNews)
      || (tab === 'audit' && !perms.hasAuditLog)
      || (tab === 'system' && !perms.hasSystemPanel)) tab = 'overview';

  const cookieStore = await cookies();
  const storedRecovery = params?.recovery === '1' ? cookieStore.get('fc_admin_recovery')?.value : '';
  const recoveryValue = storedRecovery || '';
  const content = tab === 'overview'
    ? <Overview stats={await overviewData()} />
    : tab === 'users'
      ? <UserTable people={await getUsers(sec.cleanLine(params?.q || '', 40))} user={user} perms={perms} term={sec.cleanLine(params?.q || '', 40)} />
      : tab === 'stories'
        ? <Stories user={user} error={params?.error === 'story'} />
        : tab === 'audit'
          ? await AuditLog()
          : await SystemPanel();

  return <div className="wrap">
    <h1 className="page-title">Staff dashboard</h1>
    {recoveryValue && params?.recovery === '1'
      ? <RecoveryNotice token={user.csrfToken} value={recoveryValue} />
      : params?.notice ? <p className="banner" role="status">{params.notice}</p> : null}
    <Tabs active={tab} perms={perms} />
    <div className="admin-panel">{content}</div>
  </div>;
}

function RecoveryNotice({ token, value }) {
  const separator = value.lastIndexOf('|');
  const username = separator < 0 ? '' : value.slice(0, separator);
  const otp = separator < 0 ? '' : value.slice(separator + 1);
  return <div className="card" role="status">
    <p>Temporary recovery OTP generated for <strong>{username}</strong> (valid for 15 minutes): <code>{otp}</code></p>
    <form action={dismissRecoveryAction}><Csrf token={token} /><button className="btn btn-ghost btn-sm" type="submit">Dismiss recovery code</button></form>
  </div>;
}
