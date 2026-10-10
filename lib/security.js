'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const config = require('./config');

const scrypt = promisify(crypto.scrypt);

/* ------------------------------------------------------------------ */
/* Password hashing (scrypt, per-user salt, constant-time compare)     */
/* ------------------------------------------------------------------ */
const SCRYPT = { N: 1 << 15, r: 8, p: 1, keylen: 64, maxmem: 96 * 1024 * 1024 };

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem,
  });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, saltB64, keyB64] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const key = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem,
    });
    return crypto.timingSafeEqual(key, expected);
  } catch (_) {
    return false;
  }
}

// Used so a login for an unknown account costs the same time as a real one.
let dummyHashPromise = null;
function dummyVerify(password) {
  if (!dummyHashPromise) dummyHashPromise = hashPassword(crypto.randomBytes(12).toString('hex'));
  return dummyHashPromise.then((h) => verifyPassword(password, h));
}

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '1234567890', '12345678910', 'qwertyuiop', 'qwerty12345',
  'iloveyou123', 'letmein1234', 'welcome1234', 'admin12345', 'administrator', 'changeme123',
  'gtav123456', 'fivem12345', 'roleplay123', 'fidecity123', 'fidecity1234', 'abcdefghij', '1q2w3e4r5t',
  'passw0rd123', 'football123', 'monkey12345', 'dragon12345', 'baseball123', 'superman123', 'trustno1234',
]);

/* ------------------------------------------------------------------ */
/* Input validation                                                    */
/* ------------------------------------------------------------------ */
const RESERVED_NAMES = new Set([
  'admin', 'administrator', 'root', 'system', 'staff', 'moderator', 'mod', 'support', 'help', 'owner',
  'fidecity', 'fide', 'official', 'server', 'null', 'undefined', 'anonymous', 'deleted',
]);

/** Always returns a string, never an array/object (defends against parameter pollution). */
function str(v, max = 10000) {
  if (typeof v !== 'string') return '';
  return v.slice(0, max);
}

/** Normalise user text: NFC, drop control chars (keep \n and \t), trim. */
function clean(v, max) {
  return str(v, max * 2 + 50)
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, '')
    .trim()
    .slice(0, max);
}

function cleanLine(v, max) {
  return clean(v, max).replace(/\s+/g, ' ');
}

function validUsername(u) {
  if (!/^[A-Za-z0-9_]{3,20}$/.test(u)) return 'Username must be 3 to 20 characters: letters, numbers and underscores only.';
  if (RESERVED_NAMES.has(u.toLowerCase())) return 'That username is reserved. Pick another.';
  return null;
}

function validEmail(e) {
  if (e.length > 254 || !/^[^\s@<>()"',;:\\]+@[^\s@<>()"',;:\\]+\.[A-Za-z]{2,}$/.test(e)) return 'Enter a valid email address.';
  return null;
}

function validPassword(p, username) {
  if (p.length < 10) return 'Password must be at least 10 characters.';
  if (p.length > 128) return 'Password must be 128 characters or fewer.';
  if (COMMON_PASSWORDS.has(p.toLowerCase())) return 'That password is too common. Choose something harder to guess.';
  if (username && p.toLowerCase().includes(username.toLowerCase())) return 'Password must not contain your username.';
  if (/^(.)\1+$/.test(p)) return 'Password must not be one repeated character.';
  return null;
}

function slugify(s) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'story';
}

/* ------------------------------------------------------------------ */
/* Rate limiting (in-memory, fixed window)                             */
/* ------------------------------------------------------------------ */
const buckets = new Map();

function limiter(name, windowMs, max) {
  return function check(key) {
    const k = `${name}:${key}`;
    const now = Date.now();
    let b = buckets.get(k);
    if (!b || b.reset <= now) {
      b = { count: 0, reset: now + windowMs };
      buckets.set(k, b);
    }
    b.count += 1;
    return { ok: b.count <= max, retryAfter: Math.max(1, Math.ceil((b.reset - now) / 1000)), remaining: Math.max(0, max - b.count) };
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
}, 60 * 1000).unref();

/* ------------------------------------------------------------------ */
/* CSRF                                                                */
/* ------------------------------------------------------------------ */
function newToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* ------------------------------------------------------------------ */
/* Security headers                                                    */
/* ------------------------------------------------------------------ */
function securityHeaders() {
  const csp = [
    "default-src 'none'",
    "script-src 'self'" + (config.turnstile.enabled ? ' https://challenges.cloudflare.com' : ''),
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "manifest-src 'self'",
    config.turnstile.enabled ? "frame-src https://challenges.cloudflare.com" : "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ];
  if (config.isProd) csp.push('upgrade-insecure-requests');

  const headers = {
    'Content-Security-Policy': csp.join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-DNS-Prefetch-Control': 'off',
    'X-Permitted-Cross-Domain-Policies': 'none',
    'Origin-Agent-Cluster': '?1',
  };
  if (config.isProd) headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload';
  return headers;
}

/* ------------------------------------------------------------------ */
/* Cloudflare Turnstile (optional)                                     */
/* ------------------------------------------------------------------ */
async function verifyTurnstile(token, ip) {
  if (!config.turnstile.enabled) return true;
  if (!token || typeof token !== 'string' || token.length > 2048) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: config.turnstile.secret, response: token, remoteip: ip || '' }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return data.success === true;
  } catch (_) {
    return false; // fail closed
  }
}

module.exports = {
  hashPassword, verifyPassword, dummyVerify,
  str, clean, cleanLine, validUsername, validEmail, validPassword, slugify,
  limiter, newToken, safeEqual, securityHeaders, verifyTurnstile,
};
