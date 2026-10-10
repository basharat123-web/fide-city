'use strict';
const { html } = require('../lib/html');
const { page, csrfField, fmtDate, fmtDateTime } = require('./layout');

function tabs(active, isAdmin) {
  const items = [
    ['overview', 'Overview'],
    ['users', 'Members'],
    ...(isAdmin ? [['stories', 'News'], ['audit', 'Security log']] : []),
  ];
  return html`<nav class="tabs" aria-label="Staff sections"><ul>
    ${items.map(([k, label]) => html`<li><a href="/admin?tab=${k}"${active === k ? html` aria-current="page"` : ''}>${label}</a></li>`)}
  </ul></nav>`;
}

function overview(ctx, { stats }) {
  return html`<dl class="stat-grid">
    <div><dt>Members</dt><dd>${stats.users}</dd></div>
    <div><dt>Threads</dt><dd>${stats.threads}</dd></div>
    <div><dt>Replies</dt><dd>${stats.posts}</dd></div>
    <div><dt>New members (7 days)</dt><dd>${stats.newUsers}</dd></div>
    <div><dt>Banned</dt><dd>${stats.banned}</dd></div>
    <div><dt>Active sessions</dt><dd>${stats.sessions}</dd></div>
  </dl>
  <p class="muted">Moderators can pin, lock and delete threads and replies on the forum, and ban members from the Members tab. Admins can also manage roles, news and the security log.</p>`;
}

function roleBadge(role) {
  if (role === 'root_admin') return html`<span class="badge badge-root">👑 Root Admin</span>`;
  if (role === 'admin') return html`<span class="badge badge-admin">Admin</span>`;
  if (role === 'mod') return html`<span class="badge badge-mod">Moderator</span>`;
  return html`<span class="badge badge-quiet">Member</span>`;
}

function users(ctx, { list, q }) {
  const isRoot = ctx.user.role === 'root_admin';
  const isAdmin = ctx.user.role === 'admin' || isRoot;
  return html`<form class="inline-search" method="get" action="/admin" role="search">
      <input type="hidden" name="tab" value="users">
      <label for="q" class="sr">Search members</label>
      <input id="q" name="q" type="search" value="${q}" placeholder="Search username or email" maxlength="40">
      <button class="btn btn-ghost" type="submit">Search</button>
    </form>
    <div class="table-scroll">
    <table class="data">
      <thead><tr><th scope="col">Member</th><th scope="col">Role</th><th scope="col">Joined</th><th scope="col">Last sign-in</th><th scope="col">Actions</th></tr></thead>
      <tbody>
      ${list.map(
        (u) => html`<tr>
          <th scope="row"><strong>${u.username}</strong><br><span class="muted">${u.email}</span>${u.banned ? html`<br><span class="badge badge-danger">Banned</span> <span class="muted">${u.ban_reason || ''}</span>` : ''}</th>
          <td>${roleBadge(u.role)}${u.staff_title ? html`<br><span class="muted">${u.staff_title}</span>` : ''}</td>
          <td>${fmtDate(u.created_at)}</td>
          <td>${u.last_login ? fmtDateTime(u.last_login) : 'Never'}</td>
          <td class="actions">
            ${u.id === ctx.user.id
              ? html`<span class="muted">You</span>`
              : html`
                ${u.banned
                  ? (isRoot || u.role === 'member' || (u.role === 'mod' && isAdmin))
                    ? html`<form method="post" action="/admin/users/${u.id}/unban">${csrfField(ctx)}<button class="btn btn-ghost btn-sm" type="submit">Unban</button></form>`
                    : ''
                  : u.role === 'root_admin'
                    ? html`<span class="muted">Protected</span>`
                    : (u.role === 'member' || (u.role === 'mod' && isAdmin) || (u.role === 'admin' && isRoot))
                      ? html`<form method="post" action="/admin/users/${u.id}/ban" class="row-form">${csrfField(ctx)}<label class="sr" for="reason-${u.id}">Ban reason</label><input id="reason-${u.id}" name="reason" placeholder="Reason" maxlength="200" required><button class="btn btn-danger btn-sm" type="submit">Ban</button></form>`
                      : ''}
                ${(isRoot || (isAdmin && u.role !== 'admin' && u.role !== 'root_admin'))
                  ? html`<form method="post" action="/admin/users/${u.id}/role" class="row-form">${csrfField(ctx)}
                      <label class="sr" for="role-${u.id}">Role</label>
                      <select id="role-${u.id}" name="role">
                        ${(isRoot ? ['member', 'mod', 'admin', 'root_admin'] : ['member', 'mod']).map((r) => html`<option value="${r}"${u.role === r ? html` selected` : ''}>${r}</option>`)}
                      </select>
                      <label class="sr" for="title-${u.id}">Staff title</label>
                      <input id="title-${u.id}" name="title" value="${u.staff_title || ''}" placeholder="Staff title" maxlength="40">
                      <button class="btn btn-ghost btn-sm" type="submit">Save</button>
                    </form>`
                  : ''}`}
          </td>
        </tr>`
      )}
      </tbody>
    </table></div>`;
}

