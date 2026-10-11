'use strict';
// All settings come from environment variables (or a local .env file). See .env.example.
const path = require('node:path');
const crypto = require('node:crypto');

try {
  process.loadEnvFile(path.join(__dirname, '..', '.env')); // real environment variables always win
} catch (_) {
  /* no .env file: fine, use the real environment */
}

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const port = Number(env.PORT) || 3000;

function flag(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

/** Only accept https links so a typo or a bad value can never put a javascript: URL on the page. */
function httpsUrl(value) {
  if (!value) return '';
  try {
    const u = new URL(value);
    return u.protocol === 'https:' ? u.toString() : '';
  } catch (_) {
    return '';
  }
}

let sessionSecret = env.SESSION_SECRET || 'fide-city-roleplay-production-session-secret-salt-2026-v1-persistent-key';

const config = {
  isProd,
  port,
  siteUrl: (env.SITE_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
  // Number of reverse proxies in front of the app. 0 = none (use the socket address).
  trustProxy: Math.max(0, parseInt(env.TRUST_PROXY, 10) || 0),
  sessionSecret,
  dbPath: env.DB_PATH || (env.VERCEL ? '/tmp/fidecity.db' : path.join(__dirname, '..', 'data', 'fidecity.db')),
  rootAdminEmail: (env.ROOT_ADMIN_EMAIL || 'basharathussain.mail@gmail.com').trim().toLowerCase(),

  server: {
    name: 'Fide City Roleplay',
    statusHost: (env.FIVEM_STATUS_HOST || '').trim(),
    connect: (env.FIVEM_CONNECT || 'connect cfx.re/join/your-code').trim(),
    maxPlayers: Number(env.FIVEM_MAX_PLAYERS) || 128,
  },

  links: {
    discord: httpsUrl(env.DISCORD_INVITE),
    instagram: httpsUrl(env.INSTAGRAM_URL),
    youtube: httpsUrl(env.YOUTUBE_URL),
    tiktok: httpsUrl(env.TIKTOK_URL),
    supportEmail: (env.SUPPORT_EMAIL || '').trim(),
  },

  registrationOpen: flag(env.REGISTRATION_OPEN, true),

  turnstile: {
    siteKey: (env.TURNSTILE_SITE_KEY || '').trim(),
    secret: (env.TURNSTILE_SECRET || '').trim(),
  },
  passwordReset: {
    resendApiKey: (env.RESEND_API_KEY || '').trim(),
    fromEmail: (env.RESET_FROM_EMAIL || '').trim(),
  },

  supabase: {
    url: (env.SUPABASE_URL || '').trim(),
    key: (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY || env.SUPABASE_ANON_KEY || '').trim(),
  },
};
config.turnstile.enabled = Boolean(config.turnstile.siteKey && config.turnstile.secret);
config.supabase.enabled = Boolean(config.supabase.url && config.supabase.key);

module.exports = config;
