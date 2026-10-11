'use strict';
const { get, post } = require('../lib/http');
const { db, tx, audit } = require('../lib/db');
const sec = require('../lib/security');
const config = require('../lib/config');
const view = require('../views/forum');
const { httpError, requireUser, requireStaff, requireAdmin, isStaff, intParam, pageParam } = require('./helpers');
const { getPermissions } = require('../lib/roles');

const PER_PAGE_THREADS = 20;
const PER_PAGE_POSTS = 20;
const MIN_GAP_MS = 20 * 1000; // minimum time between a member's posts
const newThreadLimit = sec.limiter('new-thread', 60 * 60 * 1000, 6);
const replyLimit = sec.limiter('reply', 60 * 60 * 1000, 30);

const { touch: touchOnline, getOnlineUsers } = require('../lib/online');

const q = {
  cats: db.prepare(`
    SELECT c.*,
      (
        SELECT COUNT(*) FROM threads t 
        WHERE (t.category_id = c.id OR t.category_id IN (SELECT id FROM categories WHERE parent_slug = c.slug)) 
          AND t.deleted = 0
      ) AS thread_count,
      (
        SELECT COUNT(*) FROM posts p 
        JOIN threads t ON t.id = p.thread_id 
        WHERE (t.category_id = c.id OR t.category_id IN (SELECT id FROM categories WHERE parent_slug = c.slug)) 
          AND t.deleted = 0 AND p.deleted = 0
      ) AS post_count
    FROM categories c 
    WHERE (c.staff_only = 0 OR ? = 1) AND (c.parent_slug IS NULL OR c.parent_slug = '') 
    ORDER BY c.sort_order`),
  subCats: db.prepare(`
    SELECT c.*,
      (
        SELECT COUNT(*) FROM threads t 
        WHERE (t.category_id = c.id OR t.category_id IN (SELECT id FROM categories WHERE parent_slug = c.slug)) 
          AND t.deleted = 0
      ) AS thread_count,
      (
        SELECT COUNT(*) FROM posts p 
        JOIN threads t ON t.id = p.thread_id 
        WHERE (t.category_id = c.id OR t.category_id IN (SELECT id FROM categories WHERE parent_slug = c.slug)) 
          AND t.deleted = 0 AND p.deleted = 0
      ) AS post_count
    FROM categories c 
    WHERE c.parent_slug = ? AND (c.staff_only = 0 OR ? = 1) 
    ORDER BY c.sort_order ASC`),
  lastSubThread: db.prepare(`
    SELECT t.id, t.title, t.status, t.updated_at, u.username, u.avatar 
    FROM threads t 
    JOIN users u ON u.id = t.user_id
    WHERE (t.category_id = ? OR t.category_id IN (SELECT id FROM categories WHERE parent_slug = ?)) 
      AND t.deleted = 0 
    ORDER BY t.updated_at DESC LIMIT 1`),
  childSubCats: db.prepare('SELECT slug, name FROM categories WHERE parent_slug = ? ORDER BY sort_order ASC'),
  lastThread: db.prepare(`
    SELECT t.id, t.title, t.status, t.updated_at, u.username, u.avatar FROM threads t JOIN users u ON u.id = t.user_id
    WHERE t.category_id = ? AND t.deleted = 0 ORDER BY t.updated_at DESC LIMIT 1`),
  latestPosts: db.prepare(`
    SELECT t.id, t.title, t.status, t.reply_count, t.updated_at,
           c.name AS category_name, c.slug AS category_slug,
           u.username, u.role, u.staff_title, u.avatar
    FROM threads t
    JOIN categories c ON c.id = t.category_id
    JOIN users u ON u.id = t.user_id
    WHERE t.deleted = 0 AND (c.staff_only = 0 OR ? = 1)
    ORDER BY t.updated_at DESC
    LIMIT 8`),
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
    SELECT p.*, u.username, u.role, u.staff_title, u.avatar FROM posts p JOIN users u ON u.id = p.user_id
    WHERE p.thread_id = ? AND p.deleted = 0 ORDER BY p.id LIMIT ? OFFSET ?`),
  lastPostBy: db.prepare('SELECT body, created_at FROM posts WHERE user_id = ? ORDER BY id DESC LIMIT 1'),
  insThread: db.prepare('INSERT INTO threads (category_id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'),
  insPost: db.prepare('INSERT INTO posts (thread_id, user_id, body, created_at) VALUES (?, ?, ?, ?)'),
  bump: db.prepare('UPDATE threads SET reply_count = reply_count + 1, updated_at = ? WHERE id = ?'),
  post: db.prepare('SELECT * FROM posts WHERE id = ? AND deleted = 0'),
  updatePostBody: db.prepare('UPDATE posts SET body = ? WHERE id = ?'),
  updateThreadTitle: db.prepare('UPDATE threads SET title = ?, updated_at = ? WHERE id = ?'),
  updateThreadTimestamp: db.prepare('UPDATE threads SET updated_at = ? WHERE id = ?'),
  delPost: db.prepare('UPDATE posts SET deleted = 1 WHERE id = ?'),
  unbump: db.prepare('UPDATE threads SET reply_count = MAX(0, reply_count - 1) WHERE id = ?'),
  pin: db.prepare('UPDATE threads SET pinned = 1 - pinned WHERE id = ?'),
  lock: db.prepare('UPDATE threads SET locked = 1 - locked WHERE id = ?'),
  delThread: db.prepare('UPDATE threads SET deleted = 1 WHERE id = ?'),
};

/** Fetch a category the current user is allowed to see, or 404. */
function visibleCategory(ctx, slug) {
  if (!/^[a-z0-9-]{1,50}$/.test(slug)) throw httpError(404, 'Page not found');
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

function isApplicationForumCategory(cat) {
  let current = cat;
  while (current) {
    if (current.slug === 'application') return true;
    current = current.parent_slug ? q.cat.get(current.parent_slug) : null;
  }
  return false;
}

function cloudForum() {
  return Boolean(config.supabase && config.supabase.enabled);
}

/** Shared checks for anything a member writes: spacing and duplicate detection. */
function tooFast(userId) {
  const last = q.lastPostBy.get(userId);
  return last && Date.now() - last.created_at < MIN_GAP_MS ? last : null;
}

/* ------------------------------- Index -------------------------------- */
get('/forum', async (ctx) => {
  if (ctx.user) touchOnline(ctx.user);
  const staff = isStaff(ctx.user) ? 1 : 0;
  let categories = q.cats.all(staff).map((c) => {
    const last = q.lastThread.get(c.id);
    return {
      ...c,
      last_title: last && last.title,
      last_thread_id: last && last.id,
      last_username: last && last.username,
      last_avatar: last && last.avatar,
      last_status: last && last.status,
      last_at: last && last.updated_at,
    };
  });
  if (cloudForum()) {
    const { getForumCategoryCounts } = require('../lib/supabase');
    const allVisibleCategories = db.prepare('SELECT * FROM categories WHERE staff_only = 0 OR ? = 1').all(staff);
    const counts = await getForumCategoryCounts(allVisibleCategories);
    categories = categories.map((category) => ({
      ...category,
      thread_count: (counts.get(category.slug) || {}).threads || 0,
      post_count: (counts.get(category.slug) || {}).posts || 0,
    }));
  }

  const groups = {};
  for (const c of categories) {
    const gName = c.group_name || 'FideCity RolePlay';
    if (!groups[gName]) groups[gName] = [];
    groups[gName].push(c);
  }

  const latestPosts = q.latestPosts.all(staff);
  const onlineData = getOnlineUsers(ctx.user);

  ctx.html(view.index(ctx, { categories, groups, latestPosts, onlineData }));
});

get('/forum/post-thread', (ctx) => {
  if (!ctx.user) {
    ctx.flash('error', 'Please sign in or register to create a thread.');
    return ctx.redirect('/login');
  }
  const target = db.prepare("SELECT slug FROM categories WHERE slug IN ('english-server', 'general') AND locked = 0 LIMIT 1").get();
  ctx.redirect(`/forum/${target ? target.slug : 'general'}/new`);
});

get('/forum/mark-read', (ctx) => {
  ctx.flash('ok', 'All forums have been marked as read.');
  ctx.redirect('/forum');
});

/* ----------------------------- Category ------------------------------- */
get('/forum/:slug', async (ctx) => {
  const cat = visibleCategory(ctx, ctx.params.slug);
  const staff = isStaff(ctx.user) ? 1 : 0;

  let subCategories = q.subCats.all(cat.slug, staff).map((sub) => {
    const last = q.lastSubThread.get(sub.id, sub.slug);
    const children = q.childSubCats.all(sub.slug);
    return {
      ...sub,
      last_title: last && last.title,
      last_thread_id: last && last.id,
      last_username: last && last.username,
      last_avatar: last && last.avatar,
      last_status: last && last.status,
      last_at: last && last.updated_at,
      children,
    };
  });
  if (cloudForum()) {
    const { getForumCategoryCounts } = require('../lib/supabase');
    const allVisibleCategories = db.prepare('SELECT * FROM categories WHERE staff_only = 0 OR ? = 1').all(staff);
    const counts = await getForumCategoryCounts(allVisibleCategories);
    subCategories = subCategories.map((sub) => ({
      ...sub,
      thread_count: (counts.get(sub.slug) || {}).threads || 0,
      post_count: (counts.get(sub.slug) || {}).posts || 0,
    }));
  }

  const pageNo = pageParam(ctx);
  let total;
  let threads;
  if (cloudForum() && isApplicationForumCategory(cat)) {
    const { listForumThreads } = require('../lib/supabase');
    const remote = await listForumThreads(cat, PER_PAGE_THREADS, (pageNo - 1) * PER_PAGE_THREADS);
    total = remote.total;
    threads = remote.threads;
  } else {
    total = q.threadCount.get(cat.id).n;
    const pages = Math.max(1, Math.ceil(total / PER_PAGE_THREADS));
    const p = Math.min(pageNo, pages);
    threads = q.threads.all(cat.id, PER_PAGE_THREADS, (p - 1) * PER_PAGE_THREADS);
  }
  const pages = Math.max(1, Math.ceil(total / PER_PAGE_THREADS));
  const p = Math.min(pageNo, pages);

  let parentCat = null;
  if (cat.parent_slug) {
    parentCat = q.cat.get(cat.parent_slug);
  }

  ctx.html(view.category(ctx, { 
    cat, 
    parentCat, 
    subCategories, 
    threads, 
    pageNo: p, 
    pages, 
    canPost: canStartThread(ctx, cat) 
  }));
});

get('/forum/:slug/mark-read', (ctx) => {
  const cat = visibleCategory(ctx, ctx.params.slug);
  ctx.flash('ok', `Category "${cat.name}" marked as read.`);
  ctx.redirect(`/forum/${cat.slug}`);
});

get('/forum/:slug/watch', (ctx) => {
  const cat = visibleCategory(ctx, ctx.params.slug);
  if (!ctx.user) {
    ctx.flash('error', 'Please sign in to watch this category.');
    return ctx.redirect('/login');
  }
  ctx.flash('ok', `You are now watching "${cat.name}".`);
  ctx.redirect(`/forum/${cat.slug}`);
});



/* ----------------------------- New thread ----------------------------- */
get('/forum/:slug/new', requireUser, (ctx) => {
  const cat = visibleCategory(ctx, ctx.params.slug);
  if (!canStartThread(ctx, cat)) throw httpError(403, 'Only staff can start threads in this category.');
  ctx.html(view.newThread(ctx, { cat }));
});

post('/forum/:slug/new', requireUser, async (ctx) => {
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

  if (cloudForum() && isApplicationForumCategory(cat)) {
    const { createForumThreadRecord } = require('../lib/supabase');
    const id = await createForumThreadRecord(cat, ctx.user, title, bodyText, null);
    return ctx.redirect(`/forum/thread/${id}`);
  }

  const now = Date.now();
  const id = tx(() => {
    const tid = Number(q.insThread.run(cat.id, ctx.user.id, title, now, now).lastInsertRowid);
    q.insPost.run(tid, ctx.user.id, bodyText, now);
    const perms = getPermissions(ctx.user);
    if (perms.canTagStatus && ctx.body.status) {
      const rawStatus = sec.cleanLine(ctx.body.status, 30);
      if (ALLOWED_STATUSES.includes(rawStatus) && rawStatus) {
        db.prepare('UPDATE threads SET status = ? WHERE id = ?').run(rawStatus, tid);
      }
    }
    return tid;
  });
  ctx.redirect(`/forum/thread/${id}`);
});

/* ------------------------------- Thread ------------------------------- */
get('/forum/thread/:id', async (ctx) => {
  if (cloudForum()) {
    const { getForumThreadRecord } = require('../lib/supabase');
    const remote = await getForumThreadRecord(intParam(ctx.params.id), pageParam(ctx), PER_PAGE_POSTS);
    if (remote) {
      const allCategories = q.cats.all(isStaff(ctx.user) ? 1 : 0);
      return ctx.html(view.thread(ctx, {
        ...remote,
        canReply: Boolean(ctx.user) && !remote.t.locked,
        allCategories,
      }));
    }
  }
  const { t, cat } = visibleThread(ctx, ctx.params.id);
  const total = q.postCount.get(t.id).n;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE_POSTS));
  const pageNo = Math.min(pageParam(ctx), pages);
  const posts = q.posts.all(t.id, PER_PAGE_POSTS, (pageNo - 1) * PER_PAGE_POSTS);
  const thread = { ...t, first_post_id: q.firstPost.get(t.id).id };
  const allCategories = q.cats.all(isStaff(ctx.user) ? 1 : 0);
  ctx.html(view.thread(ctx, { t: thread, cat, posts, pageNo, pages, canReply: Boolean(ctx.user) && !t.locked, allCategories }));
});

post('/forum/thread/:id/reply', requireUser, async (ctx) => {
  if (cloudForum()) {
    const { getForumThreadRecord, createForumReplyRecord } = require('../lib/supabase');
    const remote = await getForumThreadRecord(intParam(ctx.params.id));
    if (remote) {
      if (remote.t.locked) throw httpError(403, 'This thread is locked.');
      const bodyText = sec.clean(ctx.body.body, 5000);
      if (!isStaff(ctx.user)) {
        const rl = replyLimit(String(ctx.user.id));
        if (!rl.ok) {
          return ctx.html(view.thread(ctx, {
            ...remote,
            canReply: true,
            allCategories: q.cats.all(0),
            errors: { body: 'You have replied a lot recently. Try again later.' },
            draft: bodyText,
          }), 429);
        }
      }
      if (bodyText.length < 2) {
        return ctx.html(view.thread(ctx, {
          ...remote,
          canReply: true,
          allCategories: q.cats.all(0),
          errors: { body: 'Write a reply first.' },
          draft: bodyText,
        }), 400);
      }
      const last = tooFast(ctx.user.id);
      if (!isStaff(ctx.user) && last) {
        return ctx.html(view.thread(ctx, {
          ...remote,
          canReply: true,
          allCategories: q.cats.all(0),
          errors: { body: 'You are posting too quickly. Wait a few seconds.' },
          draft: bodyText,
        }), 400);
      }
      if (last && last.body === bodyText) {
        return ctx.html(view.thread(ctx, {
          ...remote,
          canReply: true,
          allCategories: q.cats.all(0),
          errors: { body: 'That looks like a duplicate of your last post.' },
          draft: bodyText,
        }), 400);
      }
      const post = await createForumReplyRecord(remote.t.id, ctx.user, bodyText);
      const count = remote.total + 1;
      const lastPage = Math.max(1, Math.ceil(count / PER_PAGE_POSTS));
      return ctx.redirect(`/forum/thread/${remote.t.id}?page=${lastPage}#post-${post.id}`);
    }
  }
  const { t, cat } = visibleThread(ctx, ctx.params.id);
  const allCategories = q.cats.all(isStaff(ctx.user) ? 1 : 0);
  const redo = (errors, draft, status = 400) => {
    const total = q.postCount.get(t.id).n;
    const pages = Math.max(1, Math.ceil(total / PER_PAGE_POSTS));
    const posts = q.posts.all(t.id, PER_PAGE_POSTS, (pages - 1) * PER_PAGE_POSTS);
    ctx.html(view.thread(ctx, { t: { ...t, first_post_id: q.firstPost.get(t.id).id }, cat, posts, pageNo: pages, pages, canReply: true, allCategories, errors, draft }), status);
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

/* ------------------------------- Editing ------------------------------ */
get('/forum/post/:id/edit', requireUser, requireAdmin, async (ctx) => {
  const id = intParam(ctx.params.id);
  if (cloudForum()) {
    const { getForumPostRecord } = require('../lib/supabase');
    const remote = await getForumPostRecord(id);
    if (remote) {
      return ctx.html(view.editPost(ctx, {
        t: remote.thread,
        cat: remote.cat,
        post: remote.post,
        isFirstPost: remote.isFirstPost,
      }));
    }
  }
  const p = id && q.post.get(id);
  if (!p) throw httpError(404, 'Page not found');
  const { t, cat } = visibleThread(ctx, String(p.thread_id));
  const isFirstPost = q.firstPost.get(t.id).id === p.id;
  ctx.html(view.editPost(ctx, { t, cat, post: p, isFirstPost }));
});

post('/forum/post/:id/edit', requireUser, requireAdmin, async (ctx) => {
  const id = intParam(ctx.params.id);
  if (cloudForum()) {
    const { getForumPostRecord, updateForumPostRecord } = require('../lib/supabase');
    const remote = await getForumPostRecord(id);
    if (remote) {
      const title = remote.isFirstPost ? sec.cleanLine(ctx.body.title, 120) : remote.thread.title;
      const body = sec.clean(ctx.body.body, 5000);
      const errors = {};
      if (remote.isFirstPost && title.length < 3) errors.title = 'Give your thread a title of at least 3 characters.';
      if (body.length < (remote.isFirstPost ? 10 : 2)) errors.body = `Write at least ${remote.isFirstPost ? 10 : 2} characters.`;
      if (Object.keys(errors).length) {
        return ctx.html(view.editPost(ctx, {
          t: remote.thread,
          cat: remote.cat,
          post: { ...remote.post, body },
          isFirstPost: remote.isFirstPost,
          title,
          errors,
        }), 400);
      }
      await updateForumPostRecord(id, remote.thread.id, body, remote.isFirstPost ? title : null);
      audit(ctx.user.id, 'forum_post_edit', `post ${id} in thread ${remote.thread.id}`, ctx.ip);
      ctx.flash('ok', 'Post updated.');
      return ctx.redirect(`/forum/thread/${remote.thread.id}#post-${id}`);
    }
  }
  const p = id && q.post.get(id);
  if (!p) throw httpError(404, 'Page not found');
  const { t, cat } = visibleThread(ctx, String(p.thread_id));
  const isFirstPost = q.firstPost.get(t.id).id === p.id;
  const title = isFirstPost ? sec.cleanLine(ctx.body.title, 120) : t.title;
  const body = sec.clean(ctx.body.body, 5000);
  const errors = {};

  if (isFirstPost && title.length < 3) errors.title = 'Give your thread a title of at least 3 characters.';
  if (body.length < (isFirstPost ? 10 : 2)) errors.body = `Write at least ${isFirstPost ? 10 : 2} characters.`;
  if (Object.keys(errors).length) {
    return ctx.html(view.editPost(ctx, { t, cat, post: { ...p, body }, isFirstPost, title, errors }), 400);
  }

  const now = Date.now();
  tx(() => {
    q.updatePostBody.run(body, p.id);
    if (isFirstPost) q.updateThreadTitle.run(title, now, t.id);
    else q.updateThreadTimestamp.run(now, t.id);
  });
  audit(ctx.user.id, 'forum_post_edit', `post ${p.id} in thread ${t.id}`, ctx.ip);
  ctx.flash('ok', 'Post updated.');
  ctx.redirect(`/forum/thread/${t.id}#post-${p.id}`);
});

/* ---------------------------- Moderation ------------------------------ */
post('/forum/thread/:id/pin', requireUser, requireStaff, (ctx) => {
  const perms = getPermissions(ctx.user);
  if (!perms.canPin) throw httpError(403, 'You do not have permission to pin threads.');
  const { t } = visibleThread(ctx, ctx.params.id);
  q.pin.run(t.id);
  audit(ctx.user.id, 'thread_pin_toggle', `thread ${t.id}`, ctx.ip);
  ctx.redirect(`/forum/thread/${t.id}`);
});

post('/forum/thread/:id/lock', requireUser, requireStaff, (ctx) => {
  const perms = getPermissions(ctx.user);
  if (!perms.canLock) throw httpError(403, 'You do not have permission to lock threads.');
  const { t } = visibleThread(ctx, ctx.params.id);
  q.lock.run(t.id);
  audit(ctx.user.id, 'thread_lock_toggle', `thread ${t.id}`, ctx.ip);
  ctx.redirect(`/forum/thread/${t.id}`);
});

post('/forum/thread/:id/move', requireUser, requireStaff, (ctx) => {
  const perms = getPermissions(ctx.user);
  if (!perms.canMove) throw httpError(403, 'You do not have permission to move threads.');
  const { t } = visibleThread(ctx, ctx.params.id);
  const targetCatId = intParam(ctx.body.category_id);
  const targetCat = targetCatId && db.prepare('SELECT id, name, slug FROM categories WHERE id = ?').get(targetCatId);
  if (!targetCat) throw httpError(400, 'Invalid category selected.');
  db.prepare('UPDATE threads SET category_id = ? WHERE id = ?').run(targetCat.id, t.id);
  audit(ctx.user.id, 'thread_move', `thread ${t.id} moved to ${targetCat.name}`, ctx.ip);
  ctx.flash('ok', `Thread moved to ${targetCat.name}.`);
  ctx.redirect(`/forum/thread/${t.id}`);
});

const ALLOWED_STATUSES = [
  'IMPORTANT',
  'Approved',
  'Rejected',
  'Reviewed',
  'On Consideration',
  'Pending Review',
  '',
];

post('/forum/thread/:id/status', requireUser, requireStaff, async (ctx) => {
  const perms = getPermissions(ctx.user);
  if (!perms.canTagStatus) throw httpError(403, 'You do not have permission to update thread status tags.');
  if (cloudForum()) {
    const { getForumThreadRecord, updateForumThreadRecord } = require('../lib/supabase');
    const remote = await getForumThreadRecord(intParam(ctx.params.id));
    if (remote) {
      const rawStatus = sec.cleanLine(ctx.body.status, 30);
      if (!ALLOWED_STATUSES.includes(rawStatus)) throw httpError(400, 'Invalid status.');
      const val = rawStatus || null;
      await updateForumThreadRecord(remote.t.id, { status: val });
      audit(ctx.user.id, 'thread_status_tag', `thread ${remote.t.id} status set to ${val || 'None'}`, ctx.ip);
      const isAjax = ctx.req.headers['x-requested-with'] === 'XMLHttpRequest' ||
        (ctx.req.headers['accept'] && ctx.req.headers['accept'].includes('application/json'));
      if (isAjax) return ctx.json({ ok: true, status: val });
      ctx.flash('ok', val ? `Thread status updated to: ${val}.` : 'Thread status tag cleared.');
      return ctx.redirect(`/forum/thread/${remote.t.id}`);
    }
  }
  const { t } = visibleThread(ctx, ctx.params.id);
  const rawStatus = sec.cleanLine(ctx.body.status, 30);
  if (!ALLOWED_STATUSES.includes(rawStatus)) throw httpError(400, 'Invalid status.');
  const val = rawStatus || null;
  db.prepare('UPDATE threads SET status = ? WHERE id = ?').run(val, t.id);
  audit(ctx.user.id, 'thread_status_tag', `thread ${t.id} status set to ${val || 'None'}`, ctx.ip);

  const isAjax = ctx.req.headers['x-requested-with'] === 'XMLHttpRequest' ||
                 (ctx.req.headers['accept'] && ctx.req.headers['accept'].includes('application/json'));
  if (isAjax) {
    return ctx.json({ ok: true, status: val });
  }

  ctx.flash('ok', val ? `Thread status updated to: ${val}.` : 'Thread status tag cleared.');
  ctx.redirect(`/forum/thread/${t.id}`);
});

get('/forum/thread/:id/status-check', (ctx) => {
  const { t } = visibleThread(ctx, ctx.params.id);
  ctx.json({ ok: true, status: t.status || '' });
});

post('/forum/thread/:id/delete', requireUser, requireStaff, async (ctx) => {
  const perms = getPermissions(ctx.user);
  if (!perms.canDelete) throw httpError(403, 'You do not have permission to delete threads.');
  if (cloudForum()) {
    const { getForumThreadRecord, deleteForumThreadRecord } = require('../lib/supabase');
    const remote = await getForumThreadRecord(intParam(ctx.params.id));
    if (remote) {
      await deleteForumThreadRecord(remote.t.id);
      audit(ctx.user.id, 'thread_delete', `thread ${remote.t.id}: ${remote.t.title}`, ctx.ip);
      ctx.flash('ok', 'Thread deleted.');
      return ctx.redirect(`/forum/${remote.cat.slug}`);
    }
  }
  const { t, cat } = visibleThread(ctx, ctx.params.id);
  q.delThread.run(t.id);
  audit(ctx.user.id, 'thread_delete', `thread ${t.id}: ${t.title}`, ctx.ip);
  ctx.flash('ok', 'Thread deleted.');
  ctx.redirect(`/forum/${cat.slug}`);
});

post('/forum/post/:id/delete', requireUser, requireStaff, async (ctx) => {
  const perms = getPermissions(ctx.user);
  if (!perms.canDeletePost) throw httpError(403, 'You do not have permission to delete replies.');
  const id = intParam(ctx.params.id);
  if (cloudForum()) {
    const { getForumPostRecord, deleteForumPostRecord } = require('../lib/supabase');
    const remote = await getForumPostRecord(id);
    if (remote) {
      if (remote.isFirstPost) throw httpError(400, 'Delete the thread instead of its first post.');
      await deleteForumPostRecord(id, remote.thread.id);
      audit(ctx.user.id, 'post_delete', `post ${id} in thread ${remote.thread.id}`, ctx.ip);
      ctx.flash('ok', 'Reply deleted.');
      return ctx.redirect(`/forum/thread/${remote.thread.id}`);
    }
  }
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
