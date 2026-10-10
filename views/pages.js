'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { html, raw } = require('../lib/html');
const config = require('../lib/config');
const content = require('../data/content');
const { page, csrfField, fmtDate, fmtDateTime, icons } = require('./layout');
const { getRoleMeta } = require('../lib/roles');

const GALLERY_DIR = path.join(__dirname, '..', 'public', 'img', 'gallery');

function galleryImages() {
  try {
    return fs
      .readdirSync(GALLERY_DIR)
      .filter((f) => /^[\w\-. ]+\.(webp|jpe?g|png|avif)$/i.test(f))
      .sort()
      .slice(0, 12);
  } catch (_) {
    return [];
  }
}

/** Break plain text into escaped paragraphs. */
function paragraphs(text) {
  return String(text)
    .split(/\n{2,}/)
    .map((p) => html`<p>${p.split('\n').map((line, i) => (i ? html`<br>${line}` : line))}</p>`);
}

/* ------------------------------ Home ---------------------------------- */
function home(ctx, { stories }) {
  const c = content;
  const gallery = galleryImages();
  const discord = config.links.discord;

  const body = html`
  <section class="hero" aria-labelledby="hero-title">
    <div class="wrap hero-grid">
      <div class="hero-copy">
        <h1 id="hero-title">${c.hero.headline}</h1>
        <p class="lead">${c.hero.sub}</p>
        <div class="cta-row">
          <a class="btn btn-primary btn-lg" href="#how-to-play">Start your story</a>
          ${discord ? html`<a class="btn btn-gold btn-lg" href="${discord}" rel="noopener noreferrer" target="_blank">${icons.discord}Join the Discord</a>` : ''}
        </div>

        <div class="dispatch" data-board>
          <div class="readout">
            <span class="readout-label">City status</span>
            <span class="readout-value" data-board-state>Checking</span>
          </div>
          <div class="readout">
            <span class="readout-label">Players in the city</span>
            <span class="readout-value"><span data-board-players>0</span><small> / <span data-board-max>${config.server.maxPlayers}</span></small></span>
          </div>
          <div class="plate-wrap">
            <span class="readout-label" id="connect-label">Connect from the F8 console</span>
            <div class="plate" aria-labelledby="connect-label">
              <span class="plate-top">Fide City</span>
              <code class="plate-text" data-connect>${config.server.connect}</code>
              <button class="plate-copy" type="button" data-copy-target="[data-connect]">Copy</button>
            </div>
          </div>
        </div>
      </div>

      <div class="hero-art">
        <img class="neon-logo" src="/img/logo-640.webp" width="640" height="640" alt="Fide City Roleplay logo: a neon city skyline with palm trees over water" fetchpriority="high">
      </div>
    </div>
  </section>

  <section class="section" aria-labelledby="why-title">
    <div class="wrap">
      <h2 id="why-title" class="section-title">A new life in Los Santos</h2>
      <p class="section-lead">From law enforcement to business and crime to everyday life, create a character, shape your future and play it your way.</p>
      <ul class="highlights">
        ${c.highlights.map((h) => html`<li><h3>${h.title}</h3><p>${h.text}</p></li>`)}
      </ul>
    </div>
  </section>

  <section class="section section-tint" id="how-to-play" aria-labelledby="how-title">
    <div class="wrap">
      <h2 id="how-title" class="section-title">Four steps to the city</h2>
      <p class="section-lead">No application form, no quiz. Follow these in order and you are in.</p>
      <ol class="steps">
        ${c.steps.map(
          (s) => html`<li>
            <div class="step-body">
              <h3>${s.title}</h3>
              <p>${s.text}</p>
              ${s.link ? html`<a class="btn btn-ghost" href="${s.link.href}" rel="noopener noreferrer" target="_blank">${s.link.label}</a>` : ''}
              ${s.discord && discord ? html`<a class="btn btn-ghost" href="${discord}" rel="noopener noreferrer" target="_blank">Join the Discord</a>` : ''}
              ${s.connect ? html`<div class="plate plate-small"><code class="plate-text" data-connect-copy>${config.server.connect}</code><button class="plate-copy" type="button" data-copy-target="[data-connect-copy]">Copy</button></div>` : ''}
            </div>
          </li>`
        )}
      </ol>
    </div>
  </section>

  <section class="section" id="organizations" aria-labelledby="orgs-title">
    <div class="wrap">
      <h2 id="orgs-title" class="section-title">Organizations</h2>
      <p class="section-lead">Join the departments, businesses and crews that keep Los Santos running.</p>
      <div class="org-groups">
        ${c.organizations.map(
          (g) => html`<section class="org-group" aria-label="${g.group}">
            <div class="org-intro"><h3>${g.group}</h3><p>${g.blurb}</p></div>
            <ul class="org-list">
              ${g.items.map((o) => html`<li><span class="org-tag" aria-hidden="true">${o.short}</span><div><h4>${o.name}</h4><p>${o.text}</p></div></li>`)}
            </ul>
          </section>`
        )}
      </div>
    </div>
  </section>

  ${gallery.length
    ? html`<section class="section section-tint" aria-labelledby="gallery-title">
        <div class="wrap">
          <h2 id="gallery-title" class="section-title">Fide City in action</h2>
          <ul class="gallery">
            ${gallery.map((f) => html`<li><img src="/img/gallery/${f}" alt="Screenshot from Fide City Roleplay" loading="lazy" decoding="async"></li>`)}
          </ul>
        </div>
      </section>`
    : ''}

  ${stories.length
    ? html`<section class="section" aria-labelledby="news-title">
        <div class="wrap">
          <div class="section-head">
            <h2 id="news-title" class="section-title">Latest news</h2>
            <a class="more" href="/news">All news</a>
          </div>
          <ul class="news-list">
            ${stories.map((s) => html`<li><a href="/news/${s.slug}"><time datetime="${new Date(s.created_at).toISOString()}">${fmtDate(s.created_at)}</time><h3>${s.title}</h3><p>${s.summary}</p></a></li>`)}
          </ul>
        </div>
      </section>`
    : ''}

  <section class="section section-tint" id="faq" aria-labelledby="faq-title">
    <div class="wrap narrow">
      <h2 id="faq-title" class="section-title">Questions players ask</h2>
      <p class="section-lead">Still unsure? Ask on Discord and a real person will answer.</p>
      <div class="faq">
        ${c.faq.map((f) => html`<details><summary>${f.q}</summary><p>${f.a}</p></details>`)}
      </div>
    </div>
  </section>

  <section class="section final-cta" aria-labelledby="cta-title">
    <div class="wrap narrow center">
      <h2 id="cta-title" class="section-title">Ready to play?</h2>
      <p class="section-lead">Create an account to post on the forum, share your stories and hear about updates first.</p>
      <div class="cta-row center-row">
        ${ctx.user
          ? html`<a class="btn btn-primary btn-lg" href="/forum">Open the forum</a>`
          : html`<a class="btn btn-primary btn-lg" href="/register">Create account</a>`}
        ${discord ? html`<a class="btn btn-gold btn-lg" href="${discord}" rel="noopener noreferrer" target="_blank">${icons.discord}Join the Discord</a>` : ''}
      </div>
    </div>
  </section>`;

  return page(ctx, {
    title: '',
    active: 'home',
    body,
    wide: true,
  });
}

