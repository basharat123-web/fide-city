import { unstable_cache } from 'next/cache';
import { getSupabase } from './supabase.js';

async function loadAuthors(userIds) {
  if (!userIds.length) return new Map();
  const columns = ['id', 'username', 'email', 'role', 'staff_title', 'additional_title', 'avatar'];

  while (true) {
    const { data, error } = await getSupabase().from('users')
      .select(columns.join(', '))
      .in('id', userIds);
    if (!error) return new Map((data || []).map((user) => [String(user.id), user]));

    const missingOptionalColumn = ['additional_title', 'avatar'].find((column) =>
      columns.includes(column)
      && error.message?.includes(column)
      && /column.*does not exist|could not find.*column.*schema cache/i.test(error.message),
    );
    if (!missingOptionalColumn) throw new Error(`[next forum authors] ${error.message}`);
    columns.splice(columns.indexOf(missingOptionalColumn), 1);
  }
}

async function loadLatestPosts(categories, limit) {
  if (!categories.length) return [];
  const categoryById = new Map(categories.map((category) => [String(category.id), category]));
  const { data: posts, error } = await getSupabase().from('posts')
    .select('id, thread_id, user_id, created_at, threads!inner(id, category_id, title, status, reply_count, deleted)')
    .in('threads.category_id', categories.map((category) => category.id))
    .eq('deleted', 0)
    .eq('threads.deleted', 0)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`[next latest forum posts] ${error.message}`);

  const authors = await loadAuthors([...new Set((posts || []).map((post) => post.user_id))]);
  return (posts || []).flatMap((post) => {
    const thread = Array.isArray(post.threads) ? post.threads[0] : post.threads;
    const category = thread && categoryById.get(String(thread.category_id));
    if (!thread || !category) return [];
    const author = authors.get(String(post.user_id)) || {};
    return [{
      id: thread.id,
      post_id: post.id,
      title: thread.title,
      status: thread.status,
      reply_count: thread.reply_count,
      updated_at: post.created_at,
      category_name: category.name,
      category_slug: category.slug,
      username: author.username || 'Unknown user',
      role: author.role || 'member',
      staff_title: author.staff_title || 'EN | Player',
      additional_title: author.additional_title || 'EN | Player',
      avatar: author.avatar || null,
    }];
  });
}

async function loadCategoryCounts(categories) {
  if (!categories.length) return new Map();
  const slugs = categories.map((category) => category.slug);
  const { data, error } = await getSupabase().rpc('forum_category_counts', { category_slugs: slugs });
  if (!error) return new Map((data || []).map((row) => [row.slug, {
    threads: Number(row.thread_count) || 0,
    posts: Number(row.post_count) || 0,
  }]));

  if (!['PGRST202', '42883'].includes(error.code) && !/function .*forum_category_counts.* does not exist/i.test(error.message || '')) {
    throw new Error(`[next forum category counts] ${error.message}`);
  }

  const counts = await Promise.all(categories.map(async (category) => {
    const [threads, posts] = await Promise.all([
      getSupabase().from('threads').select('id', { count: 'exact', head: true })
        .eq('category_id', category.id).eq('deleted', 0),
      getSupabase().from('posts').select('id, threads!inner(category_id,deleted)', { count: 'exact', head: true })
        .eq('deleted', 0).eq('threads.category_id', category.id).eq('threads.deleted', 0),
    ]);
    if (threads.error) throw new Error(`[next forum thread counts] ${threads.error.message}`);
    if (posts.error) throw new Error(`[next forum post counts] ${posts.error.message}`);
    return [category.slug, { threads: threads.count || 0, posts: posts.count || 0 }];
  }));
  return new Map(counts);
}

const getPublicForumIndexData = unstable_cache(
  async () => {
    const { data: categories, error } = await getSupabase().from('categories')
      .select('*')
      .eq('staff_only', 0)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`[next forum categories] ${error.message}`);
    const visibleCategories = categories || [];
    const [counts, latestPosts] = await Promise.all([
      loadCategoryCounts(visibleCategories),
      loadLatestPosts(visibleCategories, 5),
    ]);
    return {
      categories: visibleCategories.map((category) => ({
        ...category,
        ...(counts.get(category.slug) || { threads: 0, posts: 0 }),
      })),
      latestPosts,
    };
  },
  ['next-forum-index'],
  { revalidate: 30, tags: ['forum'] },
);

