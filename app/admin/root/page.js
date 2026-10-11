import { notFound, redirect } from 'next/navigation';
import config from '../../../lib/config.js';
import { getCurrentUser } from '../../../lib/next/auth.js';
import { getSupabase } from '../../../lib/next/supabase.js';
import { CITY_ROLES, getPermissions } from '../../../lib/roles.js';
import { banUserAction, changeUserRoleAction, unbanUserAction } from '../actions.js';
import { getRootUsers } from '../data.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Root administrator console', robots: { index: false, follow: false } };

function Csrf({ token }) {
  return <input type="hidden" name="csrf" value={token} />;
}

function UserId({ id }) {
  return <input type="hidden" name="userId" value={id} />;
}

function RoleEditor({ person, user }) {
  const title = person.additional_title || person.staff_title || 'EN | Player';
  return <form action={changeUserRoleAction} className="role-update-form">
    <Csrf token={user.csrfToken} /><UserId id={person.id} /><input type="hidden" name="returnTo" value="root" />
    <label className="sr" htmlFor={`root-role-${person.id}`}>City role for {person.username}</label>
    <select id={`root-role-${person.id}`} name="additional_title" defaultValue={title}>
      {CITY_ROLES.map((role) => <option value={role.name} key={role.name}>{role.icon} {role.name}</option>)}
    </select>
    <button className="btn btn-ghost btn-sm" type="submit">Save role</button>
  </form>;
}

async function Stats() {
  const client = getSupabase();
  async function count(query) {
    const { count, error } = await query;
    if (error) throw new Error(`[root console stats] ${error.message}`);
    return count || 0;
  }
  const [users, roots, admins, mods, players, banned] = await Promise.all([
    count(client.from('users').select('id', { count: 'exact', head: true })),
    count(client.from('users').select('id', { count: 'exact', head: true }).eq('role', 'root_admin')),
    count(client.from('users').select('id', { count: 'exact', head: true }).eq('role', 'admin')),
    count(client.from('users').select('id', { count: 'exact', head: true }).eq('role', 'mod')),
    count(client.from('users').select('id', { count: 'exact', head: true }).eq('banned', 0)),
    count(client.from('users').select('id', { count: 'exact', head: true }).eq('banned', 1)),
  ]);
  return { users, roots, admins, mods, players, banned };
}

function Search({ role, query }) {
  return <form className="inline-search" method="get" action="/admin/root" role="search">
    <input type="hidden" name="role" value={role} />
    <label className="sr" htmlFor="root-search">Search accounts</label>
    <input id="root-search" name="q" type="search" value={query} maxLength={40} placeholder="Search username or email..." />
    <button className="btn btn-ghost btn-sm" type="submit">Search</button>
  </form>;
}

export default async function RootAdminPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.isRoot !== true || user.email?.trim().toLowerCase() !== config.rootAdminEmail) notFound();
  const permissions = getPermissions(user);
  if (!permissions.hasRootConsole) notFound();

  const params = await searchParams;
  const query = (params?.q || '').replace(/[^\p{L}\p{N}_@.+ -]/gu, '').trim().slice(0, 40);
  const allowedFilters = ['all', 'root_admin', 'admin', 'mod', 'leadership', 'member', 'banned'];
  const filterRole = allowedFilters.includes(params?.role) ? params.role : 'all';
  const [stats, list] = await Promise.all([Stats(), getRootUsers(query, filterRole)]);
  const filters = [
    ['all', `All (${stats.users})`], ['root_admin', `👑 Executive (${stats.roots})`],
    ['admin', `🛡️ Admins (${stats.admins})`], ['mod', `⚔️ Staff (${stats.mods})`],
    ['leadership', '🏛️ City Leaders'], ['member', `🎮 EN | Players (${stats.players})`],
    ['banned', `🚫 Blocked (${stats.banned})`],
  ];

  return <div className="wrap">
    <div className="root-header-banner">
      <div className="root-header-info"><h1>👑 Root Administrator Console</h1><p>Master Control Center • Manage citizen accounts, roles and security blocks.</p></div>
    </div>
    {params?.notice ? <p className="banner" role="status">{params.notice}</p> : null}
    <div className="root-metrics-grid">
      <div className="root-metric-card gold"><div className="label">Total accounts</div><div className="val">{stats.users}</div></div>
      <div className="root-metric-card magenta"><div className="label">Root administrators</div><div className="val">{stats.roots}</div></div>
      <div className="root-metric-card purple"><div className="label">Staff (admins &amp; mods)</div><div className="val">{stats.admins + stats.mods}</div></div>
      <div className="root-metric-card danger"><div className="label">Blocked / banned</div><div className="val">{stats.banned}</div></div>
    </div>
    <div className="root-controls-bar">
      <div className="role-filter-group">{filters.map(([key, label]) => <a
        className={`role-filter-btn${filterRole === key ? ' active' : ''}`}
        href={`/admin/root?role=${key}${query ? `&q=${encodeURIComponent(query)}` : ''}`} key={key}>{label}</a>)}</div>
      <Search role={filterRole} query={query} />
    </div>
    <div className="root-users-list">
      {!list.length ? <div className="card center"><p className="muted">No accounts found matching your query.</p></div> : list.map((person) => <div
        className={`root-user-card ${person.role === 'root_admin' ? 'is-root' : ''} ${person.banned ? 'is-banned' : ''}`} key={person.id}>
        <div className="user-card-bio">
          <div className="user-avatar-circle">{person.avatar
            ? <img src={person.avatar} alt={person.username} />
            : person.role === 'root_admin' ? '👑' : person.username.slice(0, 1).toUpperCase()}</div>
          <div className="user-details"><h3>{person.username} {Number(person.id) === Number(user.id) ? <span className="badge badge-gold">YOU</span> : null}</h3>
            <div className="email-sub">{person.email}</div>
            <div className="meta-tags"><span className="badge">{person.staff_title || 'EN | Player'}</span>
              <span className="muted">Joined: {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(Number(person.created_at))}</span>
              <span className="muted">Last active: {person.last_login ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(Number(person.last_login)) : 'Never'}</span></div>
            {person.banned ? <div className="ban-alert-box"><strong>🚫 BLOCKED:</strong> {person.ban_reason || 'No reason specified'}</div> : null}
          </div>
        </div>
        <div className="user-card-actions">
          <RoleEditor person={person} user={user} />
          {Number(person.id) === Number(user.id)
            ? <span className="muted">Your own account is protected.</span>
            : person.banned
              ? <form action={unbanUserAction}><Csrf token={user.csrfToken} /><UserId id={person.id} /><input type="hidden" name="returnTo" value="root" /><button className="btn btn-ghost btn-sm" type="submit">✅ Unblock account</button></form>
              : <form action={banUserAction} className="ban-action-form"><Csrf token={user.csrfToken} /><UserId id={person.id} /><input type="hidden" name="returnTo" value="root" /><label className="sr" htmlFor={`root-ban-${person.id}`}>Block reason</label><input id={`root-ban-${person.id}`} name="reason" maxLength={200} placeholder="Reason for block..." required /><button className="btn btn-danger btn-sm" type="submit">🚫 Block</button></form>}
        </div>
      </div>)}
    </div>
  </div>;
}
