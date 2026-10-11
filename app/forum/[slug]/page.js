import { notFound } from 'next/navigation';
import { getCurrentUser } from '../../../lib/next/auth.js';
import { getForumCategoryData } from '../../../lib/next/forum.js';
import ThreadStatus from '../components/thread-status.js';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const data = await getForumCategoryData(slug, 1, 20);
  return data ? { title: data.category.name, description: data.category.description } : { title: 'Forum' };
}

export default async function ForumCategoryPage({ params, searchParams }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const page = Math.max(1, Number.parseInt(query.page || '1', 10) || 1);
  const user = await getCurrentUser();
  const isStaff = Boolean(user && ['mod', 'admin', 'root_admin'].includes(user.role));
  const result = await getForumCategoryData(slug, page, 20, isStaff);
  if (!result) notFound();
  const pageCount = Math.max(1, Math.ceil(result.total / 20));
  const canPost = Boolean(user) && (!result.category.locked || isStaff);
  const parent = result.category.parent_slug
    ? (await getForumCategoryData(result.category.parent_slug, 1, 1, isStaff))?.category
    : null;

  return <div className="wrap forum-category-wrap">
    <nav className="crumbs" aria-label="Breadcrumb"><ol><li><a href="/forum">Forum</a></li>{parent && <li><a href={`/forum/${parent.slug}`}>{parent.name}</a></li>}<li aria-current="page">{result.category.name}</li></ol></nav>
    <div className="fc-category-header-bar"><div className="fc-category-header-title-wrap"><h1 className="page-title fc-category-heading">{result.category.name}</h1>{result.category.description && <p className="page-lead fc-category-lead">{result.category.description}</p>}</div><div className="fc-category-header-actions">{canPost ? <a className="btn fc-btn-post-thread" href={`/forum/${slug}/new`}>POST THREAD</a> : user ? <span className="muted">Only staff can start threads here.</span> : <a className="btn btn-primary" href="/login">Sign in to post</a>}</div></div>
    {result.children.length > 0 && <div className="fc-subforums-grid">{result.children.map((child) => <a className="fc-subforum-card" href={`/forum/${child.slug}`} key={child.id}><strong>{child.name}</strong><span>{child.description}</span></a>)}</div>}
    {result.threads.length > 0
      ? <ul className="fc-thread-list">{result.threads.map((thread) => <li className="fc-thread-row" key={thread.id}><div className="fc-thread-main"><h2><ThreadStatus status={thread.status} /><a href={`/forum/thread/${thread.id}`}>{thread.title}</a></h2><p className="muted">Started by {thread.username} · {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(Number(thread.created_at))}</p></div><div className="fc-thread-replies">{thread.reply_count} replies</div></li>)}</ul>
      : <p className="empty">No threads here yet. {canPost ? 'Start the first one.' : ''}</p>}
    {pageCount > 1 && <nav className="pager" aria-label="Pages"><ul>{page > 1 && <li><a href={`/forum/${slug}?page=${page - 1}`}>Previous</a></li>}{Array.from({ length: pageCount }, (_, index) => index + 1).slice(Math.max(0, page - 3), page + 2).map((number) => <li key={number}>{number === page ? <span className="current" aria-current="page">{number}</span> : <a href={`/forum/${slug}?page=${number}`}>{number}</a>}</li>)}{page < pageCount && <li><a href={`/forum/${slug}?page=${page + 1}`}>Next</a></li>}</ul></nav>}
  </div>;
}