export async function getForumIndexData(includeStaff = false) {
  const publicData = await getPublicForumIndexData();
  if (!includeStaff) return publicData;
  const { data: staffCategories, error } = await getSupabase().from('categories')
    .select('*').eq('staff_only', 1).order('sort_order', { ascending: true });
  if (error) throw new Error(`[next staff forum categories] ${error.message}`);
  const privateCategories = await Promise.all((staffCategories || []).map(async (category) => {
    const [threads, posts] = await Promise.all([
      getSupabase().from('threads').select('id', { count: 'exact', head: true })
        .eq('category_id', category.id).eq('deleted', 0),
      getSupabase().from('posts').select('id, threads!inner(category_id,deleted)', { count: 'exact', head: true })
        .eq('deleted', 0).eq('threads.category_id', category.id).eq('threads.deleted', 0),
    ]);
    if (threads.error) throw new Error(`[next staff forum threads] ${threads.error.message}`);
    if (posts.error) throw new Error(`[next staff forum posts] ${posts.error.message}`);
    return { ...category, threads: threads.count || 0, posts: posts.count || 0 };
  }));
  return { categories: [...publicData.categories, ...privateCategories], latestPosts: publicData.latestPosts };
}

async function loadForumCategoryData(slug, pageNo, perPage, includeStaff = false) {
    const client = getSupabase();
    const { data: category, error: categoryError } = await client.from('categories')
      .select('*').eq('slug', slug).maybeSingle();
    if (categoryError) throw new Error(`[next forum category] ${categoryError.message}`);
    if (!category || (category.staff_only && !includeStaff)) return null;

    let childrenQuery = client.from('categories').select('*').eq('parent_slug', slug);
    if (!includeStaff) childrenQuery = childrenQuery.eq('staff_only', 0);
    const [{ data: children, error: childrenError }, { data: threads, error: threadsError, count }] = await Promise.all([
      childrenQuery.order('sort_order', { ascending: true }),
      client.from('threads').select('*', { count: 'exact' })
        .eq('category_id', category.id).eq('deleted', 0)
        .order('pinned', { ascending: false }).order('updated_at', { ascending: false })
        .range((pageNo - 1) * perPage, pageNo * perPage - 1),
    ]);
    if (childrenError) throw new Error(`[next forum subcategories] ${childrenError.message}`);
    if (threadsError) throw new Error(`[next forum category threads] ${threadsError.message}`);
    const rows = threads || [];
    const authors = await loadAuthors([...new Set(rows.map((thread) => thread.user_id))]);
    return {
      category,
      children: children || [],
      total: count || 0,
      threads: rows.map((thread) => ({
        ...thread,
        username: authors.get(String(thread.user_id))?.username || 'Unknown user',
      })),
    };
}

const getPublicForumCategoryData = unstable_cache(
  (slug, pageNo, perPage) => loadForumCategoryData(slug, pageNo, perPage, false),
  ['next-forum-category-public'],
  { revalidate: 15, tags: ['forum'] },
);

export async function getForumCategoryData(slug, pageNo, perPage, includeStaff = false) {
  return includeStaff
    ? loadForumCategoryData(slug, pageNo, perPage, true)
    : getPublicForumCategoryData(slug, pageNo, perPage);
}

export async function getForumThreadData(threadId, pageNo = 1, perPage = 20, includeStaff = false) {
  const client = getSupabase();
  const { data: thread, error } = await client.from('threads')
    .select('*').eq('id', threadId).eq('deleted', 0).maybeSingle();
  if (error) throw new Error(`[next forum thread] ${error.message}`);
  if (!thread) return null;

  const { data: category, error: categoryError } = await client.from('categories')
    .select('*').eq('id', thread.category_id).maybeSingle();
  if (categoryError) throw new Error(`[next forum thread category] ${categoryError.message}`);
  if (!category || (category.staff_only && !includeStaff)) return null;

  const { count, error: countError } = await client.from('posts')
    .select('id', { count: 'exact', head: true }).eq('thread_id', thread.id).eq('deleted', 0);
  if (countError) throw new Error(`[next forum thread post count] ${countError.message}`);
  const total = count || 0;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(Math.max(1, pageNo), pages);
  const [{ data: posts, error: postsError }, { data: firstPost, error: firstPostError }] = await Promise.all([
    client.from('posts').select('*').eq('thread_id', thread.id).eq('deleted', 0)
      .order('id', { ascending: true }).range((currentPage - 1) * perPage, currentPage * perPage - 1),
    client.from('posts').select('id').eq('thread_id', thread.id).eq('deleted', 0)
      .order('id', { ascending: true }).limit(1).maybeSingle(),
  ]);
  if (postsError) throw new Error(`[next forum thread posts] ${postsError.message}`);
  if (firstPostError) throw new Error(`[next forum first post] ${firstPostError.message}`);
  const authors = await loadAuthors([...new Set([thread.user_id, ...(posts || []).map((post) => post.user_id)])]);
  return {
    thread: { ...thread, first_post_id: firstPost?.id || null },
    category,
    page: currentPage,
    pages,
    posts: (posts || []).map((post) => ({
      ...post,
      ...(authors.get(String(post.user_id)) || {
        username: 'Unknown user', role: 'member', staff_title: 'EN | Player', additional_title: 'EN | Player', avatar: null,
      }),
    })),
  };
}
