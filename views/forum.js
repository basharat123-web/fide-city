'use strict';
const { html } = require('../lib/html');
const { page, csrfField, fmtDateTime, timeAgo } = require('./layout');
const { getRoleMeta, getAssignedRoleMeta, getPermissions } = require('../lib/roles');

const isStaff = (u) => u && ['mod', 'admin', 'root_admin'].includes(u.role);
const canEditForumPost = (u) => u && ['admin', 'root_admin'].includes(u.role);

const roleBadge = (u) => {
  const isRoot = u.role === 'root_admin' || (u.email && String(u.email).toLowerCase().trim() === 'basharathussain.mail@gmail.com');
  const meta = isRoot ? getAssignedRoleMeta(u) : getRoleMeta(u);
  const isPrimaryPlayer = meta.name === 'EN | Player';
  return html`
    ${isRoot ? html`<span class="badge" style="background: rgba(248, 192, 64, 0.18); border: 1px solid rgba(248, 192, 64, 0.6); color: #ffd700; font-weight: 800; font-size: 0.72rem;">👑 Root Admin</span>` : ''}
    <span class="badge" style="background: ${meta.color}25; border: 1px solid ${meta.color}77; color: ${meta.color}; font-weight: 700; font-size: 0.72rem; letter-spacing: 0.03em;">${meta.icon} ${meta.name}</span>
    ${!isPrimaryPlayer
      ? html`<span class="badge" style="background: rgba(244, 63, 94, 0.18); border: 1px solid rgba(244, 63, 94, 0.5); color: #f43f5e; font-weight: 700; font-size: 0.68rem; margin-top: 0.2rem; display: inline-block;">🎮 EN | Player</span>`
      : ''}
  `;
};

function threadStatusBadge(status) {
  if (!status) return '';
  if (status === 'Approved') return html`<span class="badge" style="background: rgba(34, 197, 94, 0.18); border: 1.5px solid #22c55e; color: #4ade80; font-weight: 800; font-size: 0.75rem; margin-right: 0.4rem;">✅ Approved</span>`;
  if (status === 'Rejected') return html`<span class="badge" style="background: rgba(239, 68, 68, 0.18); border: 1.5px solid #ef4444; color: #f87171; font-weight: 800; font-size: 0.75rem; margin-right: 0.4rem;">❌ Rejected</span>`;
  if (status === 'Pending Review') return html`<span class="badge" style="background: rgba(234, 179, 8, 0.18); border: 1.5px solid #eab308; color: #facc15; font-weight: 800; font-size: 0.75rem; margin-right: 0.4rem;">⏳ Pending Review</span>`;
  return html`<span class="badge badge-quiet" style="font-size: 0.75rem; margin-right: 0.4rem;">${status}</span>`;
}

