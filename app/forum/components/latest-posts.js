import ThreadStatus from './thread-status.js';

export default function LatestPosts({ posts }) {
  return <div className="fc-sidebar-card fc-widget-latest">
    <h3 className="fc-widget-title">Latest posts</h3>
    <div className="fc-latest-body">
      {posts.length
        ? <ul className="fc-latest-posts-list">{posts.map((post) => <li className="fc-latest-post-item" key={post.post_id}>
            <div className="fc-post-avatar">{post.avatar ? <img src={post.avatar} alt="" /> : <span>{post.username.slice(0, 1).toUpperCase()}</span>}</div>
            <div className="fc-post-info">
              <a className="fc-post-title-link" href={`/forum/thread/${post.id}#post-${post.post_id}`}>
                <ThreadStatus status={post.status} /><span className="fc-post-title-text">{post.title.replace(/^\[(IMPORTANT|Approved|Pending)\]\s*/i, '')}</span>
              </a>
              <div className="fc-post-author-line muted">Latest: <span className="author-name">{post.username}</span> · {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(Number(post.updated_at))} UTC</div>
              <div className="fc-post-cat-line"><a href={`/forum/${post.category_slug}`}>{post.category_name}</a></div>
            </div>
          </li>)}</ul>
        : <p className="empty">No posts yet.</p>}
    </div>
  </div>;
}
