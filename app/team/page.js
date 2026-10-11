import { getPublicStaff, isSupabaseConfigured } from '../../lib/next/content.js';
import config from '../../lib/config.js';

export const revalidate = 60;
export const metadata = { title: 'Team' };

export default async function TeamPage() {
  const staff = isSupabaseConfigured ? await getPublicStaff() : [];
  return <div className="wrap prose-wrap">
    <h1 className="page-title">Our team</h1>
    <p className="page-lead">The people who help keep Fide City welcoming, fair and running smoothly.</p>
    {staff.length
      ? <ul className="team-list">{staff.map((member) => <li key={member.username}>{member.avatar ? <img className="avatar" src={member.avatar} alt="" /> : <span className="avatar" aria-hidden="true">{member.username.slice(0, 1).toUpperCase()}</span>}<div><strong>{member.username}</strong><span className="muted">{member.role === 'root_admin' ? `👑 Root Admin · ${member.additional_title || member.staff_title || 'EN | Player'} · 🎮 EN | Player` : member.staff_title || member.role}</span></div></li>)}</ul>
      : <p className="empty">Team information is being updated.</p>}
    {config.links.discord && <p><a className="btn btn-primary" href={config.links.discord} rel="noopener noreferrer" target="_blank">Join the community</a></p>}
  </div>;
}
