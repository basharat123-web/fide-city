import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '../../../../lib/next/auth.js';
import { getForumCategoryData } from '../../../../lib/next/forum.js';
import { createThreadAction } from '../../actions.js';

export const dynamic = 'force-dynamic';

export default async function NewForumThreadPage({ params, searchParams }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/forum/${slug}/new`)}`);
  const isStaff = ['mod', 'admin', 'root_admin'].includes(user.role);
  const categoryData = await getForumCategoryData(slug, 1, 1, isStaff);
  if (!categoryData) notFound();
  if (categoryData.category.locked && !isStaff) notFound();
  const error = query.error === 'validation' ? 'Enter a title and message.'
    : query.error === 'rate' ? 'You have started several threads recently. Try again later.'
      : query.error === 'pace' ? 'You are posting too quickly. Wait a few seconds.'
        : query.error === 'duplicate' ? 'That looks like a duplicate of your last post.'
      : null;
  return <div className="wrap"><nav className="crumbs" aria-label="Breadcrumb"><ol><li><a href="/forum">Forum</a></li><li><a href={`/forum/${slug}`}>{categoryData.category.name}</a></li><li aria-current="page">New thread</li></ol></nav><h1 className="page-title">Start a thread</h1>{error && <p className="alert alert-error" role="alert">{error}</p>}<form className="form card" action={createThreadAction}><input type="hidden" name="csrf" value={user.csrfToken} /><input type="hidden" name="category" value={slug} /><label htmlFor="title">Title</label><input id="title" name="title" type="text" minLength="5" maxLength="120" required /><label htmlFor="body">Message</label><textarea id="body" name="body" rows="10" maxLength="10000" required /><p className="hint">Your post will be visible to everyone. Please follow the <a href="/rules">community rules</a>.</p><button className="btn btn-primary" type="submit">Post thread</button></form></div>;
}
