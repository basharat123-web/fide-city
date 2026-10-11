import config from '../lib/config.js';
import { getSupabase } from '../lib/next/supabase.js';
import { isSupabaseConfigured } from '../lib/next/content.js';

export const revalidate = 3600;

export default async function sitemap() {
  const staticPaths = ['/', '/rules', '/forum', '/news', '/team', '/privacy', '/terms', '/cookies'];
  const entries = staticPaths.map((path) => ({ url: `${config.siteUrl}${path}` }));
  if (!isSupabaseConfigured) return entries;

  const [stories, categories] = await Promise.all([
    getSupabase().from('stories').select('slug').eq('published', 1).order('created_at', { ascending: false }).limit(200),
    getSupabase().from('categories').select('slug').eq('staff_only', 0),
  ]);
  if (stories.error) throw new Error(`[next sitemap stories] ${stories.error.message}`);
  if (categories.error) throw new Error(`[next sitemap categories] ${categories.error.message}`);
  for (const story of stories.data || []) entries.push({ url: `${config.siteUrl}/news/${story.slug}` });
  for (const category of categories.data || []) entries.push({ url: `${config.siteUrl}/forum/${category.slug}` });
  return entries;
}