/* ------------------------------ Rules --------------------------------- */
function rules(ctx) {
  const body = html`<div class="wrap prose-wrap">
    <h1 class="page-title">Server rules</h1>
    <p class="page-lead">By joining Fide City you agree to follow these rules. Rule numbers are used when staff reference a decision.</p>
    <nav class="toc" aria-label="Rule sections">
      <ul>${content.rules.map((s, i) => html`<li><a href="#rules-${i + 1}">${s.title}</a></li>`)}</ul>
    </nav>
    ${content.rules.map(
      (s, i) => html`<section class="rules-section" id="rules-${i + 1}" aria-labelledby="rules-h-${i + 1}">
        <h2 id="rules-h-${i + 1}">${s.title}</h2>
        <ol class="rule-list">
          ${s.items.map((it, j) => html`<li><span class="rule-no">${i + 1}.${j + 1}</span><span>${it}</span></li>`)}
        </ol>
      </section>`
    )}
    <p class="note">Staff can act on the spirit of the rules as well as the wording. If something is unclear, ask before you do it.</p>
  </div>`;
  return page(ctx, { title: 'Server rules', description: 'The rules every Fide City Roleplay player agrees to follow.', active: 'rules', body });
}

/* ------------------------------ Legal --------------------------------- */
const LEGAL_UPDATED = '9 October 2026';

