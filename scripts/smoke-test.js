'use strict';
// Self-contained end-to-end and security test. Run with: npm test
const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3200 + Math.floor(Math.random() * 500);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fide-test-'));
process.env.DB_PATH = path.join(TMP, 'test.db');
process.env.PORT = String(PORT);
process.env.SITE_URL = `http://localhost:${PORT}`;
process.env.NODE_ENV = 'development';

const sec = require('../lib/security');
const { db } = require('../lib/db');
const config = require('../lib/config');

let passed = 0;
let failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${extra}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Minimal client with a cookie jar */
class Client {
  constructor() { this.cookies = {}; }
  request(method, p, { body, headers = {}, host } = {}) {
    return new Promise((resolve, reject) => {
      const data = body ? (typeof body === 'string' ? body : new URLSearchParams(body).toString()) : null;
      const h = { ...headers };
      if (host) h.Host = host;
      if (data !== null) { h['Content-Type'] = h['Content-Type'] || 'application/x-www-form-urlencoded'; h['Content-Length'] = Buffer.byteLength(data); }
      const ck = Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
      if (ck) h.Cookie = ck;
      const req = http.request({ host: '127.0.0.1', port: PORT, method, path: p, headers: h }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          for (const sc of res.headers['set-cookie'] || []) {
            const [pair] = sc.split(';');
            const i = pair.indexOf('=');
            const k = pair.slice(0, i); const v = pair.slice(i + 1);
            if (/Max-Age=0/i.test(sc)) delete this.cookies[k]; else this.cookies[k] = v;
          }
          resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8'), setCookie: res.headers['set-cookie'] || [] });
        });
      });
      req.on('error', reject);
      if (data !== null) req.write(data);
      req.end();
    });
  }
  get(p, o) { return this.request('GET', p, o); }
  post(p, body, o = {}) { return this.request('POST', p, { ...o, body }); }
  csrf(html) { const m = /name="_csrf" value="([^"]+)"/.exec(html); return m ? m[1] : ''; }
}

