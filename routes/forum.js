'use strict';
const { get, post } = require('../lib/http');
const { db, tx, audit } = require('../lib/db');
const sec = require('../lib/security');
const view = require('../views/forum');
const { httpError, requireUser, requireStaff, isStaff, intParam, pageParam } = require('./helpers');

const PER_PAGE_THREADS = 20;
const PER_PAGE_POSTS = 20;
const MIN_GAP_MS = 20 * 1000; // minimum time between a member's posts
const newThreadLimit = sec.limiter('new-thread', 60 * 60 * 1000, 6);
const replyLimit = sec.limiter('reply', 60 * 60 * 1000, 30);

const q = {
  cats: db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM threads t WHERE t.category_id = c.id AND t.deleted = 0) AS thread_count,
      (SELECT COUNT(*) FROM posts p JOIN threads t ON t.id = p.thread_id WHERE t.category_id = c.id AND t.deleted = 0 AND p.deleted = 0) AS post_count
    FROM categories c WHERE (c.staff_only = 0 OR ? = 1) ORDER BY c.sort_order`),
  lastThread: db.prepare(`
    SELECT t.id, t.title, t.updated_at, u.username FROM threads t JOIN users u ON u.id = t.user_id
    WHERE t.category_id = ? AND t.deleted = 0 ORDER BY t.updated_at DESC LIMIT 1`),
  cat: db.prepare('SELECT * FROM categories WHERE slug = ?'),
  threadCount: db.prepare('SELECT COUNT(*) AS n FROM threads WHERE category_id = ? AND deleted = 0'),
  threads: db.prepare(`
    SELECT t.*, u.username FROM threads t JOIN users u ON u.id = t.user_id
    WHERE t.category_id = ? AND t.deleted = 0 ORDER BY t.pinned DESC, t.updated_at DESC LIMIT ? OFFSET ?`),
  thread: db.prepare('SELECT * FROM threads WHERE id = ? AND deleted = 0'),
  catById: db.prepare('SELECT * FROM categories WHERE id = ?'),
  postCount: db.prepare('SELECT COUNT(*) AS n FROM posts WHERE thread_id = ? AND deleted = 0'),
  firstPost: db.prepare('SELECT MIN(id) AS id FROM posts WHERE thread_id = ?'),
  posts: db.prepare(`
    SELECT p.*, u.username, u.role, u.staff_title FROM posts p JOIN users u ON u.id = p.user_id
    WHERE p.thread_id = ? AND p.deleted = 0 ORDER BY p.id LIMIT ? OFFSET ?`),
  lastPostBy: db.prepare('SELECT body, created_at FROM posts WHERE user_id = ? ORDER BY id DESC LIMIT 1'),
  insThread: db.prepare('INSERT INTO threads (category_id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'),
  insPost: db.prepare('INSERT INTO posts (thread_id, user_id, body, created_at) VALUES (?, ?, ?, ?)'),
  bump: db.prepare('UPDATE threads SET reply_count = reply_count + 1, updated_at = ? WHERE id = ?'),
  post: db.prepare('SELECT * FROM posts WHERE id = ? AND deleted = 0'),
  delPost: db.prepare('UPDATE posts SET deleted = 1 WHERE id = ?'),
  unbump: db.prepare('UPDATE threads SET reply_count = MAX(0, reply_count - 1) WHERE id = ?'),
  pin: db.prepare('UPDATE threads SET pinned = 1 - pinned WHERE id = ?'),
  lock: db.prepare('UPDATE threads SET locked = 1 - locked WHERE id = ?'),
  delThread: db.prepare('UPDATE threads SET deleted = 1 WHERE id = ?'),
};

/** Fetch a category the current user is allowed to see, or 404. */
function visibleCategory(ctx, slug) {
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) throw httpError(404, 'Page not found');
  const cat = q.cat.get(slug);
  if (!cat || (cat.staff_only && !isStaff(ctx.user))) throw httpError(404, 'Page not found');
  return cat;
}

function visibleThread(ctx, idParam) {
  const id = intParam(idParam);
  if (!id) throw httpError(404, 'Page not found');
  const t = q.thread.get(id);
  if (!t) throw httpError(404, 'Page not found');
  const cat = q.catById.get(t.category_id);
  if (!cat || (cat.staff_only && !isStaff(ctx.user))) throw httpError(404, 'Page not found');
  return { t, cat };
}

const canStartThread = (ctx, cat) => Boolean(ctx.user) && (!cat.locked || isStaff(ctx.user));

/** Shared checks for anything a member writes: spacing and duplicate detection. */
function tooFast(userId) {
  const last = q.lastPostBy.get(userId);
  return last && Date.now() - last.created_at < MIN_GAP_MS ? last : null;
}

/* ------------------------------- Index -------------------------------- */
get('/forum', (ctx) => {
  const categories = q.cats.all(isStaff(ctx.user) ? 1 : 0).map((c) => {
    const last = q.lastThread.get(c.id);
    return {
      ...c,
      last_title: last && last.title,
      last_thread_id: last && last.id,
      last_username: last && last.username,
      last_at: last && last.updated_at,
    };
  });
  ctx.html(view.index(ctx, { categories }));
});

/* ----------------------------- Category ------------------------------- */
get('/forum/:slug', (ctx) => {
  const cat = visibleCategory(ctx, ctx.params.slug);
  const pageNo = pageParam(ctx);
  const total = q.threadCount.get(cat.id).n;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE_THREADS));
  const p = Math.min(pageNo, pages);
  const threads = q.threads.all(cat.id, PER_PAGE_THREADS, (p - 1) * PER_PAGE_THREADS);
  ctx.html(view.category(ctx, { cat, threads, pageNo: p, pages, canPost: canStartThread(ctx, cat) }));
});

/* ----------------------------- New thread ----------------------------- */
get('/forum/:slug/new', requireUser, (ctx) => {
  const cat = visibleCategory(ctx, ctx.params.slug);
  if (!canStartThread(ctx, cat)) throw httpError(403, 'Only staff can start threads in this category.');
  ctx.html(view.newThread(ctx, { cat }));
});

post('/forum/:slug/new', requireUser, (ctx) => {
  const cat = visibleCategory(ctx, ctx.params.slug);
  if (!canStartThread(ctx, cat)) throw httpError(403, 'Only staff can start threads in this category.');

  const title = sec.cleanLine(ctx.body.title, 120);
  const bodyText = sec.clean(ctx.body.body, 5000);
  const values = { title, body: bodyText };
  const errors = {};

  if (!isStaff(ctx.user)) {
    const rl = newThreadLimit(String(ctx.user.id));
    if (!rl.ok) {
      errors.form = 'You have started several threads recently. Try again later.';
      return ctx.html(view.newThread(ctx, { cat, errors, values }), 429);
    }
  }
  if (title.length < 3) errors.title = 'Give your thread a title of at least 3 characters.';
  if (bodyText.length < 10) errors.body = 'Write at least 10 characters.';
  const last = tooFast(ctx.user.id);
  if (!isStaff(ctx.user) && last) errors.form = 'You are posting too quickly. Wait a few seconds and try again.';
  else if (last && last.body === bodyText) errors.body = 'That looks like a duplicate of your last post.';
  if (Object.keys(errors).length) return ctx.html(view.newThread(ctx, { cat, errors, values }), 400);

  const now = Date.now();
  const id = tx(() => {
    const tid = Number(q.insThread.run(cat.id, ctx.user.id, title, now, now).lastInsertRowid);
    q.insPost.run(tid, ctx.user.id, bodyText, now);
    return tid;
  });
  ctx.redirect(`/forum/thread/${id}`);
});

/* ------------------------------- Thread ------------------------------- */
get('/forum/thread/:id', (ctx) => {
  const { t, cat } = visibleThread(ctx, ctx.params.id);
  const total = q.postCount.get(t.id).n;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE_POSTS));
  const pageNo = Math.min(pageParam(ctx), pages);
  const posts = q.posts.all(t.id, PER_PAGE_POSTS, (pageNo - 1) * PER_PAGE_POSTS);
  const thread = { ...t, first_post_id: q.firstPost.get(t.id).id };
  ctx.html(view.thread(ctx, { t: thread, cat, posts, pageNo, pages, canReply: Boolean(ctx.user) && !t.locked }));
});

post('/forum/thread/:id/reply', requireUser, (ctx) => {
  const { t, cat } = visibleThread(ctx, ctx.params.id);
  const redo = (errors, draft, status = 400) => {
    const total = q.postCount.get(t.id).n;
    const pages = Math.max(1, Math.ceil(total / PER_PAGE_POSTS));
    const posts = q.posts.all(t.id, PER_PAGE_POSTS, (pages - 1) * PER_PAGE_POSTS);
    ctx.html(view.thread(ctx, { t: { ...t, first_post_id: q.firstPost.get(t.id).id }, cat, posts, pageNo: pages, pages, canReply: true, errors, draft }), status);
  };
  if (t.locked) throw httpError(403, 'This thread is locked.');

  const bodyText = sec.clean(ctx.body.body, 5000);
  if (!isStaff(ctx.user)) {
    const rl = replyLimit(String(ctx.user.id));
    if (!rl.ok) return redo({ body: 'You have replied a lot recently. Try again later.' }, bodyText, 429);
  }
  if (bodyText.length < 2) return redo({ body: 'Write a reply first.' }, bodyText);
  const last = tooFast(ctx.user.id);
  if (!isStaff(ctx.user) && last) return redo({ body: 'You are posting too quickly. Wait a few seconds.' }, bodyText);
  if (last && last.body === bodyText) return redo({ body: 'That looks like a duplicate of your last post.' }, bodyText);

  const now = Date.now();
  const pid = tx(() => {
    const id = Number(q.insPost.run(t.id, ctx.user.id, bodyText, now).lastInsertRowid);
    q.bump.run(now, t.id);
    return id;
  });
  const total = q.postCount.get(t.id).n;
  const lastPage = Math.max(1, Math.ceil(total / PER_PAGE_POSTS));
  ctx.redirect(`/forum/thread/${t.id}?page=${lastPage}#post-${pid}`);
});

