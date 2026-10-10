'use strict';

let initError = null;
let app;

try {
  const config = require('./lib/config');
  const { db } = require('./lib/db');
  app = require('./lib/http');
  const pages = require('./views/pages');

  // Error pages and signed-in user lookup
  app.setErrorRenderer((ctx, status, message) => ctx.html(pages.errorPage(ctx, status, message), status));
  const loadUser = db.prepare('SELECT id, username, email, role, staff_title, avatar, created_at, banned FROM users WHERE id = ?');
  app.setUserLoader((id) => {
    const u = loadUser.get(id);
    if (!u) return null;
    if (u.email && u.email.toLowerCase().trim() === config.rootAdminEmail) {
      u.role = 'root_admin';
    } else if (u.role === 'root_admin') {
      u.role = 'admin';
    }
    return u;
  });

  // Routes
  require('./routes/public');
  require('./routes/auth');
  require('./routes/forum');
  require('./routes/admin');

  // Initial Supabase sync in background
  if (config.supabase && config.supabase.enabled) {
    const { syncFromSupabase, syncLocalToSupabase } = require('./lib/supabase');
    syncFromSupabase().then(() => syncLocalToSupabase()).catch((e) => console.error('[supabase boot sync]', e.message));
  }
} catch (err) {
  initError = err;
  console.error('[Startup Error]:', err);
}

const handler = (req, res) => {
  if (initError) {
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`<h2>Application Startup Error</h2><pre>${initError.stack || initError.message}</pre>`);
  }
  return app.handle(req, res).catch((err) => {
    console.error('[fatal handler error]', err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('500 Internal Server Error: ' + (err.message || 'Unknown error'));
  });
};

module.exports = handler;

if (!process.env.VERCEL) {
  const http = require('node:http');
  const config = require('./lib/config');
  const server = http.createServer(
    { maxHeaderSize: 16 * 1024, keepAliveTimeout: 5000, requestTimeout: 20000, headersTimeout: 10000 },
    handler
  );
  server.maxRequestsPerSocket = 200;
  server.on('clientError', (err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });

  server.listen(config.port, () => {
    console.log(`${config.server.name} listening on ${config.siteUrl} (port ${config.port}, ${config.isProd ? 'production' : 'development'})`);
  });

  function shutdown(signal) {
    console.log(`${signal} received, shutting down`);
    server.close(() => {
      try {
        const { db } = require('./lib/db');
        db.close();
      } catch (_) {
        /* already closed */
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
}
