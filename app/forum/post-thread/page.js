import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../lib/next/auth.js';
import { getForumIndexData } from '../../../lib/next/forum.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Post a thread' };

export default async function PostThreadPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fforum%2Fpost-thread');
  const isStaff = ['mod', 'admin', 'root_admin'].includes(user.role);
  const { categories } = await getForumIndexData(isStaff);
  const allowed = categories.filter((category) => !category.locked || isStaff);
  return <div className="wrap"><h1 className="page-title">Choose a forum</h1><p className="page-lead">Select where your new thread belongs.</p><ul className="fc-thread-list">{allowed.map((category) => <li className="fc-thread-row" key={category.id}><div className="fc-thread-main"><h2><a href={`/forum/${category.slug}/new`}>{category.name}</a></h2><p className="muted">{category.description}</p></div></li>)}</ul></div>;
}
