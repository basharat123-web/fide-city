'use strict';
const { html, raw } = require('../lib/html');
const config = require('../lib/config');

const NAV = [
  { key: 'home', href: '/', label: 'Home' },
  { key: 'how', href: '/#how-to-play', label: 'How to play' },
  { key: 'forum', href: '/forum', label: 'Forum' },
  { key: 'news', href: '/news', label: 'News' },
  { key: 'team', href: '/team', label: 'Team' },
  { key: 'rules', href: '/rules', label: 'Rules' },
];

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false,
});

const fmtDate = (ms) => dateFmt.format(new Date(ms));
const fmtDateTime = (ms) => `${dateTimeFmt.format(new Date(ms))} UTC`;

function timeAgo(ms) {
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return fmtDate(ms);
}

const csrfField = (ctx) => html`<input type="hidden" name="_csrf" value="${ctx.csrfToken()}">`;

const icons = {
  discord: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.6 5.3A16.6 16.6 0 0 0 15.5 4l-.2.4a15 15 0 0 1 3.6 1.8 14.2 14.2 0 0 0-13.8 0A15 15 0 0 1 8.7 4.4L8.5 4a16.600 16.600 0 0 0-4.100 1.300C1.800 9.200 1.100 13 1.500 16.700a16.700 16.700 0 0 0 5 2.500l1.100-1.800a11 11 0 0 1-1.700-.8l.4-.3a12 12 0 0 0 10.200 0l.4.300c-.5.300-1.100.600-1.700.800l1.100 1.800a16.700 16.700 0 0 0 5-2.500c.5-4.300-.7-8-2.700-11.400ZM8.900 14.500c-1 0-1.800-.9-1.800-2s.8-2 1.800-2 1.800.9 1.800 2-.8 2-1.800 2Zm6.200 0c-1 0-1.800-.9-1.800-2s.8-2 1.800-2 1.800.9 1.800 2-.8 2-1.800 2Z"/></svg>'),
  instagram: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.500 2h9A5.500 5.500 0 0 1 22 7.500v9a5.500 5.500 0 0 1-5.500 5.500h-9A5.500 5.500 0 0 1 2 16.500v-9A5.500 5.500 0 0 1 7.500 2Zm0 2A3.500 3.500 0 0 0 4 7.500v9A3.500 3.500 0 0 0 7.500 20h9a3.500 3.500 0 0 0 3.500-3.500v-9A3.500 3.500 0 0 0 16.500 4h-9ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm5.300-3.300a1.200 1.200 0 1 1 0 2.400 1.200 1.200 0 0 1 0-2.400Z"/></svg>'),
  youtube: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.600 7.200a2.700 2.700 0 0 0-1.900-1.900C18 4.800 12 4.800 12 4.800s-6 0-7.700.5A2.700 2.700 0 0 0 2.400 7.200C2 8.900 2 12 2 12s0 3.100.4 4.800a2.700 2.700 0 0 0 1.900 1.900c1.700.5 7.700.5 7.700.5s6 0 7.700-.5a2.700 2.700 0 0 0 1.900-1.900c.4-1.700.4-4.800.4-4.800s0-3.100-.4-4.800ZM10 15.200V8.800l5.500 3.200-5.500 3.200Z"/></svg>'),
  tiktok: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.500 2h-3.200v13.200a2.800 2.800 0 1 1-2-2.700V9.200a6 6 0 1 0 5.200 5.900V8.800a7.500 7.500 0 0 0 4.300 1.400V7a4.300 4.300 0 0 1-4.300-4.300V2Z"/></svg>'),
};

function socialLinks() {
  const items = [
    ['Discord', config.links.discord, icons.discord],
    ['Instagram', config.links.instagram, icons.instagram],
    ['YouTube', config.links.youtube, icons.youtube],
    ['TikTok', config.links.tiktok, icons.tiktok],
  ].filter(([, href]) => href);
  if (!items.length) return '';
  return html`<ul class="social" aria-label="Social links">
    ${items.map(([name, href, icon]) => html`<li><a href="${href}" rel="noopener noreferrer" target="_blank" aria-label="${name}">${icon}<span class="sr">${name}</span></a></li>`)}
  </ul>`;
}

