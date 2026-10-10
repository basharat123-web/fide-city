'use strict';
const { html } = require('../lib/html');
const { page, csrfField, fmtDateTime, timeAgo } = require('./layout');
const { getRoleMeta } = require('../lib/roles');

const isStaff = (u) => u && ['mod', 'admin', 'root_admin'].includes(u.role);

const roleBadge = (u) => {
  const meta = getRoleMeta(u);
  return html`<span class="badge" style="background: ${meta.color}25; border: 1px solid ${meta.color}77; color: ${meta.color}; font-weight: 700; font-size: 0.72rem; letter-spacing: 0.03em;">${meta.icon} ${meta.name}</span>`;
};

function crumbs(items) {
  return html`<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.map((i, idx) =>
    i.href && idx < items.length - 1 ? html`<li><a href="${i.href}">${i.label}</a></li>` : html`<li aria-current="page">${i.label}</li>`
  )}</ol></nav>`;
}

function pager(base, pageNo, pages) {
  if (pages <= 1) return '';
  const link = (n, label, cur) =>
    cur ? html`<li><span class="current" aria-current="page">${label}</span></li>` : html`<li><a href="${base}?page=${n}">${label}</a></li>`;
  const items = [];
  const start = Math.max(1, pageNo - 2);
  const end = Math.min(pages, pageNo + 2);
  if (pageNo > 1) items.push(link(pageNo - 1, 'Previous', false));
  for (let n = start; n <= end; n++) items.push(link(n, String(n), n === pageNo));
  if (pageNo < pages) items.push(link(pageNo + 1, 'Next', false));
  return html`<nav class="pager" aria-label="Pages"><ul>${items}</ul></nav>`;
}

/* ---------------------------- Forum index ---------------------------- */
function index(ctx, { categories }) {
  const body = html`<div class="wrap">
    <div class="page-head">
      <div>
        <h1 class="page-title">City forum</h1>
        <p class="page-lead">Connect with players, report issues, share ideas and help shape Fide City.</p>
      </div>
      ${ctx.user ? '' : html`<a class="btn btn-primary" href="/register">Join to post</a>`}
    </div>
    <ul class="cat-list">
      ${categories.map(
        (c) => html`<li>
          <div class="cat-main">
            <h2><a href="/forum/${c.slug}">${c.name}</a>${c.staff_only ? html` <span class="badge">Staff</span>` : ''}${c.locked ? html` <span class="badge badge-quiet">Staff start threads</span>` : ''}</h2>
            <p>${c.description}</p>
          </div>
          <dl class="cat-stats">
            <div><dt>Threads</dt><dd>${c.thread_count}</dd></div>
            <div><dt>Posts</dt><dd>${c.post_count}</dd></div>
          </dl>
          <div class="cat-last">
            ${c.last_title
              ? html`<a href="/forum/thread/${c.last_thread_id}">${c.last_title}</a><span class="muted">${c.last_username} &middot; ${timeAgo(c.last_at)}</span>`
              : html`<span class="muted">No threads yet</span>`}
          </div>
        </li>`
      )}
    </ul>
  </div>`;
  return page(ctx, { title: 'Forum', description: 'The Fide City Roleplay community forum.', active: 'forum', body });
}

/* ----------------------------- Category ------------------------------ */
function category(ctx, { cat, threads, pageNo, pages, canPost }) {
  const body = html`<div class="wrap">
    ${crumbs([{ label: 'Forum', href: '/forum' }, { label: cat.name }])}
    <div class="page-head">
      <div>
        <h1 class="page-title">${cat.name}</h1>
        <p class="page-lead">${cat.description}</p>
      </div>
      ${canPost
        ? html`<a class="btn btn-primary" href="/forum/${cat.slug}/new">New thread</a>`
        : ctx.user
          ? html`<span class="muted">Only staff can start threads here.</span>`
          : html`<a class="btn btn-primary" href="/login">Sign in to post</a>`}
    </div>
    ${threads.length
      ? html`<ul class="thread-list">
          ${threads.map(
            (t) => html`<li${t.pinned ? html` class="is-pinned"` : ''}>
              <div class="thread-main">
                <h2><a href="/forum/thread/${t.id}">${t.title}</a></h2>
                <p class="muted">
                  ${t.pinned ? html`<span class="badge">Pinned</span> ` : ''}${t.locked ? html`<span class="badge badge-quiet">Locked</span> ` : ''}
                  Started by ${t.username} &middot; ${timeAgo(t.created_at)}
                </p>
              </div>
              <div class="thread-stat"><span class="num">${t.reply_count}</span><span class="muted">replies</span></div>
              <div class="thread-last muted">${timeAgo(t.updated_at)}</div>
            </li>`
          )}
        </ul>`
      : html`<p class="empty">No threads here yet. ${canPost ? 'Start the first one.' : ''}</p>`}
    ${pager(`/forum/${cat.slug}`, pageNo, pages)}
  </div>`;
  return page(ctx, { title: cat.name, description: cat.description, active: 'forum', body });
}