/* ---------------------------- Moderation ------------------------------ */
post('/forum/thread/:id/pin', requireUser, requireStaff, (ctx) => {
  const { t } = visibleThread(ctx, ctx.params.id);
  q.pin.run(t.id);
  audit(ctx.user.id, 'thread_pin_toggle', `thread ${t.id}`, ctx.ip);
  ctx.redirect(`/forum/thread/${t.id}`);
});

post('/forum/thread/:id/lock', requireUser, requireStaff, (ctx) => {
  const { t } = visibleThread(ctx, ctx.params.id);
  q.lock.run(t.id);
  audit(ctx.user.id, 'thread_lock_toggle', `thread ${t.id}`, ctx.ip);
  ctx.redirect(`/forum/thread/${t.id}`);
});

post('/forum/thread/:id/delete', requireUser, requireStaff, (ctx) => {
  const { t, cat } = visibleThread(ctx, ctx.params.id);
  q.delThread.run(t.id);
  audit(ctx.user.id, 'thread_delete', `thread ${t.id}: ${t.title}`, ctx.ip);
  ctx.flash('ok', 'Thread deleted.');
  ctx.redirect(`/forum/${cat.slug}`);
});

post('/forum/post/:id/delete', requireUser, requireStaff, (ctx) => {
  const id = intParam(ctx.params.id);
  const p = id && q.post.get(id);
  if (!p) throw httpError(404, 'Page not found');
  const t = q.thread.get(p.thread_id);
  if (!t) throw httpError(404, 'Page not found');
  const first = q.firstPost.get(t.id).id;
  if (p.id === first) throw httpError(400, 'Delete the thread instead of its first post.');
  tx(() => {
    q.delPost.run(p.id);
    q.unbump.run(t.id);
  });
  audit(ctx.user.id, 'post_delete', `post ${p.id} in thread ${t.id}`, ctx.ip);
  ctx.flash('ok', 'Reply deleted.');
  ctx.redirect(`/forum/thread/${t.id}`);
});