function stories(ctx, { list, errors = {}, values = {} }) {
  return html`<form class="form card" method="post" action="/admin/stories">
      <h2>Publish news</h2>
      ${errors.form ? html`<p class="form-error banner" role="alert">${errors.form}</p>` : ''}
      ${csrfField(ctx)}
      <label for="s-title">Title</label>
      <input id="s-title" name="title" maxlength="120" required value="${values.title || ''}">
      <label for="s-summary">Short summary</label>
      <input id="s-summary" name="summary" maxlength="200" required value="${values.summary || ''}">
      <label for="s-body">Story</label>
      <textarea id="s-body" name="body" rows="10" maxlength="10000" required>${values.body || ''}</textarea>
      <p class="hint">Plain text. Leave a blank line between paragraphs.</p>
      <button class="btn btn-primary" type="submit">Publish</button>
    </form>
    <h2 class="sub-title">Published</h2>
    ${list.length
      ? html`<ul class="admin-list">
          ${list.map((s) => html`<li><div><a href="/news/${s.slug}">${s.title}</a><span class="muted"> ${fmtDate(s.created_at)}</span></div>
            <form method="post" action="/admin/stories/${s.id}/delete" data-confirm="Delete this story?">${csrfField(ctx)}<button class="btn btn-danger btn-sm" type="submit">Delete</button></form></li>`)}
        </ul>`
      : html`<p class="empty">No stories yet.</p>`}`;
}

function audit(ctx, { rows }) {
  return html`<div class="table-scroll"><table class="data">
    <thead><tr><th scope="col">When</th><th scope="col">Member</th><th scope="col">Action</th><th scope="col">Detail</th><th scope="col">IP</th></tr></thead>
    <tbody>
      ${rows.map((r) => html`<tr><td>${fmtDateTime(r.created_at)}</td><td>${r.username || ''}</td><td><code>${r.action}</code></td><td>${r.detail || ''}</td><td>${r.ip || ''}</td></tr>`)}
    </tbody></table></div>
    <p class="muted">Entries older than 90 days are removed automatically.</p>`;
}

function dashboard(ctx, { tab, data }) {
  const isAdmin = ['admin', 'root_admin'].includes(ctx.user.role);
  let inner;
  if (tab === 'users') inner = users(ctx, data);
  else if (tab === 'stories') inner = stories(ctx, data);
  else if (tab === 'audit') inner = audit(ctx, data);
  else inner = overview(ctx, data);
  const body = html`<div class="wrap">
    <h1 class="page-title">Staff dashboard</h1>
    ${tabs(tab, isAdmin)}
    <div class="admin-panel">${inner}</div>
  </div>`;
  return page(ctx, { title: 'Staff dashboard', body, robots: 'noindex, nofollow' });
}

const { CITY_ROLES, getRoleMeta } = require('../lib/roles');