function legalShell(ctx, title, description, inner) {
  const body = html`<div class="wrap prose-wrap prose">
    <h1 class="page-title">${title}</h1>
    <p class="muted">Last updated ${LEGAL_UPDATED}</p>
    ${inner}
  </div>`;
  return page(ctx, { title, description, body });
}

function privacy(ctx) {
  return legalShell(ctx, 'Privacy policy', 'How Fide City Roleplay collects, uses and protects your data.', html`
    <p>This policy explains what personal data this website collects when you create an account or use the forum, and what we do with it.</p>
    <h2>What we collect</h2>
    <ul>
      <li><strong>Account details:</strong> your username, email address and a salted, hashed version of your password. We never store your password in readable form.</li>
      <li><strong>Content you post:</strong> forum threads, replies and any other text you submit.</li>
      <li><strong>Security data:</strong> your IP address and a timestamp when you sign in, register or use staff tools. This is used to stop abuse and investigate incidents.</li>
      <li><strong>Session cookie:</strong> one strictly necessary cookie that keeps you signed in. See the <a href="/cookies">cookies page</a>.</li>
    </ul>
    <h2>How we use it</h2>
    <ul>
      <li>To run your account and show your forum posts.</li>
      <li>To keep the community and website secure, including rate limiting and abuse prevention.</li>
      <li>To contact you about your account or about moderation decisions.</li>
    </ul>
    <p>We do not sell your data and we do not use advertising or analytics trackers on this site.</p>
    <h2>Third parties</h2>
    <p>Pages load fonts from Google Fonts, which means your browser contacts Google when a page loads. If CAPTCHA protection is enabled, Cloudflare Turnstile may also process technical data to check you are human. Our hosting provider processes requests on our behalf.</p>
    <h2>How long we keep data</h2>
    <ul>
      <li>Account and forum data are kept until you delete your account.</li>
      <li>Security log entries (including IP addresses) are deleted after 90 days.</li>
      <li>Login sessions expire after 7 days of inactivity.</li>
    </ul>
    <h2>Your choices</h2>
    <p>You can change your password or permanently delete your account from your <a href="/account">account page</a>. Deleting your account removes your profile and the threads and replies you posted. For any other request about your data, email <a href="mailto:${config.links.supportEmail}">${config.links.supportEmail}</a>.</p>
    <h2>Security</h2>
    <p>Passwords are hashed with scrypt, connections use HTTPS, sessions are stored on our server and forms are protected against cross-site request forgery. No system is perfectly secure, so please use a unique password.</p>
    <h2>Children</h2>
    <p>This community is for players aged 16 and over. We do not knowingly collect data from younger children.</p>
    <h2>Contact</h2>
    <p>Questions about this policy: <a href="mailto:${config.links.supportEmail}">${config.links.supportEmail}</a>.</p>
  `);
}

