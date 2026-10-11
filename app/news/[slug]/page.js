import { notFound } from 'next/navigation';
import { getPublishedStory, isSupabaseConfigured } from '../../../lib/next/content.js';

export const revalidate = 60;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,60}$/.test(slug) || !isSupabaseConfigured) return { title: 'News' };
  const story = await getPublishedStory(slug);
  return story ? { title: story.title, description: story.summary } : { title: 'News' };
}

export default async function NewsStoryPage({ params }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,60}$/.test(slug) || !isSupabaseConfigured) notFound();
  const story = await getPublishedStory(slug);
  if (!story) notFound();

  return <article className="wrap prose-wrap">
    <a className="back-link" href="/news">← All news</a>
    <h1 className="page-title">{story.title}</h1>
    <p className="page-lead">{story.summary}</p>
    <p className="muted">By {story.author} · {new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(Number(story.created_at))}</p>
    <div className="prose">{story.body.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
  </article>;
}
