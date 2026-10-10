'use strict';
// Minimal, dependency-free HTTP framework: router, body parsing, static files, context helpers.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('./config');
const sessions = require('./session');
const { SafeHtml } = require('./html');
const { newToken, safeEqual, securityHeaders, limiter } = require('./security');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const BASE_HEADERS = securityHeaders();
const MAX_BODY = 64 * 1024; // 64 KB

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

/* ------------------------------ client IP ------------------------------ */
function clientIp(req) {
  const direct = req.socket.remoteAddress || '';
  const hops = config.trustProxy;
  if (!hops) return direct;
  const xff = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!xff.length) return direct;
  const n = hops === true ? 1 : Number(hops);
  if (Number.isInteger(n) && n > 0) return xff[Math.max(0, xff.length - n)] || direct;
  return direct;
}

/* ------------------------------ Host check ----------------------------- */
const allowedHosts = new Set();
try {
  allowedHosts.add(new URL(config.siteUrl).host.toLowerCase());
} catch (_) {
  /* ignore */
}
if (!config.isProd || process.env.VERCEL) {
  allowedHosts.add(`localhost:${config.port}`);
  allowedHosts.add(`127.0.0.1:${config.port}`);
  allowedHosts.add('localhost');
}

function isAllowedHost(host) {
  if (!host) return false;
  const h = String(host).toLowerCase();
  if (process.env.VERCEL || h.endsWith('.vercel.app')) return true;
  return allowedHosts.has(h);
}

/* ------------------------------ Body parser ---------------------------- */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/x-www-form-urlencoded') {
      req.resume();
      return reject(Object.assign(new Error('Unsupported content type'), { status: 415 }));
    }
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > MAX_BODY) {
      req.resume();
      return reject(Object.assign(new Error('Payload too large'), { status: 413 }));
    }
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        req.destroy();
        return reject(Object.assign(new Error('Payload too large'), { status: 413 }));
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const params = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      const body = Object.create(null);
      for (const [k, v] of params) if (!(k in body) && k.length <= 64) body[k] = v; // first value wins
      resolve(body);
    });
    req.on('error', reject);
  });
}

/* ------------------------------- Router -------------------------------- */
const routes = [];

function compile(pattern) {
  const keys = [];
  const re = new RegExp(
    '^' +
      pattern.replace(/\/:([A-Za-z]+)/g, (_, k) => {
        keys.push(k);
        return '/([^/]+)';
      }) +
      '/?$'
  );
  return { re, keys };
}

function route(method, pattern, ...handlers) {
  routes.push({ method, ...compile(pattern), handlers });
}

const get = (p, ...h) => route('GET', p, ...h);
const post = (p, ...h) => route('POST', p, ...h);

/* ------------------------------ Context -------------------------------- */
class Context {
  constructor(req, res, url) {
    this.req = req;
    this.res = res;
    this.url = url;
    this.path = url.pathname;
    this.query = url.searchParams;
    this.params = {};
    this.body = Object.create(null);
    this.ip = clientIp(req);
    this.session = sessions.load(req);
    this.user = null;
    this.responded = false;
    this.nonceFree = true;
  }

  csrfToken() {
    let t = this.session.get('csrf');
    if (!t) {
      t = newToken(32);
      this.session.set('csrf', t);
    }
    return t;
  }

  flash(type, message) {
    this.session.set('flash', { type, message });
  }

  takeFlash() {
    const f = this.session.get('flash');
    if (f) this.session.delete('flash');
    return f || null;
  }

  head(status, headers = {}) {
    if (this.responded) return;
    this.responded = true;
    const cookie = sessions.commit(this.session);
    const h = { ...BASE_HEADERS, ...headers };
    if (cookie) h['Set-Cookie'] = cookie;
    this.res.writeHead(status, h);
  }