function terms(ctx) {
  return legalShell(ctx, 'Terms of use', 'The terms for using the Fide City Roleplay website and forum.', html`
    <p>By creating an account or using this website you agree to these terms and to the <a href="/rules">server rules</a>.</p>
    <h2>Your account</h2>
    <ul>
      <li>You must be 16 or older to register.</li>
      <li>Keep your password private. You are responsible for activity on your account.</li>
      <li>One person, one account. Ban evasion with a new account is not allowed.</li>
    </ul>
    <h2>Content you post</h2>
    <ul>
      <li>You own what you write, but you give us permission to display it on this site.</li>
      <li>Do not post anything illegal, hateful, harassing, sexually explicit, or that reveals someone else's private information.</li>
      <li>Staff may edit, lock or remove content and may suspend or delete accounts that break the rules.</li>
    </ul>
    <h2>Acceptable use</h2>
    <p>Do not attempt to attack, probe or overload this website, access other people's accounts, or bypass security measures. Security researchers who find a problem should report it privately through the contact details in <a href="/.well-known/security.txt">security.txt</a>.</p>
    <h2>No affiliation</h2>
    <p>Fide City Roleplay is an independent fan community. It is not affiliated with or endorsed by Rockstar Games, Take-Two Interactive or Cfx.re.</p>
    <h2>Changes and availability</h2>
    <p>We may update these terms and the website at any time. The site is provided as is, without any guarantee of uptime.</p>
  `);
}

function cookies(ctx) {
  return legalShell(ctx, 'Cookies', 'The cookies used by the Fide City Roleplay website.', html`
    <p>We keep cookies to the minimum needed to run the site.</p>
    <table class="data">
      <thead><tr><th scope="col">Cookie</th><th scope="col">Purpose</th><th scope="col">Lasts</th></tr></thead>
      <tbody>
        <tr><td><code>${config.isProd ? '__Host-fc_sid' : 'fc_sid'}</code></td><td>Keeps you signed in and protects forms against forgery. Strictly necessary.</td><td>Up to 7 days</td></tr>
      </tbody>
    </table>
    <p>We do not use advertising, tracking or analytics cookies. Because the only cookie is strictly necessary, there is no cookie banner. Third-party services we load, such as Google Fonts, follow their own policies.</p>
  `);
}

/* ------------------------------ Team ---------------------------------- */
function team(ctx, { staff }) {
  const body = html`<div class="wrap prose-wrap">
    <h1 class="page-title">The team</h1>
    <p class="page-lead">The people who build, run and look after Fide City.</p>

    <h2 class="sub-title">How the team is organized</h2>
    <ul class="team-roles">
      ${content.credits.team.map((t) => html`<li><h3>${t.name}</h3><p class="muted">${t.role}</p><p>${t.text}</p></li>`)}
    </ul>

    <h2 class="sub-title">Staff on the forum</h2>
    ${staff.length
      ? html`<ul class="staff-list">
          ${staff.map((s) => html`<li><span class="avatar" aria-hidden="true">${s.username.slice(0, 1).toUpperCase()}</span><div><strong>${s.username}</strong><span class="muted">${s.staff_title || (s.role === 'admin' ? 'Admin' : 'Moderator')}</span></div></li>`)}
        </ul>`
      : html`<p class="empty">No staff are listed yet. Admins can add titles from the staff dashboard.</p>`}
  </div>`;
  return page(ctx, { title: 'Team', description: 'Meet the Fide City Roleplay team.', active: 'team', body });
}

/* ------------------------------ News ---------------------------------- */
function newsList(ctx, { stories }) {
  const body = html`<div class="wrap prose-wrap">
    <h1 class="page-title">News and stories</h1>
    <p class="page-lead">Updates from the team and tales from the city.</p>
    ${stories.length
      ? html`<ul class="news-list news-list-full">
          ${stories.map((s) => html`<li><a href="/news/${s.slug}"><time datetime="${new Date(s.created_at).toISOString()}">${fmtDate(s.created_at)}</time><h3>${s.title}</h3><p>${s.summary}</p></a></li>`)}
        </ul>`
      : html`<p class="empty">Nothing here yet. Check back soon, or join the Discord for live updates.</p>`}
  </div>`;
  return page(ctx, { title: 'News', description: 'Latest news and updates from Fide City Roleplay.', active: 'news', body });
}

function newsStory(ctx, { story, author }) {
  const body = html`<article class="wrap prose-wrap prose">
    <p><a class="back" href="/news">Back to news</a></p>
    <h1 class="page-title">${story.title}</h1>
    <p class="muted">By ${author} on <time datetime="${new Date(story.created_at).toISOString()}">${fmtDate(story.created_at)}</time></p>
    ${paragraphs(story.body)}
  </article>`;
  return page(ctx, { title: story.title, description: story.summary, active: 'news', body });
}

