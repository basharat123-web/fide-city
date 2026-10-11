'use strict';
const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert');

const PORT = 3800 + Math.floor(Math.random() * 200);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fide-role-test-'));
process.env.DB_PATH = path.join(TMP, 'test.db');
process.env.PORT = String(PORT);
process.env.SITE_URL = `http://localhost:${PORT}`;
process.env.NODE_ENV = 'development';
process.env.ROOT_ADMIN_EMAIL = 'rootboss@example.test';

const config = require('../lib/config');
const sec = require('../lib/security');
const { db } = require('../lib/db');

class Client {
  constructor() { this.cookies = {}; }
  request(method, p, { body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const data = body ? (typeof body === 'string' ? body : new URLSearchParams(body).toString()) : null;
      const h = { ...headers };
      if (data !== null) { h['Content-Type'] = 'application/x-www-form-urlencoded'; h['Content-Length'] = Buffer.byteLength(data); }
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
          resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') });
        });
      });
      req.on('error', reject);
      if (data !== null) req.write(data);
      req.end();
    });
  }
  get(p) { return this.request('GET', p); }
  post(p, body) { return this.request('POST', p, { body }); }
  csrf(html) { const m = /name="_csrf" value="([^"]+)"/.exec(html); return m ? m[1] : ''; }
  roleOptions(html, id) {
    const start = html.indexOf(`<select id="role-sel-${id}"`);
    const end = html.indexOf('</select>', start);
    assert.ok(start >= 0 && end > start, `Role selector for ${id} is present`);
    return [...html.slice(start, end).matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
  }
}