  send(status, body, type = 'text/html; charset=utf-8', extra = {}) {
    const text = body instanceof SafeHtml ? body.toString() : String(body);
    const buf = Buffer.from(text, 'utf8');
    this.head(status, {
      'Content-Type': type,
      'Content-Length': buf.length,
      'Cache-Control': 'no-store',
      ...extra,
    });
    this.res.end(this.req.method === 'HEAD' ? undefined : buf);
  }

  html(body, status = 200) {
    this.send(status, body);
  }

  json(obj, status = 200, extra = {}) {
    this.send(status, JSON.stringify(obj), 'application/json; charset=utf-8', extra);
  }

  redirect(location, status = 303) {
    // Only ever redirect to same-site paths.
    const safe = typeof location === 'string' && location.startsWith('/') && !location.startsWith('//') && !location.includes('\\') ? location : '/';
    this.head(status, { Location: safe, 'Content-Length': 0, 'Cache-Control': 'no-store' });
    this.res.end();
  }
}

/* --------------------------- Static files ------------------------------ */
async function serveStatic(ctx) {
  const { req, res } = ctx;
  let rel;
  try {
    rel = decodeURIComponent(ctx.path);
  } catch (_) {
    return false;
  }
  if (rel.includes('\0') || rel.includes('\\')) return false;
  const full = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!full.startsWith(PUBLIC_DIR + path.sep)) return false;
  const ext = path.extname(full).toLowerCase();
  const type = MIME[ext];
  if (!type) return false;
  // Never serve dotfiles except /.well-known
  const relFromPublic = path.relative(PUBLIC_DIR, full).split(path.sep);
  if (relFromPublic.some((seg) => seg.startsWith('.') && seg !== '.well-known')) return false;

  let st;
  try {
    st = await fsp.stat(full);
  } catch (_) {
    return false;
  }
  if (!st.isFile()) return false;

  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const immutable = /\.(png|jpe?g|webp|avif|woff2|svg|ico)$/.test(ext);
  const headers = {
    ...BASE_HEADERS,
    'Content-Type': type,
    'Content-Length': st.size,
    ETag: etag,
    'Last-Modified': st.mtime.toUTCString(),
    'Cache-Control': immutable ? 'public, max-age=604800' : 'public, max-age=300, must-revalidate',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
  ctx.responded = true;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': headers['Cache-Control'] });
    res.end();
    return true;
  }
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end(), true;
  fs.createReadStream(full).pipe(res);
  return true;
}

/* ------------------------------ Pipeline -------------------------------- */
let renderError = (ctx, status, message) => ctx.send(status, `${status} ${message}`, 'text/plain; charset=utf-8');
function setErrorRenderer(fn) {
  renderError = fn;
}

const globalLimit = limiter('global', 60 * 1000, 240); // 240 requests / minute / IP

