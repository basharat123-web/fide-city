import { unstable_cache } from 'next/cache';
import { getSupabase } from './supabase.js';

export const isSupabaseConfigured = Boolean(
  process.env.SUPABASE_URL?.trim()
  && (
    process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_KEY
  )?.trim(),
);

export const getPublishedStories = unstable_cache(
  async (limit) => {
    const { data, error } = await getSupabase()
      .from('stories')
      .select('id, slug, title, summary, created_at')
      .eq('published', 1)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`[next published stories] ${error.message}`);
    return data || [];
  },
  ['next-published-stories'],
  { revalidate: 60, tags: ['stories'] },
);

export const getPublicStaff = unstable_cache(
  async () => {
    const { data, error } = await getSupabase()
      .from('users')
      .select('username, role, staff_title, additional_title, avatar')
      .in('role', ['root_admin', 'admin', 'mod'])
      .eq('banned', 0)
      .order('role', { ascending: true })
      .order('username', { ascending: true });
    if (error) throw new Error(`[next public staff] ${error.message}`);
    return data || [];
  },
  ['next-public-staff'],
  { revalidate: 60, tags: ['users'] },
);

export async function getPublishedStory(slug) {
  const { data, error } = await getSupabase()
    .from('stories')
    .select('id, slug, title, summary, body, author_id, created_at')
    .eq('slug', slug)
    .eq('published', 1)
    .maybeSingle();
  if (error) throw new Error(`[next published story] ${error.message}`);
  if (!data) return null;

  const { data: author, error: authorError } = await getSupabase()
    .from('users')
    .select('username')
    .eq('id', data.author_id)
    .maybeSingle();
  if (authorError) throw new Error(`[next published story author] ${authorError.message}`);
  return { ...data, author: author?.username || 'Fide City team' };
}
