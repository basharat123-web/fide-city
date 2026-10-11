'use strict';
const { get } = require('../lib/http');
const { db } = require('../lib/db');
const config = require('../lib/config');
const { limiter } = require('../lib/security');
const { getStatus } = require('../lib/fivem');
const pages = require('../views/pages');
const { httpError } = require('./helpers');

const statusLimit = limiter('status', 60 * 1000, 40);

get('/', (ctx) => {
  const stories = db
    .prepare('SELECT id, slug, title, summary, created_at FROM stories WHERE published = 1 ORDER BY created_at DESC LIMIT 3')
    .all();
  ctx.html(pages.home(ctx, { stories }));
});

get('/rules', (ctx) => ctx.html(pages.rules(ctx)));
get('/privacy', (ctx) => ctx.html(pages.privacy(ctx)));
get('/terms', (ctx) => ctx.html(pages.terms(ctx)));
get('/cookies', (ctx) => ctx.html(pages.cookies(ctx)));

get('/team', (ctx) => {
  const staff = db
    .prepare("SELECT username, role, staff_title, additional_title, avatar FROM users WHERE role IN ('root_admin', 'admin', 'mod') AND banned = 0 ORDER BY CASE role WHEN 'root_admin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, username")
    .all();
  ctx.html(pages.team(ctx, { staff }));
});

get('/news', (ctx) => {
  const stories = db
    .prepare('SELECT id, slug, title, summary, created_at FROM stories WHERE published = 1 ORDER BY created_at DESC LIMIT 50')
    .all();
  ctx.html(pages.newsList(ctx, { stories }));
});

get('/news/:slug', (ctx) => {
  if (!/^[a-z0-9-]{1,60}$/.test(ctx.params.slug)) throw httpError(404, 'Page not found');
  const story = db.prepare('SELECT * FROM stories WHERE slug = ? AND published = 1').get(ctx.params.slug);
  if (!story) throw httpError(404, 'Page not found');
  const author = db.prepare('SELECT username FROM users WHERE id = ?').get(story.author_id);
  ctx.html(pages.newsStory(ctx, { story, author: author ? author.username : 'Fide City team' }));
});

get('/api/status', async (ctx) => {
  const rl = statusLimit(ctx.ip);
  if (!rl.ok) return ctx.json({ error: 'rate_limited' }, 429, { 'Retry-After': String(rl.retryAfter) });
  const s = await getStatus();
  ctx.json(s, 200, { 'Cache-Control': 'public, max-age=10' });
});

get('/healthz', (ctx) => ctx.json({ ok: true }));

get('/api/sync', async (ctx) => {
  if (!config.supabase || !config.supabase.enabled) {
    return ctx.json({ ok: false, error: 'Supabase credentials missing or not configured' }, 400);
  }
  const { syncFromSupabase, syncLocalToSupabase } = require('../lib/supabase');
  await syncLocalToSupabase();
  await syncFromSupabase();
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  ctx.json({ ok: true, message: 'Synced with Supabase successfully!', totalUsers: count });
});

get('/favicon.ico', (ctx) => ctx.redirect('/img/favicon.png', 301));

get('/robots.txt', (ctx) => {
  const txt = [
    'User-agent: *',
    'Disallow: /admin',
    'Disallow: /account',
    'Disallow: /login',
    'Disallow: /register',
    'Disallow: /api/',
    '',
    `Sitemap: ${config.siteUrl}/sitemap.xml`,
    '',
  ].join('\n');
  ctx.send(200, txt, 'text/plain; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' });
});

// Standard way for security researchers to reach you privately (RFC 9116).
get('/.well-known/security.txt', (ctx) => {
  const expires = new Date(Date.now() + 180 * 86400000).toISOString();
  const txt = [
    `Contact: mailto:${config.links.supportEmail}`,
    `Expires: ${expires}`,
    'Preferred-Languages: en',
    `Canonical: ${config.siteUrl}/.well-known/security.txt`,
    '',
  ].join('\n');
  ctx.send(200, txt, 'text/plain; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' });
});

get('/sitemap.xml', (ctx) => {
  const base = config.siteUrl;
  const urls = ['/', '/rules', '/forum', '/news', '/team', '/privacy', '/terms', '/cookies'];
  db.prepare('SELECT slug FROM stories WHERE published = 1 ORDER BY created_at DESC LIMIT 200')
    .all()
    .forEach((s) => urls.push(`/news/${s.slug}`));
  db.prepare('SELECT slug FROM categories WHERE staff_only = 0')
    .all()
    .forEach((c) => urls.push(`/forum/${c.slug}`));
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${base}${u}</loc></url>`).join('\n') +
    '\n</urlset>\n';
  ctx.send(200, xml, 'application/xml; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' });
});
