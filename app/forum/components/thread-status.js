export default function ThreadStatus({ status }) {
  if (!status) return null;
  const value = String(status).trim();
  const normalized = value.toLowerCase();
  const classes = {
    important: 'tag-important',
    approved: 'tag-approved',
    rejected: 'tag-rejected',
    reviewed: 'tag-reviewed',
    'on consideration': 'tag-consideration',
    'pending review': 'tag-pending',
  };
  const label = normalized === 'pending' ? 'Pending Review'
    : normalized === 'consideration' ? 'On Consideration'
      : value.replace(/^\[|\]$/g, '');
  return <span className={`forum-tag ${classes[normalized] || 'tag-default'}`}>{label}</span>;
}