/* ------------------------------ Thread ------------------------------- */
function thread(ctx, { t, cat, posts, pageNo, pages, canReply, errors = {}, draft = '' }) {
  const staff = isStaff(ctx.user);
  const body = html`<div class="wrap">
    ${crumbs([{ label: 'Forum', href: '/forum' }, { label: cat.name, href: `/forum/${cat.slug}` }, { label: t.title }])}
    <div class="page-head">
      <div>
        <h1 class="page-title thread-title">${t.title}</h1>
        <p class="muted">${t.pinned ? html`<span class="badge">Pinned</span> ` : ''}${t.locked ? html`<span class="badge badge-quiet">Locked</span> ` : ''}${t.reply_count} ${t.reply_count === 1 ? 'reply' : 'replies'}</p>
      </div>
      ${staff
        ? html`<div class="mod-actions" role="group" aria-label="Moderation">
            <form method="post" action="/forum/thread/${t.id}/pin">${csrfField(ctx)}<button class="btn btn-ghost btn-sm" type="submit">${t.pinned ? 'Unpin' : 'Pin'}</button></form>
            <form method="post" action="/forum/thread/${t.id}/lock">${csrfField(ctx)}<button class="btn btn-ghost btn-sm" type="submit">${t.locked ? 'Unlock' : 'Lock'}</button></form>
            <form method="post" action="/forum/thread/${t.id}/delete" data-confirm="Delete this thread and all its replies?">${csrfField(ctx)}<button class="btn btn-danger btn-sm" type="submit">Delete thread</button></form>
          </div>`
        : ''}
    </div>

    <ol class="posts">
      ${posts.map(
        (p, i) => html`<li class="post" id="post-${p.id}">
          <aside class="post-author">
            ${p.avatar
              ? html`<img class="avatar" src="${p.avatar}" alt="${p.username}" style="object-fit: cover;">`
              : html`<span class="avatar" aria-hidden="true">${p.username.slice(0, 1).toUpperCase()}</span>`}
            <strong>${p.username}</strong>
            ${roleBadge(p)}
          </aside>
          <div class="post-main">
            <header class="post-meta"><time datetime="${new Date(p.created_at).toISOString()}">${fmtDateTime(p.created_at)}</time>${p.id === t.first_post_id ? '' : html` <a href="#post-${p.id}" class="permalink" aria-label="Link to this reply">#${(pageNo - 1) * 20 + i + 1}</a>`}</header>
            <div class="post-body">${p.body}</div>
            ${staff && p.id !== t.first_post_id
              ? html`<form class="post-mod" method="post" action="/forum/post/${p.id}/delete" data-confirm="Delete this reply?">${csrfField(ctx)}<button class="link-btn" type="submit">Delete reply</button></form>`
              : ''}
          </div>
        </li>`
      )}
    </ol>
    ${pager(`/forum/thread/${t.id}`, pageNo, pages)}

    ${canReply
      ? html`<form class="form card reply-form" method="post" action="/forum/thread/${t.id}/reply" id="reply">
          <h2>Reply</h2>
          ${errors.body ? html`<p class="form-error" role="alert">${errors.body}</p>` : ''}
          ${csrfField(ctx)}
          <label for="body" class="sr">Your reply</label>
          <textarea id="body" name="body" rows="6" maxlength="5000" required placeholder="Write your reply. Plain text only.">${draft}</textarea>
          <p class="hint">Plain text. Be respectful and follow the <a href="/rules">rules</a>.</p>
          <button class="btn btn-primary" type="submit">Post reply</button>
        </form>`
      : t.locked
        ? html`<p class="empty">This thread is locked.</p>`
        : ctx.user
          ? ''
          : html`<p class="empty"><a href="/login">Sign in</a> or <a href="/register">create an account</a> to reply.</p>`}
  </div>`;
  return page(ctx, { title: t.title, active: 'forum', body });
}

/* ---------------------------- New thread ----------------------------- */
function newThread(ctx, { cat, errors = {}, values = {} }) {
  const body = html`<div class="wrap prose-wrap">
    ${crumbs([{ label: 'Forum', href: '/forum' }, { label: cat.name, href: `/forum/${cat.slug}` }, { label: 'New thread' }])}
    <h1 class="page-title">New thread in ${cat.name}</h1>
    <form class="form card" method="post" action="/forum/${cat.slug}/new">
      ${errors.form ? html`<p class="form-error banner" role="alert">${errors.form}</p>` : ''}
      ${csrfField(ctx)}
      <div class="field${errors.title ? ' has-error' : ''}">
        <label for="title">Title</label>
        <input id="title" name="title" type="text" maxlength="120" required value="${values.title || ''}">
        ${errors.title ? html`<p class="form-error" role="alert">${errors.title}</p>` : ''}
      </div>
      <div class="field${errors.body ? ' has-error' : ''}">
        <label for="body">Message</label>
        <textarea id="body" name="body" rows="10" maxlength="5000" required>${values.body || ''}</textarea>
        ${errors.body ? html`<p class="form-error" role="alert">${errors.body}</p>` : ''}
        <p class="hint">Plain text only. Up to 5000 characters.</p>
      </div>
      <button class="btn btn-primary" type="submit">Post thread</button>
    </form>
  </div>`;
  return page(ctx, { title: `New thread in ${cat.name}`, active: 'forum', body, robots: 'noindex' });
}

module.exports = { index, category, thread, newThread, isStaff };
