import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '../../../../../lib/next/auth.js';
import { getSupabase } from '../../../../../lib/next/supabase.js';
import { updateForumPostAction } from '../../../actions.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Edit forum post' };

export default async function EditForumPostPage({ params, searchParams }) {
  const [{ id }, query, user] = await Promise.all([params, searchParams, getCurrentUser()]);
  if (!user) redirect('/login');
  if (!['admin', 'root_admin'].includes(user.role)) notFound();
  if (!/^\d{1,9}$/.test(id)) notFound();
  const { data: post, error: postError } = await getSupabase().from('posts')
    .select('id, thread_id, body, threads!inner(id, title, category_id, deleted)')
    .eq('id', Number(id)).eq('deleted', 0).maybeSingle();
  if (postError) throw new Error(`[next forum edit page] ${postError.message}`);
  if (!post) notFound();
  const thread = Array.isArray(post.threads) ? post.threads[0] : post.threads;
  if (!thread || thread.deleted) notFound();
  const { data: firstPost, error: firstError } = await getSupabase().from('posts')
    .select('id').eq('thread_id', post.thread_id).eq('deleted', 0).order('id').limit(1).maybeSingle();
  if (firstError) throw new Error(`[next forum edit first post] ${firstError.message}`);
  const isFirstPost = Number(firstPost?.id) === Number(post.id);
  const error = query.error === 'validation' ? 'Check the title and message length, then try again.' : null;

  return <div className="wrap">
    <nav className="crumbs" aria-label="Breadcrumb"><ol><li><a href="/forum">Forum</a></li><li><a href={`/forum/thread/${thread.id}`}>{thread.title}</a></li><li aria-current="page">Edit post</li></ol></nav>
    <h1 className="page-title">Edit {isFirstPost ? 'form or thread' : 'reply'}</h1>
    {error && <p className="alert alert-error" role="alert">{error}</p>}
    <form className="form card" action={updateForumPostAction}>
      <input type="hidden" name="csrf" value={user.csrfToken} />
      <input type="hidden" name="postId" value={post.id} />
      {isFirstPost && <><label htmlFor="title">Title</label><input id="title" name="title" defaultValue={thread.title} minLength="3" maxLength="120" required /></>}
      <label htmlFor="body">Message</label><textarea id="body" name="body" defaultValue={post.body} rows="12" maxLength="5000" required />
      <div className="form-actions"><a className="btn btn-ghost" href={`/forum/thread/${thread.id}`}>Cancel</a><button className="btn btn-primary" type="submit">Save changes</button></div>
    </form>
  </div>;
}