/* ------------------------------ Account ------------------------------- */
function account(ctx, { errors = {} } = {}) {
  const u = ctx.user;
  const meta = getRoleMeta(u);
  const body = html`<div class="wrap prose-wrap">
    <h1 class="page-title">Your account</h1>
    <dl class="facts">
      <div><dt>Username</dt><dd>${u.username}</dd></div>
      <div><dt>Email</dt><dd>${u.email}</dd></div>
      <div><dt>City Role</dt><dd><span class="badge" style="background: ${meta.color}25; border: 1.5px solid ${meta.color}88; color: ${meta.color}; font-weight: 800; font-size: 0.88rem; padding: 0.3rem 0.85rem;">${meta.icon} ${meta.name}</span></dd></div>
      <div><dt>Joined</dt><dd>${fmtDate(u.created_at)}</dd></div>
      ${u.role === 'root_admin'
        ? html`<div style="grid-column: 1 / -1; margin-top: 0.6rem;"><a class="btn btn-primary" href="/admin/root" style="background: linear-gradient(135deg, #f8c040, #fd20d7); font-weight: 800; color: #14011c;">👑 Open Root Admin Master Console</a></div>`
        : ['admin', 'mod'].includes(u.role)
          ? html`<div style="grid-column: 1 / -1; margin-top: 0.6rem;"><a class="btn btn-primary" href="/admin" style="font-weight: 700;">🛡️ Open Staff Panel</a></div>`
          : ''}
    </dl>

    <form class="form card" method="post" action="/account/password" autocomplete="off">
      <h2>Change password</h2>
      ${errors.password ? html`<p class="form-error" role="alert">${errors.password}</p>` : ''}
      ${csrfField(ctx)}
      <label for="current">Current password</label>
      <input id="current" name="current" type="password" autocomplete="current-password" required maxlength="128">
      <label for="new">New password</label>
      <input id="new" name="password" type="password" autocomplete="new-password" required minlength="10" maxlength="128">
      <p class="hint">At least 10 characters. Signing in elsewhere will be ended.</p>
      <button class="btn btn-primary" type="submit">Change password</button>
    </form>

    <form class="form card danger" method="post" action="/account/delete">
      <h2>Delete account</h2>
      <p>This permanently removes your account and everything you posted. It cannot be undone.</p>
      ${errors.delete ? html`<p class="form-error" role="alert">${errors.delete}</p>` : ''}
      ${csrfField(ctx)}
      <label for="del-pass">Confirm with your password</label>
      <input id="del-pass" name="password" type="password" autocomplete="current-password" required maxlength="128">
      <button class="btn btn-danger" type="submit">Delete my account</button>
    </form>
  </div>`;
  return page(ctx, { title: 'Your account', body, robots: 'noindex' });
}

/* ------------------------------ Errors -------------------------------- */
function errorPage(ctx, status, message) {
  const friendly = {
    404: ['Page not found', 'That page does not exist or has moved.'],
    403: ['Access denied', 'You do not have permission to do that.'],
    429: ['Slow down', 'You are doing that too quickly. Wait a moment and try again.'],
    500: ['Something went wrong', 'It is on our side. Try again in a minute.'],
  }[status] || ['Request failed', String(message || 'The request could not be completed.')];
  const body = html`<div class="wrap prose-wrap center error-page">
    <p class="error-code">${status}</p>
    <h1 class="page-title">${friendly[0]}</h1>
    <p class="page-lead">${friendly[1]}</p>
    <div class="cta-row center-row"><a class="btn btn-primary" href="/">Back to home</a><a class="btn btn-ghost" href="/forum">Open the forum</a></div>
  </div>`;
  return page(ctx, { title: friendly[0], body, robots: 'noindex' });
}

module.exports = { home, rules, privacy, terms, cookies, team, newsList, newsStory, account, errorPage, paragraphs, fmtDateTime };
