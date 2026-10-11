'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../lib/next/auth.js';
import { getSupabase } from '../../lib/next/supabase.js';
import { getPermissions } from '../../lib/roles.js';
import { auditEvent } from '../../lib/next/session.js';
import sec from '../../lib/security.js';

const newThreadLimit = sec.limiter('next-new-thread', 60 * 60 * 1000, 6);
const replyLimit = sec.limiter('next-reply', 60 * 60 * 1000, 30);
const allowedStatuses = new Set(['IMPORTANT', 'Approved', 'Rejected', 'Reviewed', 'On Consideration', 'Pending Review', '']);
const minimumPostGapMs = 20 * 1000;

function text(formData, key, max) {
  return sec.clean(formData.get(key), max);
}

function requireCsrf(user, formData) {
  const token = text(formData, 'csrf', 128);
  if (!user?.csrfToken || !sec.safeEqual(token, user.csrfToken)) {
    throw new Error('Your session expired. Refresh the page and try again.');
  }
}

function requireUser(user) {
  if (!user) redirect('/login');
}

export async function createThreadAction(formData) {
  const user = await getCurrentUser();
  requireUser(user);
  requireCsrf(user, formData);
  const categorySlug = sec.cleanLine(formData.get('category'), 80);
  const title = sec.cleanLine(formData.get('title'), 120);
  const body = text(formData, 'body', 10000);
  if (!categorySlug || title.length < 3 || body.length < 10) {
    redirect(`/forum/${encodeURIComponent(categorySlug)}/new?error=validation`);
  }
  const isStaff = ['mod', 'admin', 'root_admin'].includes(user.role);
  if (!isStaff && !newThreadLimit(String(user.id)).ok) {
    redirect(`/forum/${encodeURIComponent(categorySlug)}/new?error=rate`);
  }

  const client = getSupabase();
  const { data: category, error: categoryError } = await client.from('categories')
    .select('id, slug, locked, staff_only').eq('slug', categorySlug).maybeSingle();
  if (categoryError) throw new Error(`[next forum create category] ${categoryError.message}`);
  if (!category || (category.staff_only && !isStaff)) redirect('/forum');
  if (category.locked && !isStaff) {
    redirect(`/forum/${encodeURIComponent(categorySlug)}?error=locked`);
  }
  const { data: lastPost, error: lastPostError } = await client.from('posts')
    .select('body, created_at').eq('user_id', user.id).order('id', { ascending: false }).limit(1).maybeSingle();
  if (lastPostError) throw new Error(`[next forum posting pace] ${lastPostError.message}`);
  if (lastPost?.body === body) redirect(`/forum/${encodeURIComponent(categorySlug)}/new?error=duplicate`);
  if (!isStaff && lastPost && Date.now() - Number(lastPost.created_at) < minimumPostGapMs) {
    redirect(`/forum/${encodeURIComponent(categorySlug)}/new?error=pace`);
  }

  const { data: threadId, error: threadError } = await client.rpc('create_forum_thread', {
    p_category_id: category.id,
    p_user_id: user.id,
    p_title: title,
    p_body: body,
    p_created_at: Date.now(),
  });
  if (threadError) throw new Error(`[next forum create thread] ${threadError.message}`);

  revalidatePath('/forum');
  revalidatePath(`/forum/${categorySlug}`);
  redirect(`/forum/thread/${threadId}`);
}

