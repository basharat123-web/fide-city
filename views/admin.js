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

function users(ctx, { list, q }) {
  const isAdmin = ctx.user.role === 'admin';
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
          <td>${u.role}${u.staff_title ? html`<br><span class="muted">${u.staff_title}</span>` : ''}</td>
          <td>${fmtDate(u.created_at)}</td>
          <td>${u.last_login ? fmtDateTime(u.last_login) : 'Never'}</td>
          <td class="actions">
            ${u.id === ctx.user.id
              ? html`<span class="muted">You</span>`
              : html`
                ${u.banned
                  ? html`<form method="post" action="/admin/users/${u.id}/unban">${csrfField(ctx)}<button class="btn btn-ghost btn-sm" type="submit">Unban</button></form>`
                  : u.role === 'member' || isAdmin
                    ? html`<form method="post" action="/admin/users/${u.id}/ban" class="row-form">${csrfField(ctx)}<label class="sr" for="reason-${u.id}">Ban reason</label><input id="reason-${u.id}" name="reason" placeholder="Reason" maxlength="200" required><button class="btn btn-danger btn-sm" type="submit">Ban</button></form>`
                    : ''}
                ${isAdmin
                  ? html`<form method="post" action="/admin/users/${u.id}/role" class="row-form">${csrfField(ctx)}
                      <label class="sr" for="role-${u.id}">Role</label>
                      <select id="role-${u.id}" name="role">
                        ${['member', 'mod', 'admin'].map((r) => html`<option value="${r}"${u.role === r ? html` selected` : ''}>${r}</option>`)}
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
  const isAdmin = ctx.user.role === 'admin';
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

module.exports = { dashboard };