function page(ctx, { title, description, active = '', body, wide = false, robots = '' }) {
  const fullTitle = title ? `${title} | ${config.server.name}` : `${config.server.name} | GTA V roleplay community`;
  const desc =
    description ||
    'Fide City Roleplay is a GTA V FiveM roleplay community. Create a character, choose your path and write your story in Los Santos.';
  const flash = ctx.takeFlash();
  const user = ctx.user;
  const canonical = `${config.siteUrl}${ctx.path === '/' ? '' : ctx.path}`;

  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${fullTitle}</title>
  <meta name="description" content="${desc}">
  <meta name="theme-color" content="#10011f">
  <meta name="color-scheme" content="dark">
  ${robots ? html`<meta name="robots" content="${robots}">` : ''}
  <link rel="canonical" href="${canonical}">
  <link rel="icon" type="image/png" href="/img/favicon.png">
  <link rel="apple-touch-icon" href="/img/logo-256.png">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${config.server.name}">
  <meta property="og:title" content="${fullTitle}">
  <meta property="og:description" content="${desc}">
  <meta property="og:image" content="${config.siteUrl}/img/logo.png">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,100..900;1,62..125,100..900&family=Instrument+Sans:ital,wght@0,400..700;1,400..700&display=swap">
  <link rel="stylesheet" href="/css/style.css?v=2.5">
  <script src="/js/main.js" defer></script>
</head>
<body class="${active ? `page-${active}` : ''}">
  <a class="skip" href="#main">Skip to content</a>
  <header class="site-header">
    <div class="wrap bar">
      <a class="brand" href="/" aria-label="${config.server.name} home">
        <img src="/img/logo-256.png" width="48" height="48" alt="">
        <span class="brand-text">Fide City<small>Roleplay</small></span>
      </a>
      <nav class="nav" id="nav" aria-label="Main">
        <ul>
          ${NAV.map((n) => html`<li><a href="${n.href}"${active === n.key ? raw(' aria-current="page"') : ''}>${n.label}</a></li>`)}
        </ul>
      </nav>
      <div class="bar-end">
        <div class="pill" data-status-pill aria-live="polite"><span class="dot" aria-hidden="true"></span><span data-status-text>Checking city</span></div>
        ${user
          ? html`<div class="account-capsule">
              <a class="account-pill" href="/account" title="Account Settings">
                <span class="avatar-badge">${user.role === 'root_admin' ? '👑' : user.role === 'admin' ? '🛡️' : user.role === 'mod' ? '⚔️' : '👤'}</span>
                <span class="user-handle">${user.username}</span>
                <span class="role-chip role-chip-${user.role}">${user.role === 'root_admin' ? 'Root' : user.role === 'admin' ? 'Admin' : user.role === 'mod' ? 'Mod' : 'Member'}</span>
              </a>
              ${user.role === 'root_admin'
                ? html`<a class="btn-console btn-console-root" href="/admin/root" title="Root Administrator Master Console"><span>👑</span> Master Console</a>`
                : user.role !== 'member'
                  ? html`<a class="btn-console" href="/admin">Staff Panel</a>`
                  : ''}
              <form method="post" action="/logout" class="signout-form">
                ${csrfField(ctx)}
                <button class="btn-signout" type="submit" title="Sign out">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                  <span>Sign out</span>
                </button>
              </form>
            </div>`
          : html`<div class="account">
              <a class="btn btn-quiet" href="/login">Sign in</a>
              <a class="btn btn-primary" href="/register">Join now</a>
            </div>`}
        <button class="menu-btn" type="button" aria-expanded="false" aria-controls="nav" data-menu><span class="sr">Menu</span><span class="bars" aria-hidden="true"></span></button>
      </div>
    </div>
  </header>

  ${flash ? html`<div class="wrap"><p class="flash flash-${flash.type === 'error' ? 'error' : 'ok'}" role="status">${flash.message}</p></div>` : ''}

  <main id="main" class="${wide ? 'main-wide' : ''}">
    ${body}
  </main>

  <footer class="site-footer">
    <div class="wrap foot-grid">
      <div class="foot-brand">
        <img src="/img/logo-256.png" width="96" height="96" alt="Fide City Roleplay logo" loading="lazy">
        <p>A GTA V roleplay city. Pick a path, build a character and write your own story in Los Santos.</p>
        ${socialLinks()}
      </div>
      <nav aria-label="Explore">
        <h2>Explore</h2>
        <ul>
          <li><a href="/#how-to-play">How to play</a></li>
          <li><a href="/#organizations">Organizations</a></li>
          <li><a href="/#faq">FAQ</a></li>
          <li><a href="/forum">Forum</a></li>
          <li><a href="/news">News</a></li>
          <li><a href="/team">Team</a></li>
        </ul>
      </nav>
      <nav aria-label="Legal">
        <h2>Legal</h2>
        <ul>
          <li><a href="/rules">Server rules</a></li>
          <li><a href="/terms">Terms of use</a></li>
          <li><a href="/privacy">Privacy policy</a></li>
          <li><a href="/cookies">Cookies</a></li>
        </ul>
      </nav>
      <div>
        <h2>Contact</h2>
        <ul>
          ${config.links.discord ? html`<li><a href="${config.links.discord}" rel="noopener noreferrer" target="_blank">Ask on Discord</a></li>` : ''}
          <li><a href="mailto:${config.links.supportEmail}">${config.links.supportEmail}</a></li>
        </ul>
      </div>
    </div>
    <div class="wrap legal">
      <p>&copy; ${new Date().getUTCFullYear()} ${config.server.name}. All rights reserved.</p>
      <p>Fide City Roleplay is a fan-made community project. It is not affiliated with or endorsed by Rockstar Games, Take-Two Interactive or Cfx.re. Grand Theft Auto and related marks belong to their respective owners.</p>
    </div>
  </footer>
</body>
</html>`;
}

module.exports = { page, csrfField, fmtDate, fmtDateTime, timeAgo, socialLinks, icons };