export async function replyToThreadAction(formData) {
  const user = await getCurrentUser();
  requireUser(user);
  requireCsrf(user, formData);
  const threadId = Number.parseInt(text(formData, 'threadId', 12), 10);
  const body = text(formData, 'body', 5000);
  if (!Number.isSafeInteger(threadId) || threadId < 1 || !body) redirect('/forum');
  const isStaff = ['mod', 'admin', 'root_admin'].includes(user.role);
  if (!isStaff && !replyLimit(String(user.id)).ok) {
    redirect(`/forum/thread/${threadId}?error=rate`);
  }

  const client = getSupabase();
  const { data: thread, error: threadError } = await client.from('threads')
    .select('id, locked, deleted, categories!inner(staff_only)')
    .eq('id', threadId).maybeSingle();
  if (threadError) throw new Error(`[next forum reply thread] ${threadError.message}`);
  const threadCategory = Array.isArray(thread?.categories) ? thread.categories[0] : thread?.categories;
  if (!thread || thread.deleted || thread.locked
      || (threadCategory?.staff_only && !isStaff)) {
    redirect(`/forum/thread/${threadId}?error=locked`);
  }
  const { data: lastPost, error: lastPostError } = await client.from('posts')
    .select('body, created_at').eq('user_id', user.id).order('id', { ascending: false }).limit(1).maybeSingle();
  if (lastPostError) throw new Error(`[next forum reply pace] ${lastPostError.message}`);
  if (lastPost?.body === body) redirect(`/forum/thread/${threadId}?error=duplicate`);
  if (!isStaff && lastPost && Date.now() - Number(lastPost.created_at) < minimumPostGapMs) {
    redirect(`/forum/thread/${threadId}?error=pace`);
  }
  const { data: createdPostId, error: postError } = await client.rpc('create_forum_reply', {
    p_thread_id: threadId,
    p_user_id: user.id,
    p_body: body,
    p_created_at: Date.now(),
  });
  if (postError) throw new Error(`[next forum create reply] ${postError.message}`);

  const { data: categoryThread, error: threadCategoryError } = await client.from('threads')
    .select('category_id').eq('id', threadId).single();
  if (threadCategoryError) throw new Error(`[next forum reply thread category] ${threadCategoryError.message}`);
  const { data: category, error: categoryError } = await client.from('categories')
    .select('slug').eq('id', categoryThread.category_id).maybeSingle();
  if (categoryError) throw new Error(`[next forum reply category] ${categoryError.message}`);
  revalidatePath('/forum');
  if (category?.slug) revalidatePath(`/forum/${category.slug}`);
  revalidatePath(`/forum/thread/${threadId}`);
  redirect(`/forum/thread/${threadId}#post-${createdPostId}`);
}

export async function deletePostAction(formData) {
  const user = await getCurrentUser();
  requireUser(user);
  requireCsrf(user, formData);
  const permissions = getPermissions(user);
  const postId = Number.parseInt(text(formData, 'postId', 12), 10);
  if (!permissions.canDeletePost || !Number.isSafeInteger(postId) || postId < 1) redirect('/forum');

  const client = getSupabase();
  const { data: post, error: postError } = await client.from('posts')
    .select('id, thread_id, threads!inner(id, deleted)').eq('id', postId).eq('deleted', 0).maybeSingle();
  if (postError) throw new Error(`[next forum delete post] ${postError.message}`);
  if (!post) redirect('/forum');
  const { data: firstPost, error: firstError } = await client.from('posts')
    .select('id').eq('thread_id', post.thread_id).eq('deleted', 0).order('id').limit(1).maybeSingle();
  if (firstError) throw new Error(`[next forum first post check] ${firstError.message}`);
  if (Number(firstPost?.id) === Number(postId)) redirect(`/forum/thread/${post.thread_id}`);
  const { error } = await client.rpc('delete_forum_reply', {
    p_post_id: postId,
    p_updated_at: Date.now(),
  });
  if (error) throw new Error(`[next forum delete post update] ${error.message}`);
  await auditEvent(user.id, 'forum.reply.delete', `post=${postId}; thread=${post.thread_id}`);
  revalidatePath(`/forum/thread/${post.thread_id}`);
  redirect(`/forum/thread/${post.thread_id}`);
}

export async function updateForumPostAction(formData) {
  const user = await getCurrentUser();
  requireUser(user);
  requireCsrf(user, formData);
  if (!['admin', 'root_admin'].includes(user.role)) redirect('/forum');
  const postId = Number.parseInt(text(formData, 'postId', 12), 10);
  const title = sec.cleanLine(formData.get('title'), 120);
  const body = text(formData, 'body', 5000);
  if (!Number.isSafeInteger(postId) || postId < 1) redirect('/forum');

  const { data: post, error: postError } = await getSupabase().from('posts')
    .select('id, thread_id').eq('id', postId).eq('deleted', 0).maybeSingle();
  if (postError) throw new Error(`[next forum edit post lookup] ${postError.message}`);
  if (!post) redirect('/forum');
  const { data: firstPost, error: firstPostError } = await getSupabase().from('posts')
    .select('id').eq('thread_id', post.thread_id).eq('deleted', 0).order('id').limit(1).maybeSingle();
  if (firstPostError) throw new Error(`[next forum edit first post] ${firstPostError.message}`);
  const isFirstPost = Number(firstPost?.id) === Number(postId);
  if ((isFirstPost && title.length < 3) || body.length < (isFirstPost ? 10 : 2)) {
    redirect(`/forum/post/${postId}/edit?error=validation`);
  }

  const { data: threadId, error } = await getSupabase().rpc('update_forum_post', {
    p_post_id: postId,
    p_title: isFirstPost ? title : null,
    p_body: body,
    p_user_id: user.id,
    p_updated_at: Date.now(),
  });
  if (error) throw new Error(`[next forum edit post] ${error.message}`);
  revalidatePath(`/forum/thread/${threadId}`);
  revalidatePath('/forum');
  redirect(`/forum/thread/${threadId}#post-${postId}`);
}

