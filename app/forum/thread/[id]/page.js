import { notFound } from 'next/navigation';
import { getCurrentUser } from '../../../../lib/next/auth.js';
import { getForumThreadData } from '../../../../lib/next/forum.js';
import { deletePostAction, moderateThreadAction, replyToThreadAction, updateThreadStatusAction } from '../../actions.js';
import { getPermissions, getRoleMeta } from '../../../../lib/roles.js';
import { getForumIndexData } from '../../../../lib/next/forum.js';
import ThreadStatus from '../../components/thread-status.js';

export const dynamic = 'force-dynamic';

export default async function ForumThreadPage({ params, searchParams }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!/^\d{1,9}$/.test(id)) notFound();
  const page = Math.max(1, Number.parseInt(query.page || '1', 10) || 1);
  const user = await getCurrentUser();
  const isStaff = Boolean(user && ['mod', 'admin', 'root_admin'].includes(user.role));
  const data = await getForumThreadData(Number(id), page, 20, isStaff);
  if (!data) notFound();
  const permissions = getPermissions(user);
  const canReply = Boolean(user) && !data.thread.locked;
  const notice = query.error === 'rate' ? 'You have replied a lot recently. Try again later.'
    : query.error === 'pace' ? 'You are posting too quickly. Wait a few seconds.'
      : query.error === 'duplicate' ? 'That looks like a duplicate of your last post.'
        : query.error === 'locked' ? 'This thread is locked or not available.'
          : null;
  const { categories } = permissions.canMove ? await getForumIndexData(isStaff) : { categories: [] };

  return <div className="wrap">
    <nav className="crumbs" aria-label="Breadcrumb"><ol><li><a href="/forum">Forum</a></li><li><a href={`/forum/${data.category.slug}`}>{data.category.name}</a></li><li aria-current="page">{data.thread.title}</li></ol></nav>
    <div className="page-head"><div><h1 className="page-title thread-title"><ThreadStatus status={data.thread.status} /><span className="thread-title-text">{data.thread.title}</span></h1><p className="muted">{data.thread.pinned ? 'Pinned · ' : ''}{data.thread.locked ? 'Locked · ' : ''}{data.thread.reply_count} {data.thread.reply_count === 1 ? 'reply' : 'replies'}</p></div>
      {(permissions.canPin || permissions.canLock || permissions.canDelete || permissions.canMove) && <div className="mod-actions" role="group" aria-label="Moderation controls">
        {permissions.canPin && <form action={moderateThreadAction}><input type="hidden" name="csrf" value={user.csrfToken} /><input type="hidden" name="threadId" value={id} /><input type="hidden" name="operation" value="pin" /><button className="btn btn-ghost btn-sm" type="submit">{data.thread.pinned ? 'Unpin' : 'Pin'}</button></form>}
        {permissions.canLock && <form action={moderateThreadAction}><input type="hidden" name="csrf" value={user.csrfToken} /><input type="hidden" name="threadId" value={id} /><input type="hidden" name="operation" value="lock" /><button className="btn btn-ghost btn-sm" type="submit">{data.thread.locked ? 'Unlock' : 'Lock'}</button></form>}
        {permissions.canDelete && <form action={moderateThreadAction}><input type="hidden" name="csrf" value={user.csrfToken} /><input type="hidden" name="threadId" value={id} /><input type="hidden" name="operation" value="delete" /><button className="btn btn-danger btn-sm" type="submit">Delete thread</button></form>}
        {permissions.canMove && <form action={moderateThreadAction}><input type="hidden" name="csrf" value={user.csrfToken} /><input type="hidden" name="threadId" value={id} /><input type="hidden" name="operation" value="move" /><label className="sr" htmlFor="move-category">Move thread</label><select id="move-category" name="categoryId" defaultValue=""><option value="" disabled>Move to...</option>{categories.filter((category) => Number(category.id) !== Number(data.category.id)).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select><button className="btn btn-ghost btn-sm" type="submit">Move</button></form>}
      </div>}
    </div>
    {notice && <p className="form-error banner" role="alert">{notice}</p>}
    <ol className="posts">{data.posts.map((post, index) => {
      const meta = getRoleMeta(post);
      const initial = post.username ? post.username.slice(0, 1).toUpperCase() : 'U';
      return <li className="post" id={`post-${post.id}`} key={post.id}>
        <aside className="post-author">{post.avatar ? <img className="avatar" src={post.avatar} alt={post.username} /> : <span className="avatar" aria-hidden="true">{initial}</span>}<strong>{post.username}</strong><span className="badge" style={{ color: meta.color }}>{meta.icon} {meta.name}</span>{meta.name !== 'EN | Player' && <span className="badge badge-quiet">🎮 EN | Player</span>}</aside>
        <div className="post-main"><header className="post-meta"><time dateTime={new Date(Number(post.created_at)).toISOString()}>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(Number(post.created_at))} UTC</time>{post.id !== data.thread.first_post_id && <a href={`#post-${post.id}`} className="permalink" aria-label="Link to this reply">#{(data.page - 1) * 20 + index + 1}</a>}{['admin', 'root_admin'].includes(user?.role) && <a className="permalink" href={`/forum/post/${post.id}/edit`}>Edit</a>}{permissions.canDeletePost && post.id !== data.thread.first_post_id && <form action={deletePostAction}><input type="hidden" name="csrf" value={user.csrfToken} /><input type="hidden" name="postId" value={post.id} /><button className="link-btn" type="submit">Delete reply</button></form>}</header><div className="post-body">{post.body}</div></div>
      </li>;
    })}</ol>
    {permissions.canTagStatus && <form className="form card thread-status-form" action={updateThreadStatusAction}><input type="hidden" name="csrf" value={user.csrfToken} /><input type="hidden" name="threadId" value={data.thread.id} /><label htmlFor="status">Thread status</label><select id="status" name="status" defaultValue={data.thread.status || ''}><option value="">No prefix</option><option value="IMPORTANT">IMPORTANT</option><option value="Approved">Approved</option><option value="Rejected">Rejected</option><option value="Reviewed">Reviewed</option><option value="On Consideration">On Consideration</option><option value="Pending Review">Pending Review</option></select><button className="btn btn-ghost" type="submit">Update status</button></form>}
    {data.pages > 1 && <nav className="pager" aria-label="Pages"><ul>{data.page > 1 && <li><a href={`/forum/thread/${id}?page=${data.page - 1}`}>Previous</a></li>}{Array.from({ length: data.pages }, (_, index) => index + 1).slice(Math.max(0, data.page - 3), data.page + 2).map((number) => <li key={number}>{number === data.page ? <span className="current" aria-current="page">{number}</span> : <a href={`/forum/thread/${id}?page=${number}`}>{number}</a>}</li>)}{data.page < data.pages && <li><a href={`/forum/thread/${id}?page=${data.page + 1}`}>Next</a></li>}</ul></nav>}
    {canReply
      ? <form className="form card reply-form" action={replyToThreadAction}><input type="hidden" name="csrf" value={user.csrfToken} /><input type="hidden" name="threadId" value={id} /><h2>Reply</h2><label className="sr" htmlFor="body">Your reply</label><textarea id="body" name="body" rows="6" maxLength="5000" required /><p className="hint">Plain text. Be respectful and follow the <a href="/rules">rules</a>.</p><button className="btn btn-primary" type="submit">Post reply</button></form>
      : data.thread.locked ? <p className="empty">This thread is locked.</p> : <p className="empty"><a href="/login">Sign in</a> or <a href="/register">create an account</a> to reply.</p>}
  </div>;
}