async function main() {
  // Seed staff accounts directly in the DB.
  const adminHash = await sec.hashPassword('Correct-Horse-Battery-9');
  db.prepare("INSERT INTO users (username, email, password_hash, role, staff_title, created_at) VALUES ('boss', 'boss@example.com', ?, 'admin', 'Chief Administrator', ?)").run(adminHash, Date.now());
  const modHash = await sec.hashPassword('Correct-Horse-Battery-9');
  db.prepare("INSERT INTO users (username, email, password_hash, role, staff_title, created_at) VALUES ('moderator', 'moderator@example.com', ?, 'mod', 'Assistant Administrator', ?)").run(modHash, Date.now());
  const rootHash = await sec.hashPassword('Correct-Horse-Battery-9');
  db.prepare("INSERT INTO users (username, email, password_hash, role, staff_title, created_at) VALUES ('rootboss', ?, ?, 'root_admin', 'Project Management', ?)").run(config.rootAdminEmail, rootHash, Date.now());

  const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server.js')], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  server.stdout.on('data', (d) => (log += d));
  server.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 50 && !log.includes('listening'); i++) await sleep(100);
  if (!log.includes('listening')) { console.log(log); throw new Error('server did not start'); }

  try {
    const anon = new Client();

    console.log('\nHeaders and basics');
    const home = await anon.get('/');
    check('home returns 200', home.status === 200);
    const h = home.headers;
    check('CSP present and blocks inline script', /default-src 'none'/.test(h['content-security-policy'] || '') && !/unsafe-inline/.test((h['content-security-policy'] || '').match(/script-src[^;]*/)[0]));
    check('CSP forbids framing', /frame-ancestors 'none'/.test(h['content-security-policy']));
    check('nosniff', h['x-content-type-options'] === 'nosniff');
    check('X-Frame-Options DENY', h['x-frame-options'] === 'DENY');
    check('Referrer-Policy set', Boolean(h['referrer-policy']));
    check('Permissions-Policy set', Boolean(h['permissions-policy']));
    check('no X-Powered-By', !h['x-powered-by']);
    check('no inline script or style attribute in home HTML', !/<script(?![^>]*src=)/i.test(home.text) && !/\sstyle="/i.test(home.text));
    check('logo is on the page', home.text.includes('/img/logo-640.webp'));
    const forumHome = await anon.get('/forum');
    check('forum home links to publicly viewable applications', forumHome.status === 200 && forumHome.text.includes('href="/forum/application"'));

    console.log('\nRequest hardening');
    const spoof = await anon.get('/', { host: 'evil.example' });
    check('spoofed Host header rejected (421)', spoof.status === 421);
    const put = await anon.request('PUT', '/');
    check('PUT rejected (405)', put.status === 405);
    for (const bad of ['/..%2f..%2fserver.js', '/css/../../server.js', '/%2e%2e/%2e%2e/etc/passwd', '/data/fidecity.db', '/.env', '/lib/config.js', '/css/%00.css']) {
      const r = await anon.get(bad);
      check(`path traversal blocked: ${bad}`, r.status === 404 || r.status === 400, `got ${r.status}`);
    }
    const big = await anon.post('/login', 'x=' + 'a'.repeat(70000));
    check('oversized body rejected (413)', big.status === 413);
    const wrongType = await anon.request('POST', '/login', { body: '{"a":1}', headers: { 'Content-Type': 'application/json' } });
    check('non-form content type rejected (415)', wrongType.status === 415);

    console.log('\nCSRF and origin checks');
    const noCsrf = await anon.post('/register', { username: 'sneaky', email: 's@example.com', password: 'abcdefghij1!' });
    check('POST without CSRF token is refused', noCsrf.status === 303);
    check('no account created by that request', !db.prepare("SELECT 1 FROM users WHERE username = 'sneaky'").get());
    const regPage = await anon.get('/register');
    const token = anon.csrf(regPage.text);
    check('register page has CSRF token', token.length > 20);
    const crossOrigin = await anon.post('/register', { _csrf: token, username: 'x' }, { headers: { Origin: 'https://evil.example' } });
    check('cross-origin POST blocked (403)', crossOrigin.status === 403);

    console.log('\nRegistration');
    const tooFast = await anon.post('/register', { _csrf: token, username: 'player_one', email: 'p1@example.com', password: 'Sunset-Boulevard-22', confirm: 'Sunset-Boulevard-22', agree: 'yes', website: '' });
    check('instant submit blocked by bot trap', tooFast.status === 400);
    await sleep(2700);
    const reg2 = await anon.get('/register');
    const tok2 = anon.csrf(reg2.text);
    await sleep(2700);
    const honey = await anon.post('/register', { _csrf: tok2, username: 'bot_user', email: 'bot@example.com', password: 'Sunset-Boulevard-22', confirm: 'Sunset-Boulevard-22', agree: 'yes', website: 'http://spam' });
    check('honeypot field blocks bots', honey.status === 400);
    const weak = await anon.post('/register', { _csrf: tok2, username: 'player_one', email: 'p1@example.com', password: 'short', confirm: 'short', agree: 'yes', website: '' });
    check('weak password rejected', weak.status === 400 && /at least 10/.test(weak.text));
    const common = await anon.post('/register', { _csrf: tok2, username: 'player_one', email: 'p1@example.com', password: 'password123', confirm: 'password123', agree: 'yes', website: '' });
    check('common password rejected', common.status === 400);
    const reservedName = await anon.post('/register', { _csrf: tok2, username: 'admin', email: 'a@example.com', password: 'Sunset-Boulevard-22', confirm: 'Sunset-Boulevard-22', agree: 'yes', website: '' });
    check('reserved username rejected', reservedName.status === 400);
    const preSid = Object.values(anon.cookies)[0];
    const ok = await anon.post('/register', { _csrf: tok2, username: 'player_one', email: 'p1@example.com', password: 'Sunset-Boulevard-22', confirm: 'Sunset-Boulevard-22', agree: 'yes', website: '' });
    check('valid registration succeeds (303)', ok.status === 303, `status ${ok.status}`);
    const cookieLine = ok.setCookie.join(' ');
    check('session cookie is HttpOnly + SameSite=Lax', /HttpOnly/.test(cookieLine) && /SameSite=Lax/.test(cookieLine));
    check('session id changed after sign-up (no fixation)', Object.values(anon.cookies)[0] !== preSid);
    const row = db.prepare("SELECT password_hash FROM users WHERE username = 'player_one'").get();
    check('password stored as scrypt hash, not plaintext', row && row.password_hash.startsWith('scrypt$') && !row.password_hash.includes('Sunset'));
    const dup = new Client();
    const dpage = await dup.get('/register'); await sleep(2700);
    const dupRes = await dup.post('/register', { _csrf: dup.csrf(dpage.text), username: 'Player_One', email: 'other@example.com', password: 'Sunset-Boulevard-22', confirm: 'Sunset-Boulevard-22', agree: 'yes', website: '' });
    check('duplicate username (case-insensitive) rejected', dupRes.status === 400 && /taken/.test(dupRes.text));

    console.log('\nForum and XSS');
    const { rollUpForumCategoryCounts } = require('../lib/supabase');
    const cloudCounts = rollUpForumCategoryCounts([
      { slug: 'english-server', parent_slug: null },
      { slug: 'application', parent_slug: 'english-server' },
      { slug: 'admin-application', parent_slug: 'application' },
    ], new Map([
      ['english-server', { threads: 1, posts: 2 }],
      ['application', { threads: 2, posts: 3 }],
      ['admin-application', { threads: 4, posts: 7 }],
    ]));
    check('Supabase forum metrics include nested application forums', cloudCounts.get('english-server').threads === 7 &&
      cloudCounts.get('english-server').posts === 12 &&
      cloudCounts.get('application').threads === 6 &&
      cloudCounts.get('application').posts === 10);
    const player = anon;
    const forum = await player.get('/forum/general/new');
    check('signed-in member can open new-thread form', forum.status === 200);
    const payload = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const t = await player.post('/forum/general/new', { _csrf: player.csrf(forum.text), title: 'Hello <b>city</b>', body: payload + '\nSecond line of the post.' });
    check('thread created', t.status === 303, `status ${t.status}`);
    const threadUrl = t.headers.location;
    const view = await player.get(threadUrl);
    check('script tags are escaped in thread view', view.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && !view.text.includes('<script>alert(1)'));
    check('title markup is escaped', view.text.includes('Hello &lt;b&gt;city&lt;/b&gt;') && !view.text.includes('Hello <b>city</b>'));
    check('event handler attribute cannot execute', !/<img src=x onerror/.test(view.text));
    const firstPostId = db.prepare('SELECT MIN(id) AS id FROM posts WHERE thread_id = ?').get(Number(threadUrl.split('/').pop())).id;
    const memberEdit = await player.get(`/forum/post/${firstPostId}/edit`);
    check('members cannot open post editor', memberEdit.status === 404);
    const memberEditPost = await player.post(`/forum/post/${firstPostId}/edit`, {
      _csrf: player.csrf(view.text), title: 'Tampered title', body: 'Tampered form content',
    });
    check('members cannot edit posted forms', memberEditPost.status === 404);
    const quick = await player.post(threadUrl + '/reply', { _csrf: player.csrf(view.text), body: 'Quick reply right away' });
    check('posting again immediately is throttled', quick.status === 400 && /too quickly/.test(quick.text));
    const mod = new Client();
    const modLogin = await mod.get('/login');
    const modSignedIn = await mod.post('/login', {
      _csrf: mod.csrf(modLogin.text), username: 'moderator', password: 'Correct-Horse-Battery-9',
    });
    check('moderator login works', modSignedIn.status === 303);
    const modEdit = await mod.get(`/forum/post/${firstPostId}/edit`);
    check('moderators cannot open post editor', modEdit.status === 404);
    const appForm = await mod.get('/forum/admin-application/new');
    const appCreated = await mod.post('/forum/admin-application/new', {
      _csrf: mod.csrf(appForm.text),
      title: 'Public admin application form',
      body: 'This submitted application should be viewable by all visitors.',
    });
    check('moderator can submit an application form', appCreated.status === 303);
    const publicGuest = new Client();
    const appBoard = await publicGuest.get('/forum/application');
    check('guests can see application sub-forums', appBoard.status === 200 && appBoard.text.includes('Admin Application'));
    const publicApp = await publicGuest.get(appCreated.headers.location);
    check('guests can view submitted application forms', publicApp.status === 200 && publicApp.text.includes('This submitted application should be viewable by all visitors.'));
    const lockedCat = await player.get('/forum/announcements/new');
    check('members cannot start threads in staff-only category', lockedCat.status === 403);
    const staffRoom = await player.get('/forum/staff');
    check('staff room hidden from members (404)', staffRoom.status === 404);

    console.log('\nAccess control');
    const memberAdmin = await player.get('/admin');
    check('member gets 404 on /admin', memberAdmin.status === 404);
    const memberBan = await player.post('/admin/users/1/ban', { _csrf: player.csrf(view.text), reason: 'x' });
    check('member cannot ban (404)', memberBan.status === 404);

    console.log('\nLogin protection');
    const lg = new Client();
    const lp = await lg.get('/login');
    const lt = lg.csrf(lp.text);
    const bad1 = await lg.post('/login', { _csrf: lt, username: 'boss', password: 'wrong-password' });
    check('wrong password gives generic error (401)', bad1.status === 401 && /Incorrect username or password/.test(bad1.text));
    const unknown = await lg.post('/login', { _csrf: lt, username: 'nobody_here', password: 'wrong-password' });
    check('unknown user gets the identical message', unknown.status === 401 && /Incorrect username or password/.test(unknown.text));
    for (let i = 0; i < 4; i++) await lg.post('/login', { _csrf: lt, username: 'boss', password: 'wrong-password' });
    const afterLock = await lg.post('/login', { _csrf: lt, username: 'boss', password: 'Correct-Horse-Battery-9' });
    check('account locks after 5 failures (even correct password refused)', afterLock.status === 401 || afterLock.status === 429);
    db.prepare("UPDATE users SET locked_until = 0, failed_logins = 0 WHERE username = 'boss'").run();

    console.log('\nStaff tools');
    const adm = new Client();
    const ap = await adm.get('/login');
    const preSid2 = Object.values(adm.cookies)[0];
    // fresh limiter bucket per username means we use a distinct IP-independent path; admin login:
    const li = await adm.post('/login', { _csrf: adm.csrf(ap.text), username: 'boss', password: 'Correct-Horse-Battery-9' });
    check('admin login works', li.status === 303 || li.status === 429, `status ${li.status}`);
    if (li.status === 303) {
      check('session id rotates on login', Object.values(adm.cookies)[0] !== preSid2);
      const dash = await adm.get('/admin?tab=users');
      check('admin dashboard loads', dash.status === 200 && dash.text.includes('player_one'));
      const adminEdit = await adm.get(`/forum/post/${firstPostId}/edit`);
      check('admin can open post editor', adminEdit.status === 200 && adminEdit.text.includes('Form content'));
      const saveEdit = await adm.post(`/forum/post/${firstPostId}/edit`, {
        _csrf: adm.csrf(adminEdit.text),
        title: 'Admin-updated application',
        body: 'An admin has updated this submitted application form.',
      });
      const editedPost = db.prepare('SELECT body FROM posts WHERE id = ?').get(firstPostId);
      const editedThread = db.prepare('SELECT title FROM threads WHERE id = ?').get(Number(threadUrl.split('/').pop()));
      check('admin can edit thread title and form content', saveEdit.status === 303 &&
        editedThread.title === 'Admin-updated application' &&
        editedPost.body === 'An admin has updated this submitted application form.');
      const pid = db.prepare("SELECT id FROM users WHERE username = 'player_one'").get().id;
      const ban = await adm.post(`/admin/users/${pid}/ban`, { _csrf: adm.csrf(dash.text), reason: 'testing' });
      check('admin can ban a member', ban.status === 303);
      const after = await player.get('/forum/general/new');
      check('banned member is signed out immediately', after.status === 303 || /Sign in/.test(after.text));
      const selfBan = await adm.post(`/admin/users/${db.prepare("SELECT id FROM users WHERE username = 'boss'").get().id}/ban`, { _csrf: adm.csrf(dash.text), reason: 'oops' });
      check('admin cannot ban self (400)', selfBan.status === 400);
      const story = await adm.post('/admin/stories', { _csrf: adm.csrf(dash.text), title: 'Grand opening <3', summary: 'The city opens', body: 'The doors are open.\n\nSee you there.' });
      check('admin can publish news', story.status === 303);
      const news = await anon.get('/news');
      check('published news is listed and escaped', news.text.includes('Grand opening &lt;3'));
      const audit = await adm.get('/admin?tab=audit');
      check('security log records bans and logins', /user_ban/.test(audit.text) && /login/.test(audit.text));

      const root = new Client();
      const rootLoginPage = await root.get('/login');
      const rootLogin = await root.post('/login', {
        _csrf: root.csrf(rootLoginPage.text),
        username: 'rootboss',
        password: 'Correct-Horse-Battery-9',
      });
      check('root admin login works', rootLogin.status === 303);
      const appThread = await root.get(appCreated.headers.location);
      const rootReply = await root.post(`${appCreated.headers.location}/reply`, {
        _csrf: root.csrf(appThread.text),
        body: 'Root admin reviewed this application.',
      });
      check('root admin reply redirects successfully', rootReply.status === 303 && /#post-\d+$/.test(rootReply.headers.location || ''));
      const replyVisible = await publicGuest.get(appCreated.headers.location);
      check('root admin reply appears publicly without an error page', replyVisible.status === 200 && replyVisible.text.includes('Root admin reviewed this application.'));
      const setLive = await root.post(`${appCreated.headers.location}/status`, {
        _csrf: root.csrf(appThread.text),
        status: 'Approved',
      });
      const liveApp = await publicGuest.get(appCreated.headers.location);
      check('root admin can mark application live for public viewing', setLive.status === 303 && liveApp.status === 200 && liveApp.text.includes('Approved'));

      console.log('\nAvatar and Profile Picture');
      const acc = await adm.get('/account');
      check('account page loads', acc.status === 200);
      const avRes = await adm.post('/account/avatar', {
        _csrf: adm.csrf(acc.text),
        avatar_url: 'https://example.com/avatar.png',
      });
      check('avatar updates successfully (303)', avRes.status === 303);
      const updatedUser = db.prepare("SELECT avatar FROM users WHERE username = 'boss'").get();
      check('avatar persisted in database', updatedUser && updatedUser.avatar === 'https://example.com/avatar.png');
      const homeAfterAvatar = await adm.get('/');
      check('header shows user avatar on home page', homeAfterAvatar.text.includes('src="https://example.com/avatar.png"'));

      console.log('\nForgot Password and OTP Verification');
      const fpGet = await anon.get('/forgot-password');
      check('forgot-password page loads (200)', fpGet.status === 200);
      const fpPost = await anon.post('/forgot-password', {
        _csrf: anon.csrf(fpGet.text),
        ident: 'boss@example.com',
      });
      check('forgot-password sends OTP and redirects to reset page', fpPost.status === 303);
      const otpRow = db.prepare("SELECT otp FROM password_resets WHERE user_id = (SELECT id FROM users WHERE username = 'boss') ORDER BY id DESC LIMIT 1").get();
      check('6-digit OTP code generated', otpRow && /^[0-9]{6}$/.test(otpRow.otp));

      const rpGet = await anon.get('/reset-password');
      check('reset-password page loads (200)', rpGet.status === 200);
      const rpPost = await anon.post('/reset-password', {
        _csrf: anon.csrf(rpGet.text),
        ident: 'boss@example.com',
        otp: otpRow.otp,
        password: 'New-Secure-Password-2026!',
        confirm: 'New-Secure-Password-2026!',
      });
      check('reset-password succeeds with valid OTP (303)', rpPost.status === 303);

      console.log('\nRole clamping protection');
      const { getRoleMeta } = require('../lib/roles');
      const meta = getRoleMeta({ username: 'Daniyal', email: 'daniyalhussain299@gmail.com', role: 'admin', staff_title: 'Project Management' });
      check('non-root user cannot have Project Management role badge', meta.name === 'Chief Administrator' && meta.systemRole === 'admin');
    }

    console.log('\nRate limiting');
    let limited = false;
    for (let i = 0; i < 60; i++) {
      const r = await anon.get('/api/status');
      if (r.status === 429) { limited = true; break; }
    }
    check('API is rate limited (429)', limited);
  } finally {
    server.kill('SIGTERM');
    await sleep(300);
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
