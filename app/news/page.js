import { getPublishedStories, isSupabaseConfigured } from '../../lib/next/content.js';

export const revalidate = 60;
export const metadata = { title: 'News' };

export default async function NewsPage() {
  const stories = isSupabaseConfigured ? await getPublishedStories(50) : [];
  return <div className="wrap prose-wrap">
    <h1 className="page-title">News</h1>
    <p className="page-lead">The latest updates from Fide City Roleplay.</p>
    {stories.length
      ? <ul className="news-list">{stories.map((story) => <li key={story.id}><a href={`/news/${story.slug}`}><time dateTime={new Date(Number(story.created_at)).toISOString()}>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(Number(story.created_at))}</time><h2>{story.title}</h2><p>{story.summary}</p></a></li>)}</ul>
      : <p className="empty">No news has been published yet.</p>}
  </div>;
}