function cityRoleBadge(u) {
  const meta = getRoleMeta(u);
  const isPrimaryPlayer = meta.name === 'EN | Player';
  return html`
    <span class="badge" style="background: ${meta.color}25; border: 1.5px solid ${meta.color}88; color: ${meta.color}; font-weight: 800; font-size: 0.76rem; letter-spacing: 0.03em;">${meta.icon} ${meta.name}</span>
    ${!isPrimaryPlayer
      ? html`<span class="badge" style="background: rgba(244, 63, 94, 0.18); border: 1.5px solid rgba(244, 63, 94, 0.5); color: #f43f5e; font-weight: 800; font-size: 0.74rem; letter-spacing: 0.02em;">🎮 EN | Player</span>`
      : ''}
  `;
}

function rootConsole(ctx, { list, q = '', filterRole = 'all', stats = {} }) {
  const filterBtns = [
    ['all', `All (${stats.users || 0})`],
    ['root_admin', `👑 Executive (${stats.roots || 0})`],
    ['admin', `🛡️ Admins (${stats.admins || 0})`],
    ['mod', `⚔️ Staff (${stats.mods || 0})`],
    ['leadership', `🏛️ City Leaders`],
    ['member', `🎮 EN | Players (${stats.players !== undefined ? stats.players : stats.users || 0})`],
    ['banned', `🚫 Blocked (${stats.banned || 0})`],
  ];

  const body = html`<div class="wrap">
    <div class="root-header-banner">
      <div class="root-header-info">
        <h1><span>👑</span> Root Administrator Console</h1>
        <p>Master Control Center • Manage citizen accounts, Discord city roles & security blocks.</p>
      </div>
      <div>
        <a class="btn btn-ghost btn-sm" href="/api/sync" target="_blank" style="border-color: rgba(248, 192, 64, 0.4); color: #ffd700;">🔄 Sync Cloud (Supabase)</a>
      </div>
    </div>

    <div class="root-metrics-grid">
      <div class="root-metric-card gold">
        <div class="label">Total Accounts</div>
        <div class="val">${stats.users || 0}</div>
      </div>
      <div class="root-metric-card magenta">
        <div class="label">Root Administrators</div>
        <div class="val">${stats.roots || 0}</div>
      </div>
      <div class="root-metric-card purple">
        <div class="label">Staff (Admins & Mods)</div>
        <div class="val">${(stats.admins || 0) + (stats.mods || 0)}</div>
      </div>
      <div class="root-metric-card danger">
        <div class="label">Blocked / Banned</div>
        <div class="val">${stats.banned || 0}</div>
      </div>
    </div>

    <div class="root-controls-bar">
      <div class="role-filter-group">
        ${filterBtns.map(([key, label]) => html`<a class="role-filter-btn${filterRole === key ? ' active' : ''}" href="/admin/root?role=${key}${q ? `&q=${encodeURIComponent(q)}` : ''}">${label}</a>`)}
      </div>

      <form class="inline-search" method="get" action="/admin/root" role="search" style="margin: 0;">
        <input type="hidden" name="role" value="${filterRole}">
        <label for="q-root" class="sr">Search accounts</label>
        <input id="q-root" name="q" type="search" value="${q}" placeholder="Search username or email..." maxlength="40" style="padding: 0.45rem 0.8rem; border-radius: 999px;">
        <button class="btn btn-ghost btn-sm" type="submit">Search</button>
      </form>
    </div>

    <div class="root-users-list">
      ${list.length === 0
        ? html`<div class="card center" style="padding: 3rem;"><p class="muted" style="margin:0; font-size: 1.1rem;">No accounts found matching your query.</p></div>`
        : list.map((u) => html`
          <div class="root-user-card ${u.role === 'root_admin' ? 'is-root' : ''} ${u.banned ? 'is-banned' : ''}">
            <div class="user-card-bio">
              <div class="user-avatar-circle" style="${u.avatar ? 'overflow: hidden; padding: 0;' : ''}">
                ${u.avatar
                  ? html`<img src="${u.avatar}" alt="${u.username}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
                  : (u.role === 'root_admin' ? '👑' : u.username.slice(0, 1).toUpperCase())}
              </div>
              <div class="user-details">
                <h3>
                  <span>${u.username}</span>
                  ${u.id === ctx.user.id ? html`<span class="badge badge-gold" style="font-size: 0.72rem;">YOU</span>` : ''}
                </h3>
                <div class="email-sub">${u.email}</div>
                <div class="meta-tags">
                  ${cityRoleBadge(u)}
                  <span class="muted" style="font-size: 0.82rem;">Joined: ${fmtDate(u.created_at)}</span>
                  <span class="muted" style="font-size: 0.82rem;">Last active: ${u.last_login ? fmtDateTime(u.last_login) : 'Never'}</span>
                </div>
                ${u.banned ? html`<div class="ban-alert-box"><strong>🚫 BLOCKED:</strong> ${u.ban_reason || 'No reason specified'}</div>` : ''}
              </div>
            </div>

            <div class="user-card-actions">
              <!-- City Role Selector Form -->
              <form method="post" action="/admin/users/${u.id}/role" class="role-update-form">
                ${csrfField(ctx)}
                <label class="sr" for="role-sel-${u.id}">City Role</label>
                <select id="role-sel-${u.id}" name="title" style="font-weight: 700; max-width: 240px;">
                  <optgroup label="🛡️ Executive & Administrators">
                    ${CITY_ROLES.filter((r) => r.category === 'Executive' && (u.email && u.email.toLowerCase().trim() === 'basharathussain.mail@gmail.com' ? true : r.systemRole !== 'root_admin')).map((r) => html`<option value="${r.name}"${(u.staff_title || '') === r.name ? html` selected` : ''}>${r.icon} ${r.name}</option>`)}
                  </optgroup>
                  <optgroup label="⚔️ Staff & Administration">
                    ${CITY_ROLES.filter((r) => r.category === 'Staff').map((r) => html`<option value="${r.name}"${u.staff_title === r.name ? html` selected` : ''}>${r.icon} ${r.name}</option>`)}
                  </optgroup>
                  <optgroup label="🏛️ City & Faction Leadership">
                    ${CITY_ROLES.filter((r) => r.category === 'City Leadership').map((r) => html`<option value="${r.name}"${u.staff_title === r.name ? html` selected` : ''}>${r.icon} ${r.name}</option>`)}
                  </optgroup>
                  <optgroup label="🎮 Community & Players">
                    ${CITY_ROLES.filter((r) => r.category === 'Community').map((r) => html`<option value="${r.name}"${(u.staff_title || 'EN | Player') === r.name ? html` selected` : ''}>${r.icon} ${r.name}</option>`)}
                  </optgroup>
                </select>
                <button class="btn btn-ghost btn-sm" type="submit">Save Role</button>
              </form>

              <!-- Ban / Unban Form -->
              ${u.id === ctx.user.id
                ? html`<span class="muted" style="font-size: 0.82rem;">Account is protected (Your own account)</span>`
                : u.banned
                  ? html`<form method="post" action="/admin/users/${u.id}/unban" class="ban-action-form">
                      ${csrfField(ctx)}
                      <button class="btn btn-ghost btn-sm" type="submit" style="color: #4ade80; border-color: rgba(74, 222, 128, 0.4);">
                        ✅ Unblock Account
                      </button>
                    </form>`
                  : html`<form method="post" action="/admin/users/${u.id}/ban" class="ban-action-form">
                      ${csrfField(ctx)}
                      <label class="sr" for="ban-rsn-${u.id}">Block reason</label>
                      <input id="ban-rsn-${u.id}" name="reason" placeholder="Reason for block..." maxlength="200" required>
                      <button class="btn btn-danger btn-sm" type="submit">
                        🚫 Block
                      </button>
                    </form>`}
            </div>
          </div>`
        )}
    </div>
  </div>`;

  return page(ctx, { title: 'Root Master Console | Fide City', body, robots: 'noindex, nofollow' });
}

module.exports = { dashboard, rootConsole };