export async function updateThreadStatusAction(formData) {
  const user = await getCurrentUser();
  requireUser(user);
  requireCsrf(user, formData);
  const permissions = getPermissions(user);
  const threadId = Number.parseInt(text(formData, 'threadId', 12), 10);
  const status = sec.cleanLine(formData.get('status'), 30);
  if (!permissions.canTagStatus || !Number.isSafeInteger(threadId) || threadId < 1 || !allowedStatuses.has(status)) {
    redirect('/forum');
  }
  const { data: thread, error } = await getSupabase().from('threads').update({
    status: status || null,
    updated_at: Date.now(),
  }).eq('id', threadId).eq('deleted', 0).select('id, category_id').maybeSingle();
  if (error) throw new Error(`[next forum thread status] ${error.message}`);
  if (!thread) redirect('/forum');
  const { data: category, error: categoryError } = await getSupabase().from('categories')
    .select('slug').eq('id', thread.category_id).maybeSingle();
  if (categoryError) throw new Error(`[next forum status category] ${categoryError.message}`);
  await auditEvent(user.id, 'thread_status_tag', `thread ${threadId} status set to ${status || 'None'}`);
  revalidatePath('/forum');
  revalidatePath(`/forum/thread/${threadId}`);
  if (category?.slug) revalidatePath(`/forum/${category.slug}`);
  redirect(`/forum/thread/${threadId}`);
}

export async function moderateThreadAction(formData) {
  const user = await getCurrentUser();
  requireUser(user);
  requireCsrf(user, formData);
  const permissions = getPermissions(user);
  const threadId = Number.parseInt(text(formData, 'threadId', 12), 10);
  const operation = text(formData, 'operation', 20);
  if (!Number.isSafeInteger(threadId) || threadId < 1) redirect('/forum');
  const client = getSupabase();
  const { data: thread, error: threadError } = await client.from('threads')
    .select('id, title, category_id, pinned, locked').eq('id', threadId).eq('deleted', 0).maybeSingle();
  if (threadError) throw new Error(`[next forum moderation thread] ${threadError.message}`);
  if (!thread) redirect('/forum');
  const { data: sourceCategory, error: sourceError } = await client.from('categories')
    .select('slug, staff_only').eq('id', thread.category_id).maybeSingle();
  if (sourceError) throw new Error(`[next forum moderation category] ${sourceError.message}`);
  if (!sourceCategory || (sourceCategory.staff_only && !['mod', 'admin', 'root_admin'].includes(user.role))) {
    redirect('/forum');
  }

  let update;
  let action;
  let detail;
  if (operation === 'pin' && permissions.canPin) {
    update = { pinned: thread.pinned ? 0 : 1 };
    action = 'thread_pin_toggle';
    detail = `thread ${threadId}`;
  } else if (operation === 'lock' && permissions.canLock) {
    update = { locked: thread.locked ? 0 : 1 };
    action = 'thread_lock_toggle';
    detail = `thread ${threadId}`;
  } else if (operation === 'delete' && permissions.canDelete) {
    update = { deleted: 1 };
    action = 'thread_delete';
    detail = `thread ${threadId}: ${thread.title}`;
  } else if (operation === 'move' && permissions.canMove) {
    const categoryId = Number.parseInt(text(formData, 'categoryId', 12), 10);
    if (!Number.isSafeInteger(categoryId) || categoryId < 1) redirect(`/forum/thread/${threadId}`);
    const { data: targetCategory, error } = await client.from('categories')
      .select('id, name, slug, staff_only').eq('id', categoryId).maybeSingle();
    if (error) throw new Error(`[next forum moderation target category] ${error.message}`);
    const isStaff = ['mod', 'admin', 'root_admin'].includes(user.role);
    if (!targetCategory || (targetCategory.staff_only && !isStaff)) redirect(`/forum/thread/${threadId}`);
    update = { category_id: targetCategory.id };
    action = 'thread_move';
    detail = `thread ${threadId} moved to ${targetCategory.name}`;
  } else {
    redirect(`/forum/thread/${threadId}`);
  }

  const { error: updateError } = await client.from('threads').update(update).eq('id', threadId);
  if (updateError) throw new Error(`[next forum moderation update] ${updateError.message}`);
  await auditEvent(user.id, action, detail);
  revalidatePath('/forum');
  revalidatePath(`/forum/${sourceCategory.slug}`);
  revalidatePath(`/forum/thread/${threadId}`);
  if (operation === 'delete') redirect(`/forum/${sourceCategory.slug}`);
  redirect(`/forum/thread/${threadId}`);
}