function fmtForumTime(ts) {
  if (!ts) return 'None';
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return 'None';

  const now = new Date();
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  const isToday = now.toDateString() === d.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = yesterday.toDateString() === d.toDateString();

  if (isToday) {
    return `Today at ${timeStr}`;
  }
  if (isYesterday) {
    return `Yesterday at ${timeStr}`;
  }
  if (diffDays < 7 && diffDays >= 0) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `${days[d.getDay()]} at ${timeStr}`;
  }
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${timeStr}`;
}

function threadStatusBadge(status) {
  if (!status) return '';
  const s = String(status).trim();
  const lower = s.toLowerCase();
  if (lower === 'important' || lower === '[important]') {
    return html`<span class="forum-tag tag-important">IMPORTANT</span>`;
  }
  if (lower === 'approved' || lower === '[approved]') {
    return html`<span class="forum-tag tag-approved">Approved</span>`;
  }
  if (lower === 'rejected' || lower === '[rejected]') {
    return html`<span class="forum-tag tag-rejected">Rejected</span>`;
  }
  if (lower === 'reviewed' || lower === '[reviewed]') {
    return html`<span class="forum-tag tag-reviewed">Reviewed</span>`;
  }
  if (lower === 'on consideration' || lower === 'consideration' || lower === '[on consideration]') {
    return html`<span class="forum-tag tag-consideration">On Consideration</span>`;
  }
  if (lower === 'pending review' || lower === 'pending' || lower === '[pending review]') {
    return html`<span class="forum-tag tag-pending">Pending Review</span>`;
  }
  if (lower.includes('state organization')) {
    return html`<span class="forum-tag tag-state-org">(State organization)</span>`;
  }
  return html`<span class="forum-tag tag-default">${s}</span>`;
}

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
function index(ctx, { categories = [], groups = {}, latestPosts = [], onlineData = {} }) {
  const onlineUsers = onlineData.users || [];
  const totalOnline = onlineData.totalOnline || (onlineUsers.length || 2);
  const membersCount = onlineData.membersCount || (onlineUsers.length || 2);
  const guestsCount = onlineData.guestsCount || 0;

  // Group categories if not pre-grouped
  const catGroups = { ...groups };
  if (Object.keys(catGroups).length === 0 && categories.length > 0) {
    for (const c of categories) {
      const g = c.group_name || 'FideCity RolePlay';
      if (!catGroups[g]) catGroups[g] = [];
      catGroups[g].push(c);
    }
  }

  // Pre-defined group order
  const orderedGroupNames = ['FideCity RolePlay', 'GAME SECTION', 'User Communication', 'STAFF SECTION'];
  // Include any extra groups
  for (const k of Object.keys(catGroups)) {
    if (!orderedGroupNames.includes(k)) orderedGroupNames.push(k);
  }

  const body = html`<div class="wrap forum-container">
    <!-- XenForo Sub-navigation Header Bar -->
    <nav class="forum-subnav" aria-label="Forum quick navigation">
      <div class="forum-subnav-left">
        <a href="/forum" class="subnav-link is-active">New posts</a>
        <div class="subnav-dropdown">
          <button type="button" class="subnav-link dropdown-toggle" aria-expanded="false">Find threads <span class="arrow-down">▾</span></button>
          <div class="dropdown-menu">
            <a href="/forum">Your threads</a>
            <a href="/forum">Threads with your posts</a>
            <a href="/forum">Unanswered threads</a>
          </div>
        </div>
        <div class="subnav-dropdown">
          <button type="button" class="subnav-link dropdown-toggle" aria-expanded="false">Watched <span class="arrow-down">▾</span></button>
          <div class="dropdown-menu">
            <a href="/forum">Watched threads</a>
            <a href="/forum">Watched forums</a>
          </div>
        </div>
        <a href="#forum-search-box" class="subnav-link" id="btn-toggle-search">Search forums</a>
        <a href="/forum/mark-read" class="subnav-link">Mark forums read</a>
      </div>
      <div class="forum-subnav-right">
        <a href="/forum" class="btn-subnav-action btn-cyan" title="Latest forum posts">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          <span>NEW POSTS</span>
        </a>
        <a href="/forum/post-thread" class="btn-subnav-action btn-post-thread" title="Start a new thread">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          <span>POST THREAD...</span>
        </a>
        <button type="button" class="btn-subnav-icon" id="toggle-all-sections" title="Expand / Collapse all categories">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>
    </nav>

    <!-- Quick Search Dropdown Container -->
    <div id="forum-search-box" class="forum-quick-search-card" style="display: none;">
      <form class="forum-search-form" method="get" action="/forum">
        <input type="search" name="q" placeholder="Search forum threads, keywords or authors..." maxlength="100">
        <button class="btn btn-primary btn-sm" type="submit">Search</button>
      </form>
    </div>

    <!-- Main 2-Column Grid Layout -->
    <div class="forum-main-grid">
      <!-- Left Column: Categories -->
      <div class="forum-categories-column">
        ${orderedGroupNames.map((gName, gIdx) => {
          const list = catGroups[gName] || [];
          if (!list.length && gName !== 'FideCity RolePlay') return '';
          const groupId = `fc-group-${gIdx}`;

          return html`<section class="fc-category-section" id="${groupId}">
            <header class="fc-section-header">
              <h2 class="fc-section-title">${gName}</h2>
              <button type="button" class="fc-section-collapse" aria-label="Toggle section" data-toggle-target="${groupId}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
              </button>
            </header>

            <div class="fc-section-body">
              ${list.map((c, cIdx) => {
                const isEnglishServer = c.slug === 'english-server';
                const discordRow = (gName === 'FideCity RolePlay' && cIdx === 2) ? html`
                  <a class="fc-cat-row fc-cat-link-row" href="https://discord.gg/fidecity" target="_blank" rel="noopener">
                    <div class="fc-col-icon">
                      <span class="fc-bubble-icon fc-chain-icon">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                      </span>
                    </div>
                    <div class="fc-col-info">
                      <h3 class="fc-cat-title"><span class="fc-cat-link-text">Connect To Official Discord</span></h3>
                      <p class="fc-cat-desc muted">Join the active Fide City Roleplay Discord community for live announcements and tickets.</p>
                    </div>
                    <div class="fc-col-stats">
                      <div class="fc-stat-item"><span class="fc-stat-num">5K+</span><span class="fc-stat-lbl">Members</span></div>
                    </div>
                    <div class="fc-col-last">
                      <span class="fc-discord-badge">discord.gg/fidecity ↗</span>
                    </div>
                  </a>
                ` : '';

                return html`
                  ${discordRow}
                  <div class="fc-cat-row">
                    <div class="fc-col-icon">
                      <span class="fc-bubble-icon">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      </span>
                    </div>
                    <div class="fc-col-info">
                      <h3 class="fc-cat-title">
                        <a href="/forum/${c.slug}">${c.name}</a>
                        ${c.staff_only ? html`<span class="badge badge-staff">Staff</span>` : ''}
                        ${c.locked ? html`<span class="badge badge-quiet">Staff start threads</span>` : ''}
                      </h3>
                      ${isEnglishServer ? html`
                        <div class="fc-subforums-wrap">
                          <span class="fc-subforums-label">Sub-forums <span class="arrow-down">▾</span></span>
                          <span class="fc-subforums-items">
                            <a href="/forum/roleplay-biographies">Role Play biographies</a> &middot;
                            <a href="/forum/bio-corrupt">Corrupt Bio</a> &middot;
                            <a href="/forum/application">Applications</a> &middot;
                            <a href="/forum/complaints">Complaints</a>
                          </span>
                        </div>
                      ` : ''}
                      ${c.description ? html`<p class="fc-cat-desc muted">${c.description}</p>` : ''}
                    </div>
                    <div class="fc-col-stats">
                      <div class="fc-stat-item"><span class="fc-stat-num">${c.thread_count}</span><span class="fc-stat-lbl">Threads</span></div>
                      <div class="fc-stat-item"><span class="fc-stat-num">${c.post_count}</span><span class="fc-stat-lbl">Messages</span></div>
                    </div>
                    <div class="fc-col-last">
                      ${c.last_title ? html`
                        <div class="fc-last-post-card">
                          <div class="fc-last-avatar">
                            ${c.last_avatar
                              ? html`<img src="${c.last_avatar}" alt="${c.last_username}">`
                              : html`<span>${c.last_username ? c.last_username.slice(0, 1).toUpperCase() : 'U'}</span>`
                            }
                          </div>
                          <div class="fc-last-details">
                            <a class="fc-last-title" href="/forum/thread/${c.last_thread_id}">
                              ${threadStatusBadge(c.last_status || (c.last_title.toLowerCase().includes('important') ? 'IMPORTANT' : ''))}
                              <span>${c.last_title.replace(/^\[(IMPORTANT|Approved|Pending)\]\s*/i, '')}</span>
                            </a>
                            <div class="fc-last-meta muted">
                              ${fmtForumTime(c.last_at)} &middot; <span class="fc-last-author">${c.last_username}</span>
                            </div>
                          </div>
                        </div>
                      ` : html`<span class="fc-last-none muted">None</span>`}
                    </div>
                  </div>
                `;
              })}
            </div>
          </section>`;
        })}
      </div>

      <!-- Right Column: Sidebar Widgets -->
      <aside class="forum-sidebar-column">
        <!-- Widget 1: Members Online -->
        <div class="fc-sidebar-card fc-widget-online">
          <h3 class="fc-widget-title">Members online</h3>
          <div class="fc-online-body">
            <div class="fc-online-chips">
              ${onlineUsers.length ? onlineUsers.map((u) => html`
                <a class="fc-online-chip" href="/account" style="background: ${u.color}25; border: 1.5px solid ${u.color}88; color: ${u.color}; font-weight: 700;" title="${u.username} (${u.isRootAdmin ? `Root Admin · ${u.name} · EN | Player` : u.name})">
                  ${u.username}
                </a>
              `) : html`
                <span class="fc-online-chip" style="background: rgba(6, 182, 212, 0.2); border: 1.5px solid #06b6d4; color: #22d3ee; font-weight: 700;">Rafay Royal</span>
                <span class="fc-online-chip" style="background: rgba(56, 189, 248, 0.2); border: 1.5px solid #38bdf8; color: #38bdf8; font-weight: 700;">Marshmello Pluxury</span>
              `}
            </div>
            <div class="fc-online-stats-footer muted">
              Total: ${totalOnline} (members: ${membersCount}, guests: ${guestsCount})
            </div>
          </div>
        </div>

        <!-- Widget 2: Latest Posts -->
        <div class="fc-sidebar-card fc-widget-latest">
          <h3 class="fc-widget-title">Latest posts</h3>
          <div class="fc-latest-body">
            ${latestPosts.length ? html`
              <ul class="fc-latest-posts-list">
                ${latestPosts.map((p) => html`
                  <li class="fc-latest-post-item">
                    <div class="fc-post-avatar">
                      ${p.avatar
                        ? html`<img src="${p.avatar}" alt="${p.username}">`
                        : html`<span>${p.username ? p.username.slice(0, 1).toUpperCase() : 'U'}</span>`
                      }
                    </div>
                    <div class="fc-post-info">
                      <a class="fc-post-title-link" href="/forum/thread/${p.id}">
                        ${threadStatusBadge(p.status || (p.title.toLowerCase().includes('important') ? 'IMPORTANT' : p.title.toLowerCase().includes('approved') ? 'Approved' : ''))}
                        <span class="fc-post-title-text">${p.title.replace(/^\[(IMPORTANT|Approved|Pending)\]\s*/i, '')}</span>
                      </a>
                      <div class="fc-post-author-line muted">
                        Latest: <span class="author-name">${p.username}</span> &middot; ${fmtForumTime(p.updated_at)}
                      </div>
                      <div class="fc-post-cat-line">
                        <a href="/forum/${p.category_slug}">${p.category_name}</a>
                      </div>
                    </div>
                  </li>
                `)}
              </ul>
            ` : html`
              <ul class="fc-latest-posts-list">
                <li class="fc-latest-post-item">
                  <div class="fc-post-avatar"><span>R</span></div>
                  <div class="fc-post-info">
                    <a class="fc-post-title-link" href="/forum">
                      <span class="forum-tag tag-important">IMPORTANT</span>
                      <span class="fc-post-title-text">Personal Biography | Name | ID</span>
                    </a>
                    <div class="fc-post-author-line muted">Latest: Rafay Royal &middot; Today at 9:04 PM</div>
                    <div class="fc-post-cat-line"><a href="/forum">Role Play biographies</a></div>
                  </div>
                </li>
                <li class="fc-latest-post-item">
                  <div class="fc-post-avatar"><span>M</span></div>
                  <div class="fc-post-info">
                    <a class="fc-post-title-link" href="/forum">
                      <span class="forum-tag tag-important">IMPORTANT</span>
                      <span class="fc-post-title-text">(State organization) Corrupt Bio</span>
                    </a>
                    <div class="fc-post-author-line muted">Latest: Marshmello Plux &middot; Sunday at 4:35 PM</div>
                    <div class="fc-post-cat-line"><a href="/forum">Role Play biographies</a></div>
                  </div>
                </li>
              </ul>
            `}
          </div>
        </div>
      </aside>
    </div>
  </div>`;
  return page(ctx, { title: 'Forum', description: 'The Fide City Roleplay community forum.', active: 'forum', body });
}

/* ----------------------------- Category ------------------------------ */
function category(ctx, { cat, parentCat, subCategories = [], threads = [], pageNo, pages, canPost }) {
  const breadcrumbItems = [{ label: 'Forum', href: '/forum' }];
  if (parentCat) {
    breadcrumbItems.push({ label: parentCat.name, href: `/forum/${parentCat.slug}` });
  }
  breadcrumbItems.push({ label: cat.name });

  const hasSubCategories = subCategories && subCategories.length > 0;

  const body = html`<div class="wrap forum-category-wrap">
    ${crumbs(breadcrumbItems)}

    <div class="fc-category-header-bar">
      <div class="fc-category-header-title-wrap">
        <h1 class="page-title fc-category-heading">${cat.name}</h1>
        ${cat.description ? html`<p class="page-lead fc-category-lead">${cat.description}</p>` : ''}
      </div>
      <div class="fc-category-header-actions">
        ${canPost || hasSubCategories
          ? html`<a class="btn fc-btn-post-thread" href="${hasSubCategories ? '/forum/post-thread' : `/forum/${cat.slug}/new`}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              POST THREAD
            </a>`
          : ctx.user
            ? html`<span class="muted">Only staff can start threads here.</span>`
            : html`<a class="btn btn-primary" href="/login">Sign in to post</a>`}
      </div>
    </div>

    ${hasSubCategories ? html`
      <div class="fc-subforums-card">
        <div class="fc-subforums-table">
          ${subCategories.map((sub) => html`
            <div class="fc-cat-row fc-subforum-row">
              <div class="fc-col-icon">
                <span class="fc-bubble-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </span>
              </div>
              <div class="fc-col-info">
                <h3 class="fc-cat-title">
                  <a href="/forum/${sub.slug}">${sub.name}</a>
                </h3>
                ${sub.children && sub.children.length > 0 ? html`
                  <div class="fc-subforums-interactive-wrap">
                    <button type="button" class="fc-subforums-interactive-toggle" aria-expanded="false" title="View sub-forums">
                      Sub-forums <span class="arrow-down">▾</span>
                    </button>
                    <div class="fc-subforums-popover" style="display: none;">
                      <ul class="fc-subforums-popover-list">
                        ${sub.children.map(child => html`
                          <li>
                            <a href="/forum/${child.slug}">
                              <span class="subforum-dot">•</span>
                              ${child.name}
                            </a>
                          </li>
                        `)}
                      </ul>
                    </div>
                  </div>
                ` : ''}
              </div>
              <div class="fc-col-stats">
                <div class="fc-stat-item">
                  <span class="fc-stat-num">${sub.thread_count || 0}</span>
                  <span class="fc-stat-lbl">Threads</span>
                </div>
                <div class="fc-stat-item">
                  <span class="fc-stat-num">${sub.post_count || 0}</span>
                  <span class="fc-stat-lbl">Messages</span>
                </div>
              </div>
              <div class="fc-col-last">
                ${sub.last_title ? html`
                  <div class="fc-last-post-card">
                    <div class="fc-last-avatar">
                      ${sub.last_avatar
                        ? html`<img src="${sub.last_avatar}" alt="${sub.last_username}">`
                        : html`<span>${sub.last_username ? sub.last_username.slice(0, 1).toUpperCase() : 'U'}</span>`
                      }
                    </div>
                    <div class="fc-last-details">
                      <a class="fc-last-title" href="/forum/thread/${sub.last_thread_id}">
                        ${threadStatusBadge(sub.last_status || (sub.last_title.toLowerCase().includes('important') ? 'IMPORTANT' : sub.last_title.toLowerCase().includes('approved') ? 'Approved' : ''))}
                        <span>${sub.last_title.replace(/^\[(IMPORTANT|Approved|Rejected|Reviewed|On Consideration|Pending Review)\]\s*/i, '')}</span>
                      </a>
                      <div class="fc-last-meta muted">
                        ${fmtForumTime(sub.last_at)} &middot; <span class="fc-last-author">${sub.last_username}</span>
                      </div>
                    </div>
                  </div>
                ` : html`<span class="fc-last-none muted">None</span>`}
              </div>
            </div>
          `)}
        </div>
      </div>

      <div class="fc-subforums-footer-bar">
        <div class="fc-subforums-footer-actions">
          <a class="btn fc-btn-subtle" href="/forum/${cat.slug}/mark-read">MARK READ</a>
          <a class="btn fc-btn-subtle" href="/forum/${cat.slug}/watch">WATCH</a>
        </div>
      </div>
    ` : ''}

    ${threads.length
      ? html`<div class="${hasSubCategories ? 'fc-threads-section' : ''}">
          ${hasSubCategories ? html`<h2 class="fc-section-title" style="margin: 1.5rem 0 0.75rem 0; font-size: 1.1rem;">Threads</h2>` : ''}
          <ul class="thread-list">
            ${threads.map(
              (t) => html`<li${t.pinned ? html` class="is-pinned"` : ''}>
                <div class="thread-main">
                  <h2>${threadStatusBadge(t.status)}<a href="/forum/thread/${t.id}">${t.title}</a></h2>
                  <p class="muted">
                    ${t.pinned ? html`<span class="badge">Pinned</span> ` : ''}${t.locked ? html`<span class="badge badge-quiet">Locked</span> ` : ''}
                    Started by ${t.username} &middot; ${timeAgo(t.created_at)}
                  </p>
                </div>
                <div class="thread-stat"><span class="num">${t.reply_count}</span><span class="muted">replies</span></div>
                <div class="thread-last muted">${timeAgo(t.updated_at)}</div>
              </li>`
            )}
          </ul>
        </div>`
      : !hasSubCategories
        ? html`<p class="empty">No threads here yet. ${canPost ? 'Start the first one.' : ''}</p>`
        : ''}

    ${pager(`/forum/${cat.slug}`, pageNo, pages)}
  </div>`;
  return page(ctx, { title: cat.name, description: cat.description, active: 'forum', body });
}

/* ------------------------------ Thread ------------------------------- */
function thread(ctx, { t, cat, posts, pageNo, pages, canReply, allCategories = [], errors = {}, draft = '' }) {
  const perms = getPermissions(ctx.user);
  const body = html`<div class="wrap">
    ${crumbs([{ label: 'Forum', href: '/forum' }, { label: cat.name, href: `/forum/${cat.slug}` }, { label: t.title }])}
    <div class="page-head">
      <div>
        <h1 class="page-title thread-title">
          ${perms.canTagStatus
            ? html`
              <span class="thread-prefix-ctrl" id="thread-prefix-ctrl" data-thread-id="${t.id}" data-csrf="${ctx.csrfToken()}">
                <button type="button" class="btn-prefix-badge-toggle" id="btn-prefix-badge-toggle" aria-haspopup="true" aria-expanded="false" title="Click to change status prefix">
                  <span id="thread-title-badge">${t.status ? threadStatusBadge(t.status) : html`<span class="tag-no-prefix">(No prefix)</span>`}</span>
                  <span class="prefix-caret">▾</span>
                </button>
                <div class="prefix-dropdown-card" id="prefix-dropdown-card" style="display: none;" role="menu">
                  <button type="button" class="prefix-card-btn btn-prefix-important" data-status="IMPORTANT" role="menuitem">IMPORTANT</button>
                  <button type="button" class="prefix-card-btn btn-prefix-approved" data-status="Approved" role="menuitem">Approved</button>
                  <button type="button" class="prefix-card-btn btn-prefix-rejected" data-status="Rejected" role="menuitem">Rejected</button>
                  <button type="button" class="prefix-card-btn btn-prefix-reviewed" data-status="Reviewed" role="menuitem">Reviewed</button>
                  <button type="button" class="prefix-card-btn btn-prefix-consideration" data-status="On Consideration" role="menuitem">On Consideration</button>
                  <button type="button" class="prefix-card-btn btn-prefix-pending" data-status="Pending Review" role="menuitem">Pending Review</button>
                  <div class="prefix-card-divider"></div>
                  <button type="button" class="prefix-card-btn btn-prefix-none" data-status="" role="menuitem">(No prefix)</button>
                </div>
              </span>
            `
            : html`<span id="thread-title-badge">${threadStatusBadge(t.status)}</span>`
          }
          <span class="thread-title-text" id="thread-title-text">${t.title}</span>
        </h1>
        <p class="muted">${t.pinned ? html`<span class="badge">Pinned</span> ` : ''}${t.locked ? html`<span class="badge badge-quiet">Locked</span> ` : ''}${t.reply_count} ${t.reply_count === 1 ? 'reply' : 'replies'}</p>
      </div>
      ${perms.canPin || perms.canLock || perms.canDelete || perms.canTagStatus || perms.canMove
        ? html`<div class="mod-actions" role="group" aria-label="Moderation">
            ${perms.canPin ? html`<form method="post" action="/forum/thread/${t.id}/pin">${csrfField(ctx)}<button class="btn btn-ghost btn-sm" type="submit">${t.pinned ? 'Unpin' : 'Pin'}</button></form>` : ''}
            ${perms.canLock ? html`<form method="post" action="/forum/thread/${t.id}/lock">${csrfField(ctx)}<button class="btn btn-ghost btn-sm" type="submit">${t.locked ? 'Unlock' : 'Lock'}</button></form>` : ''}
            ${perms.canDelete ? html`<form method="post" action="/forum/thread/${t.id}/delete" data-confirm="Delete this thread and all its replies?">${csrfField(ctx)}<button class="btn btn-danger btn-sm" type="submit">Delete thread</button></form>` : ''}
            ${perms.canTagStatus ? html`<form method="post" action="/forum/thread/${t.id}/status" style="display:inline-block; margin:0;" class="status-mod-form">${csrfField(ctx)}
                <select name="status" class="status-mod-select" onchange="this.form.submit()" style="padding: 0.35rem 0.6rem; border-radius: 6px; font-size: 0.8rem; background: #160228; border: 1px solid var(--border); color: #fff; cursor: pointer; color-scheme: dark;">
                  <option value=""${!t.status ? ' selected' : ''} style="background: #18032c; color: #fff;">🏷️ Prefix...</option>
                  <option value="IMPORTANT"${t.status === 'IMPORTANT' ? ' selected' : ''} style="background: #18032c; color: #ef4444;">🔴 IMPORTANT</option>
                  <option value="Approved"${t.status === 'Approved' ? ' selected' : ''} style="background: #18032c; color: #22c55e;">✅ Approved</option>
                  <option value="Rejected"${t.status === 'Rejected' ? ' selected' : ''} style="background: #18032c; color: #94a3b8;">❌ Rejected</option>
                  <option value="Reviewed"${t.status === 'Reviewed' ? ' selected' : ''} style="background: #18032c; color: #86efac;">📋 Reviewed</option>
                  <option value="On Consideration"${t.status === 'On Consideration' ? ' selected' : ''} style="background: #18032c; color: #facc15;">⏳ On Consideration</option>
                  <option value="Pending Review"${t.status === 'Pending Review' ? ' selected' : ''} style="background: #18032c; color: #fbbf24;">⚠️ Pending Review</option>
                  ${t.status ? html`<option value="" style="background: #18032c; color: #fff;">✕ (No prefix)</option>` : ''}
                </select>
              </form>` : ''}
            ${perms.canMove && allCategories && allCategories.length ? html`<form method="post" action="/forum/thread/${t.id}/move" style="display:inline-block; margin:0;">${csrfField(ctx)}
                <select name="category_id" class="mod-cat-select" onchange="this.form.submit()" style="padding: 0.35rem 0.6rem; border-radius: 6px; font-size: 0.8rem; background: #160228; border: 1px solid var(--border); color: #fff; cursor: pointer; color-scheme: dark;">
                  <option value="" style="background: #18032c; color: #fff;">📁 Move To...</option>
                  ${allCategories.map((c) => html`<option value="${c.id}"${c.id === t.category_id ? ' disabled' : ''} style="background: #18032c; color: #fff;">${c.name}</option>`)}
                </select>
              </form>` : ''}
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
            <header class="post-meta"><time datetime="${new Date(p.created_at).toISOString()}">${fmtDateTime(p.created_at)}</time>${p.id === t.first_post_id ? '' : html` <a href="#post-${p.id}" class="permalink" aria-label="Link to this reply">#${(pageNo - 1) * 20 + i + 1}</a>`}${canEditForumPost(ctx.user) ? html` <a class="permalink" href="/forum/post/${p.id}/edit">Edit</a>` : ''}</header>
            <div class="post-body">${p.body}</div>
            ${perms.canDeletePost && p.id !== t.first_post_id
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
  const perms = getPermissions(ctx.user);
  const body = html`<div class="wrap prose-wrap">
    ${crumbs([{ label: 'Forum', href: '/forum' }, { label: cat.name, href: `/forum/${cat.slug}` }, { label: 'New thread' }])}
    <h1 class="page-title">New thread in ${cat.name}</h1>
    <form class="form card" method="post" action="/forum/${cat.slug}/new">
      ${errors.form ? html`<p class="form-error banner" role="alert">${errors.form}</p>` : ''}
      ${csrfField(ctx)}
      <div class="field${errors.title ? ' has-error' : ''}">
        <label for="title">Title</label>
        <div class="new-thread-title-row">
          ${perms.canTagStatus ? html`
            <div class="new-thread-prefix-wrap" id="new-thread-prefix-wrap">
              <input type="hidden" name="status" id="new-thread-status-input" value="${values.status || ''}">
              <button type="button" class="btn-prefix-badge-toggle" id="btn-new-thread-prefix" aria-haspopup="true" aria-expanded="false" title="Click to choose prefix">
                <span id="new-thread-prefix-display">${values.status ? threadStatusBadge(values.status) : html`<span class="tag-no-prefix">(No prefix)</span>`}</span>
                <span class="prefix-caret">▾</span>
              </button>
              <div class="prefix-dropdown-card" id="new-thread-prefix-card" style="display: none;" role="menu">
                <button type="button" class="prefix-card-btn btn-prefix-important" data-new-status="IMPORTANT">IMPORTANT</button>
                <button type="button" class="prefix-card-btn btn-prefix-approved" data-new-status="Approved">Approved</button>
                <button type="button" class="prefix-card-btn btn-prefix-rejected" data-new-status="Rejected">Rejected</button>
                <button type="button" class="prefix-card-btn btn-prefix-reviewed" data-new-status="Reviewed">Reviewed</button>
                <button type="button" class="prefix-card-btn btn-prefix-consideration" data-new-status="On Consideration">On Consideration</button>
                <button type="button" class="prefix-card-btn btn-prefix-pending" data-new-status="Pending Review">Pending Review</button>
                <div class="prefix-card-divider"></div>
                <button type="button" class="prefix-card-btn btn-prefix-none" data-new-status="">(No prefix)</button>
              </div>
            </div>
          ` : ''}
          <input id="title" name="title" type="text" maxlength="120" required value="${values.title || ''}" placeholder="Thread title">
        </div>
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

function editPost(ctx, { t, cat, post, isFirstPost, title = t.title, errors = {} }) {
  const body = html`<div class="wrap prose-wrap">
    ${crumbs([{ label: 'Forum', href: '/forum' }, { label: cat.name, href: `/forum/${cat.slug}` }, { label: t.title, href: `/forum/thread/${t.id}` }, { label: 'Edit post' }])}
    <h1 class="page-title">Edit ${isFirstPost ? 'thread and form' : 'reply'}</h1>
    <form class="form card" method="post" action="/forum/post/${post.id}/edit">
      ${csrfField(ctx)}
      ${isFirstPost ? html`<div class="field${errors.title ? ' has-error' : ''}">
        <label for="title">Thread title</label>
        <input id="title" name="title" type="text" maxlength="120" required value="${title}">
        ${errors.title ? html`<p class="form-error" role="alert">${errors.title}</p>` : ''}
      </div>` : ''}
      <div class="field${errors.body ? ' has-error' : ''}">
        <label for="body">${isFirstPost ? 'Form content' : 'Reply content'}</label>
        <textarea id="body" name="body" rows="10" maxlength="5000" required>${post.body}</textarea>
        ${errors.body ? html`<p class="form-error" role="alert">${errors.body}</p>` : ''}
        <p class="hint">Plain text only. Up to 5000 characters.</p>
      </div>
      <div class="row-form">
        <button class="btn btn-primary" type="submit">Save changes</button>
        <a class="btn btn-ghost" href="/forum/thread/${t.id}">Cancel</a>
      </div>
    </form>
  </div>`;
  return page(ctx, { title: `Edit post: ${t.title}`, active: 'forum', body, robots: 'noindex' });
}

module.exports = { index, category, thread, newThread, editPost, isStaff };
