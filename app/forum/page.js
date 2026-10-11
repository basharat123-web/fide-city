import LatestPosts from './components/latest-posts.js';
import ThreadStatus from './components/thread-status.js';
import { getCurrentUser } from '../../lib/next/auth.js';
import { getForumIndexData } from '../../lib/next/forum.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Forum' };

const GROUP_ORDER = ['FideCity RolePlay', 'GAME SECTION', 'User Communication', 'STAFF SECTION'];

function lastPostPlaceholder(category) {
  return <span className="fc-last-none muted">{category.threads ? 'Open forum' : 'None'}</span>;
}

export default async function ForumPage() {
  const user = await getCurrentUser();
  const includeStaff = Boolean(user && ['mod', 'admin', 'root_admin'].includes(user.role));
  const { categories, latestPosts } = await getForumIndexData(includeStaff);
  const roots = categories.filter((category) => !category.parent_slug);
  const childrenByParent = new Map();
  for (const category of categories) {
    if (!category.parent_slug) continue;
    const children = childrenByParent.get(category.parent_slug) || [];
    children.push(category);
    childrenByParent.set(category.parent_slug, children);
  }
  const grouped = new Map();
  for (const category of roots) {
    const name = category.group_name || 'FideCity RolePlay';
    const list = grouped.get(name) || [];
    list.push(category);
    grouped.set(name, list);
  }
  const groupNames = [...GROUP_ORDER.filter((name) => grouped.has(name)), ...[...grouped.keys()].filter((name) => !GROUP_ORDER.includes(name))];

  return <div className="wrap forum-container">
    <nav className="forum-subnav" aria-label="Forum quick navigation">
      <div className="forum-subnav-left"><a href="/forum" className="subnav-link is-active">New posts</a><a href="#forum-search-box" className="subnav-link">Search forums</a></div>
      <div className="forum-subnav-right"><a href="/forum/post-thread" className="btn-subnav-action btn-post-thread">POST THREAD</a></div>
    </nav>
    <div className="fc-forum-layout">
      <div className="fc-forum-main">
        {groupNames.map((name) => <section className="fc-category-group" key={name}>
          <h2 className="fc-group-title">{name}</h2>
          <div className="fc-category-list">{(grouped.get(name) || []).map((category) => {
            const children = childrenByParent.get(category.slug) || [];
            return <div className="fc-category-row" key={category.id}>
              <div className="fc-col-icon"><span aria-hidden="true">▢</span></div>
              <div className="fc-col-main">
                <h3 className="fc-cat-title"><a href={`/forum/${category.slug}`}>{category.name}</a>{category.staff_only ? <span className="badge badge-staff">Staff</span> : null}{category.locked ? <span className="badge badge-quiet">Staff start threads</span> : null}</h3>
                {children.length > 0 && <div className="fc-subforums-wrap"><span className="fc-subforums-label">Sub-forums</span><span className="fc-subforums-items">{children.map((child, index) => <span key={child.id}><a href={`/forum/${child.slug}`}>{child.name}</a>{index < children.length - 1 ? ' · ' : ''}</span>)}</span></div>}
                {category.description && <p className="fc-cat-desc muted">{category.description}</p>}
              </div>
              <div className="fc-col-stats"><div className="fc-stat-item"><span className="fc-stat-num">{category.threads}</span><span className="fc-stat-lbl">Threads</span></div><div className="fc-stat-item"><span className="fc-stat-num">{category.posts}</span><span className="fc-stat-lbl">Messages</span></div></div>
              <div className="fc-col-last">{lastPostPlaceholder(category)}</div>
            </div>;
          })}</div>
        </section>)}
      </div>
      <aside className="forum-sidebar-column">
        <LatestPosts posts={latestPosts} />
      </aside>
    </div>
  </div>;
}
