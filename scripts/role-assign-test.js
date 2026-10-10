'use strict';
const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert');

const PORT = 3800 + Math.floor(Math.random() * 200);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fide-role-test-'));
process.env.DB_PATH = path.join(TMP, 'test.db');
process.env.PORT = String(PORT);
process.env.SITE_URL = `http://localhost:${PORT}`;
process.env.NODE_ENV = 'development';

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
}

async function run() {
  const adminHash = await sec.hashPassword('Pass-12345!');
  const userHash = await sec.hashPassword('Pass-12345!');
  const chief = db.prepare("INSERT INTO users (username, email, password_hash, role, staff_title, created_at) VALUES ('chief_admin', 'chief@fidecity.com', ?, 'admin', 'Chief Administrator', ?)").run(adminHash, Date.now());
  const player = db.prepare("INSERT INTO users (username, email, password_hash, role, staff_title, created_at) VALUES ('test_citizen', 'citizen@fidecity.com', ?, 'member', 'EN | Player', ?)").run(userHash, Date.now());
  const playerId = Number(player.lastInsertRowid);

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

    console.log('\nAll Staff Panel role assignment tests PASSED!');
  } finally {
    server.kill();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