async function handle(req, res) {
  let url;
  try {
    const host = String(req.headers.host || '').toLowerCase();
    if (!isAllowedHost(host)) {
      res.writeHead(421, { 'Content-Type': 'text/plain', ...BASE_HEADERS });
      return res.end('421 Misdirected Request');
    }
    url = new URL(req.url, `http://${host}`);
  } catch (_) {
    res.writeHead(400, { 'Content-Type': 'text/plain', ...BASE_HEADERS });
    return res.end('400 Bad Request');
  }

  const ctx = new Context(req, res, url);

  try {
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD, POST');
      return renderError(ctx, 405, 'Method not allowed');
    }

    const rl = globalLimit(ctx.ip);
    if (!rl.ok) {
      return ctx.send(429, 'Too many requests. Slow down and try again shortly.', 'text/plain; charset=utf-8', {
        'Retry-After': String(rl.retryAfter),
      });
    }

    if (req.method !== 'POST' && (await serveStatic(ctx))) return;

    // Load the signed-in user (if any); banned or deleted accounts are signed out here.
    await attachUser(ctx);

    // Find route
    let matched = null;
    let methodMismatch = false;
    const lookupMethod = req.method === 'HEAD' ? 'GET' : req.method;
    for (const r of routes) {
      const m = r.re.exec(ctx.path);
      if (!m) continue;
      if (r.method !== lookupMethod) {
        methodMismatch = true;
        continue;
      }
      matched = { r, m };
      break;
    }
    if (!matched) {
      if (methodMismatch) return renderError(ctx, 405, 'Method not allowed');
      return renderError(ctx, 404, 'Page not found');
    }

    matched.r.keys.forEach((k, i) => {
      try {
        ctx.params[k] = decodeURIComponent(matched.m[i + 1]);
      } catch (_) {
        ctx.params[k] = '';
      }
    });

    if (req.method === 'POST') {
      // Defence in depth: browsers send Origin on POST; it must match our host.
      const origin = req.headers.origin;
      if (origin && origin !== 'null') {
        let oh = '';
        try {
          oh = new URL(origin).host.toLowerCase();
        } catch (_) {
          /* invalid */
        }
        if (!isAllowedHost(oh)) return renderError(ctx, 403, 'Cross-site request blocked');
      } else if (origin === 'null') {
        return renderError(ctx, 403, 'Cross-site request blocked');
      }

      ctx.body = await readBody(req);

      const expected = ctx.session.get('csrf');
      const supplied = typeof ctx.body._csrf === 'string' ? ctx.body._csrf : '';
      if (!expected || !supplied || !safeEqual(supplied, expected)) {
        ctx.flash('error', 'Your session expired or the form was invalid. Please try again.');
        let back = '/';
        try {
          const ref = new URL(String(req.headers.referer || ''));
          if (isAllowedHost(ref.host.toLowerCase())) back = ref.pathname;
        } catch (_) {
          /* no usable referer */
        }
        return ctx.redirect(back);
      }
    }

    for (const h of matched.r.handlers) {
      await h(ctx);
      if (ctx.responded) break;
    }
    if (!ctx.responded) renderError(ctx, 500, 'No response');
  } catch (err) {
    if (err && err.status && err.status < 500) {
      if (!ctx.responded) renderError(ctx, err.status, err.message);
      return;
    }
    console.error(`[error] ${req.method} ${ctx.path}:`, err);
    if (!ctx.responded) renderError(ctx, 500, 'Something went wrong on our side');
    else if (!res.writableEnded) res.end();
  }
}

let userLoader = null;
function setUserLoader(fn) {
  userLoader = fn;
}
async function attachUser(ctx) {
  let id = ctx.session.get('userId');
  if (!id && (ctx.session.isRestoring || ctx.session.sid)) {
    if (config.supabase && config.supabase.enabled) {
      try {
        const { getSessionFromSupabase } = require('./supabase');
        const remote = await getSessionFromSupabase(ctx.session.sid);
        if (remote && remote.data) {
          const parsed = JSON.parse(remote.data);
          if (parsed && parsed.userId) {
            ctx.session.data = parsed;
            ctx.session.dirty = false;
            ctx.session.isNew = false;
            ctx.session.isRestoring = false;
            id = parsed.userId;
            const { db } = require('./db');
            db.prepare('INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires').run(ctx.session.sid, remote.data, remote.expires);
          }
        }
      } catch (_) {}
    }
  }

  if (!id || !userLoader) return;
  let user = userLoader(id);
  if (!user && config.supabase && config.supabase.enabled) {
    try {
      const { getUserByIdFromSupabase, saveUserLocal } = require('./supabase');
      const remoteUser = await getUserByIdFromSupabase(id);
      if (remoteUser) {
        saveUserLocal(remoteUser);
        user = userLoader(id);
      }
    } catch (_) {}
  }

  if (!user || user.banned) {
    ctx.session.destroy();
    ctx.session = sessions.load({ headers: {} });
    return;
  }
  ctx.user = user;
}

module.exports = { get, post, route, handle, setErrorRenderer, setUserLoader, clientIp };
