'use strict';
const http = require('node:http');
const config = require('./lib/config');
const { db } = require('./lib/db');
const app = require('./lib/http');
const pages = require('./views/pages');

// Error pages and signed-in user lookup
app.setErrorRenderer((ctx, status, message) => ctx.html(pages.errorPage(ctx, status, message), status));
const loadUser = db.prepare('SELECT id, username, email, role, staff_title, created_at, banned FROM users WHERE id = ?');
app.setUserLoader((id) => loadUser.get(id));

// Routes
require('./routes/public');
require('./routes/auth');
require('./routes/forum');
require('./routes/admin');

const server = http.createServer(
  { maxHeaderSize: 16 * 1024, keepAliveTimeout: 5000, requestTimeout: 20000, headersTimeout: 10000 },
  (req, res) => {
    app.handle(req, res).catch((err) => {
      console.error('[fatal handler error]', err);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Internal Server Error');
    });
  }
);
server.maxRequestsPerSocket = 200;
server.on('clientError', (err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

if (process.env.VERCEL) {
  module.exports = (req, res) => {
    return app.handle(req, res).catch((err) => {
      console.error('[fatal handler error]', err);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Internal Server Error');
    });
  };
} else {
  server.listen(config.port, () => {
    console.log(`${config.server.name} listening on ${config.siteUrl} (port ${config.port}, ${config.isProd ? 'production' : 'development'})`);
  });
}

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    try {
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