function testSupabaseRolePersistence() {
  const supabaseModule = path.join(__dirname, '..', 'lib', 'supabase.js');
  const script = `
    const assert = require('node:assert/strict');
    const { supabase, updateUserRole, getForumThreadRecord } = require(${JSON.stringify(supabaseModule)});
    const updates = [];
    supabase.from = () => ({
      update(payload) {
        updates.push(payload);
        return { eq: async () => ({ error: null }) };
      },
    });
    (async () => {
      await updateUserRole(7, 'admin', 'Project Management', 'pm@example.test', 'EN | Player');
      await updateUserRole(8, 'root_admin', 'Project Management', 'stale-root@example.test', 'EN | Player');
      assert.equal(updates[0].role, 'admin');
      assert.equal(updates[0].staff_title, 'Project Management');
      assert.equal(updates[1].role, 'admin');
      assert.equal(updates[1].staff_title, 'Chief Administrator');

      const now = Date.now();
      const thread = { id: 2, category_id: 3, user_id: 10, title: 'Admin application', created_at: now, updated_at: now, reply_count: 0, deleted: 0 };
      const category = { id: 3, slug: 'admin-application', name: 'Admin Application', staff_only: 0 };
      const post = { id: 7, thread_id: 2, user_id: 10, body: 'Application details', created_at: now, deleted: 0 };
      const authorSelections = [];
      supabase.from = (table) => {
        let selection = '';
        let options = {};
        let limited = false;
        const result = () => {
          if (table === 'threads') return { data: thread, error: null };
          if (table === 'categories') return { data: category, error: null };
          if (table === 'posts' && options.head) return { data: null, count: 1, error: null };
          if (table === 'posts' && selection === 'id' && limited) return { data: { id: post.id }, error: null };
          if (table === 'posts') return { data: [post], error: null };
          if (table === 'users') {
            authorSelections.push(selection);
            if (selection.includes('additional_title')) {
              return { data: null, error: { message: 'column users.additional_title does not exist' } };
            }
            if (selection.includes('avatar')) {
              return { data: null, error: { message: "Could not find the 'avatar' column of 'users' in the schema cache" } };
            }
            return { data: [{ id: 10, username: 'form_author', role: 'member', staff_title: 'EN | Player' }], error: null };
          }
          throw new Error('Unexpected Supabase table: ' + table);
        };
        const builder = {
          select(value, opts = {}) { selection = value; options = opts; return builder; },
          eq() { return builder; },
          order() { return builder; },
          range() { return builder; },
          limit() { limited = true; return builder; },
          in() { return builder; },
          maybeSingle() { return Promise.resolve(result()); },
          then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
        };
        return builder;
      };
      const record = await getForumThreadRecord(2);
      assert.equal(record.cat.slug, 'admin-application');
      assert.equal(record.t.first_post_id, post.id);
      assert.equal(record.posts[0].username, 'form_author');
      assert.equal(authorSelections.length, 3, 'Missing optional author columns trigger compatibility retries');
      assert.ok(!authorSelections[1].includes('additional_title'));
      assert.ok(!authorSelections[2].includes('avatar'));
    })().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      DB_PATH: path.join(TMP, 'supabase-role-test.db'),
      ROOT_ADMIN_EMAIL: 'rootboss@example.test',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_KEY: 'test-only-key',
    },
  });
  assert.strictEqual(result.status, 0, `Supabase role persistence rules: ${result.stderr || result.stdout}`);
  console.log('  ok   Supabase preserves delegated Project Management and clamps stale root roles');
}

async function run() {
  testSupabaseRolePersistence();
  const adminHash = await sec.hashPassword('Pass-12345!');
  const userHash = await sec.hashPassword('Pass-12345!');
  const chief = db.prepare("INSERT INTO users (username, email, password_hash, role, staff_title, created_at) VALUES ('chief_admin', 'chief@fidecity.com', ?, 'admin', 'Chief Administrator', ?)").run(adminHash, Date.now());
  const player = db.prepare("INSERT INTO users (username, email, password_hash, role, staff_title, created_at) VALUES ('test_citizen', 'citizen@fidecity.com', ?, 'member', 'EN | Player', ?)").run(userHash, Date.now());
  const projectManager = db.prepare("INSERT INTO users (username, email, password_hash, role, staff_title, created_at) VALUES ('project_manager', 'pm@fidecity.com', ?, 'member', 'EN | Player', ?)").run(userHash, Date.now());
  db.prepare("INSERT INTO users (username, email, password_hash, role, staff_title, additional_title, created_at) VALUES ('rootboss', ?, ?, 'root_admin', 'Project Management', 'EN | Player', ?)").run(config.rootAdminEmail, userHash, Date.now());
  const playerId = Number(player.lastInsertRowid);
  const projectManagerId = Number(projectManager.lastInsertRowid);

  const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server.js')], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  server.stdout.on('data', (d) => (log += d));
  server.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 50 && !log.includes('listening'); i++) await new Promise(r => setTimeout(r, 100));

  try {
    const adm = new Client();
    const lp = await adm.get('/login');
    const li = await adm.post('/login', { _csrf: adm.csrf(lp.text), username: 'chief_admin', password: 'Pass-12345!' });
    assert.strictEqual(li.status, 303, 'Chief admin logged in');

    // 1. Check Staff Panel Members tab loads role selector dropdown
    const dash = await adm.get('/admin?tab=users');
    assert.strictEqual(dash.status, 200);
    assert.ok(dash.text.includes('role-sel-' + playerId), 'Staff Panel has City Role selector for citizen');
    assert.ok(dash.text.includes('Save Role'), 'Staff Panel has Save Role button');

    // 2. Assign role to citizen: "Senior Administrator"
    const assignRes = await adm.post(`/admin/users/${playerId}/role`, {
      _csrf: adm.csrf(dash.text),
      title: 'Senior Administrator',
    });
    assert.strictEqual(assignRes.status, 303, 'Role update request redirected');

    // 3. Verify citizen now has role = admin and staff_title = Senior Administrator
    const updated = db.prepare('SELECT role, staff_title FROM users WHERE id = ?').get(playerId);
    assert.strictEqual(updated.role, 'admin');
    assert.strictEqual(updated.staff_title, 'Senior Administrator');
    console.log('  ok   Role updated successfully to Senior Administrator (role: admin)');

    // 4. Assign role: "Governor" (City Leadership)
    const assignGov = await adm.post(`/admin/users/${playerId}/role`, {
      _csrf: adm.csrf(dash.text),
      title: 'Governor',
    });
    assert.strictEqual(assignGov.status, 303);
    const updatedGov = db.prepare('SELECT role, staff_title FROM users WHERE id = ?').get(playerId);
    assert.strictEqual(updatedGov.role, 'member');
    assert.strictEqual(updatedGov.staff_title, 'Governor');
    console.log('  ok   Role updated successfully to Governor (role: member)');

    // 5. Staff Panel reflects updated badge
    const dashAfter = await adm.get('/admin?tab=users');
    assert.ok(dashAfter.text.includes('Governor'), 'Staff Panel renders updated Governor badge');
    console.log('  ok   Staff Panel reflects new badge on the page');

    // 6. Root Admin can assign an additional title without changing root access.
    const root = new Client();
    const rootLoginPage = await root.get('/login');
    const rootLogin = await root.post('/login', {
      _csrf: root.csrf(rootLoginPage.text),
      username: 'rootboss',
      password: 'Pass-12345!',
    });
    assert.strictEqual(rootLogin.status, 303, 'Root Admin logged in');

    const consolePage = await root.get('/admin/root');
    assert.strictEqual(consolePage.status, 200, 'Root Master Console loads');
    assert.ok(consolePage.text.includes('name="additional_title"'), 'Root role selector edits an additional title');
    assert.ok(consolePage.text.includes('name="title"'), 'Other account selectors keep the normal title field');
    const rootRow = db.prepare("SELECT id FROM users WHERE email = ?").get(config.rootAdminEmail);
    assert.deepStrictEqual(root.roleOptions(consolePage.text, rootRow.id), adm.roleOptions(dashAfter.text, playerId), 'Root and staff selectors have the same complete role list');
    const rootSelector = consolePage.text.slice(consolePage.text.indexOf(`<select id="role-sel-${rootRow.id}"`));
    const rootExecutiveOption = rootSelector.slice(0, rootSelector.indexOf('</select>')).match(/<option value="Project Management"([^>]*)>/);
    assert.ok(rootExecutiveOption && !rootExecutiveOption[1].includes('disabled'), 'Executive roles are selectable for the Root Admin');
    const assignPm = await root.post(`/admin/users/${projectManagerId}/role`, {
      _csrf: root.csrf(consolePage.text),
      title: 'Project Management',
    });
    assert.strictEqual(assignPm.status, 303, `Project Management role assignment redirects: ${assignPm.text}`);
    const assignedPm = db.prepare('SELECT role, staff_title FROM users WHERE id = ?').get(projectManagerId);
    assert.strictEqual(assignedPm.role, 'admin', 'Delegated Project Manager is not given root_admin account role');
    assert.strictEqual(assignedPm.staff_title, 'Project Management');
    const { getPermissions, getRoleMeta } = require('../lib/roles');
    const pmPerms = getPermissions({ role: assignedPm.role, staff_title: assignedPm.staff_title, email: 'pm@fidecity.com' });
    assert.ok(pmPerms.canBan && pmPerms.canRecoverAccount && pmPerms.canChangeRole && pmPerms.hasSystemPanel, 'Project Manager receives full admin tools');
    assert.strictEqual(pmPerms.hasRootConsole, false, 'Project Manager cannot access Root Admin console');
    assert.strictEqual(getRoleMeta({ ...assignedPm, email: 'pm@fidecity.com' }).name, 'Project Management', 'Project Management title is not clamped to Chief Administrator');
    console.log('  ok   Delegated Project Manager gets full admin tools without Root Admin access');

    const pmClient = new Client();
    const pmLoginPage = await pmClient.get('/login');
    const pmLogin = await pmClient.post('/login', {
      _csrf: pmClient.csrf(pmLoginPage.text),
      username: 'project_manager',
      password: 'Pass-12345!',
    });
    assert.strictEqual(pmLogin.status, 303, 'Project Manager logs in');
    assert.strictEqual((await pmClient.get('/admin?tab=system')).status, 200, 'Project Manager can open the full admin panel');
    assert.strictEqual((await pmClient.get('/admin/root')).status, 404, 'Project Manager cannot access Root Admin console');

    const pmConsole = await pmClient.get('/admin?tab=users');
    const tryRootPromotion = await pmClient.post(`/admin/users/${playerId}/role`, {
      _csrf: pmClient.csrf(pmConsole.text),
      title: 'Project Management',
    });
    assert.strictEqual(tryRootPromotion.status, 403, 'Delegated Project Manager cannot grant Root Admin/Executive title');
    assert.strictEqual(db.prepare('SELECT role FROM users WHERE id = ?').get(playerId).role, 'member', 'Rejected promotion does not modify target');

    const rootUpdate = await root.post(`/admin/users/${rootRow.id}/role`, {
      _csrf: root.csrf(consolePage.text),
      additional_title: 'Creator of Project',
    });
    assert.strictEqual(rootUpdate.status, 303, `Root additional-role update redirects: ${rootUpdate.text}`);
    const updatedRoot = db.prepare('SELECT role, staff_title, additional_title FROM users WHERE id = ?').get(rootRow.id);
    assert.strictEqual(updatedRoot.role, 'root_admin');
    assert.strictEqual(updatedRoot.staff_title, 'Creator of Project');
    assert.strictEqual(updatedRoot.additional_title, 'Creator of Project');
    console.log('  ok   Root Admin can select an Executive role while root access remains intact');

    const rootAgain = new Client();
    const reloginPage = await rootAgain.get('/login');
    await rootAgain.post('/login', {
      _csrf: rootAgain.csrf(reloginPage.text),
      username: 'rootboss',
      password: 'Pass-12345!',
    });
    const account = await rootAgain.get('/account');
    assert.strictEqual(account.status, 200);
    assert.ok(account.text.includes('👑 Root Admin'), 'Account shows the permanent Root Admin tag');
    assert.ok(account.text.includes('Creator of Project'), 'Account shows the additional assigned role');
    assert.ok(account.text.includes('EN | Player (Permanent)'), 'Account keeps the permanent player tag');
    const { getAssignedRoleMeta } = require('../lib/roles');
    assert.strictEqual(getAssignedRoleMeta({ role: 'root_admin', staff_title: 'Creator of Project' }).name, 'Creator of Project', 'Legacy Supabase title remains a valid assigned-role fallback');
    console.log('  ok   Root Admin account renders all three role tags');

    console.log('\nAll Staff Panel role assignment tests PASSED!');
  } finally {
    server.kill();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
