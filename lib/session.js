'use strict';
// Server-side sessions: the cookie carries only a random id (+ HMAC), the data lives in SQLite.
const crypto = require('node:crypto');
const config = require('./config');
const { db } = require('./db');
const { newToken, safeEqual } = require('./security');

const COOKIE = config.isProd ? '__Host-fc_sid' : 'fc_sid';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, sliding
const IDLE_REFRESH_MS = 10 * 60 * 1000;

const q = {
  get: db.prepare('SELECT data, expires FROM sessions WHERE sid = ? AND expires > ?'),
  put: db.prepare('INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires'),
  del: db.prepare('DELETE FROM sessions WHERE sid = ?'),
  delUser: db.prepare("DELETE FROM sessions WHERE json_extract(data, '$.userId') = ?"),
};

function sign(sid) {
  return crypto.createHmac('sha256', config.sessionSecret).update(sid).digest('base64url');
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k && !(k in out)) out[k] = v;
  }
  return out;
}

function cookieHeader(value, maxAgeSec) {
  const attrs = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (config.isProd) attrs.push('Secure');
  return attrs.join('; ');
}

class Session {
  constructor(sid, data, isNew) {
    this.sid = sid;
    this.data = data;
    this.isNew = isNew;
    this.dirty = isNew;
    this.destroyed = false;
    this.lastTouch = Date.now();
  }
  get(k) {
    return this.data[k];
  }
  set(k, v) {
    this.data[k] = v;
    this.dirty = true;
  }
  delete(k) {
    delete this.data[k];
    this.dirty = true;
  }
  /** New id, same data: call after login/privilege change to prevent session fixation. */
  regenerate() {
    q.del.run(this.sid);
    this.sid = newToken(32);
    this.isNew = true;
    this.dirty = true;
  }
  destroy() {
    q.del.run(this.sid);
    this.destroyed = true;
    this.data = {};
  }
}

/** Load the session for a request (or create a fresh, unsaved one). */
function load(req) {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[COOKIE];
  if (raw && raw.length < 200) {
    const [sid, sig] = raw.split('.');
    if (sid && sig && safeEqual(sig, sign(sid))) {
      const row = q.get.get(sid, Date.now());
      if (row) {
        try {
          const s = new Session(sid, JSON.parse(row.data), false);
          s.lastTouch = row.expires - MAX_AGE_MS;
          return s;
        } catch (_) {
          /* fall through to a fresh session */
        }
      }
    }
  }
  return new Session(newToken(32), {}, true);
}

/** Persist and return the Set-Cookie header (or null if nothing to do). */
function commit(session) {
  if (session.destroyed) return cookieHeader('', 0);
  const now = Date.now();
  const needsRefresh = now - session.lastTouch > IDLE_REFRESH_MS;
  if (!session.dirty && !needsRefresh) return null;
  // Do not store empty anonymous sessions.
  if (session.isNew && Object.keys(session.data).length === 0) return null;
  q.put.run(session.sid, JSON.stringify(session.data), now + MAX_AGE_MS);
  session.dirty = false;
  session.isNew = false;
  session.lastTouch = now;
  return cookieHeader(`${session.sid}.${sign(session.sid)}`, Math.floor(MAX_AGE_MS / 1000));
}

function destroyAllForUser(userId) {
  q.delUser.run(userId);
}

module.exports = { load, commit, destroyAllForUser, COOKIE };
