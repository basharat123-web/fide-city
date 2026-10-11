import { getSupabase } from '../../lib/next/supabase.js';

export async function getRootUsers(term, filterRole) {
  const client = getSupabase();
  const columns = 'id, username, email, role, staff_title, additional_title, avatar, created_at, last_login, banned, ban_reason';
  const baseQuery = () => {
    let query = client.from('users').select(columns);
    if (filterRole === 'banned') query = query.eq('banned', 1);
    else if (filterRole === 'leadership') {
      query = query.in('staff_title', ['Governor', 'Election Commissioner', 'Faction Leader', 'State Leader', 'Crime Leader', 'State Deputy', 'Crime Deputy', 'Weazel News']);
    } else if (filterRole === 'member') query = query.eq('banned', 0);
    else if (['root_admin', 'admin', 'mod'].includes(filterRole)) query = query.eq('role', filterRole);
    return query.order('created_at', { ascending: false }).limit(150);
  };
  let people;
  if (term) {
    const pattern = `%${term.replace(/[%_\\]/g, '\\$&')}%`;
    const [byName, byEmail] = await Promise.all([
      baseQuery().ilike('username', pattern),
      baseQuery().ilike('email', pattern),
    ]);
    if (byName.error) throw new Error(`[root console users] ${byName.error.message}`);
    if (byEmail.error) throw new Error(`[root console search] ${byEmail.error.message}`);
    people = [...new Map([...(byName.data || []), ...(byEmail.data || [])].map((person) => [String(person.id), person])).values()]
      .sort((a, b) => Number(b.created_at) - Number(a.created_at)).slice(0, 150);
  } else {
    const { data, error } = await baseQuery();
    if (error) throw new Error(`[root console users] ${error.message}`);
    people = data || [];
  }
  return people;
}
