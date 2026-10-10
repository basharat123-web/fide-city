'use strict';

/**
 * Fide City Roleplay - Official City & Server Roles
 * Synced directly with Discord / GTA V City hierarchy.
 */

const CITY_ROLES = [
  // 1. Executive Management
  { name: 'Project Management', systemRole: 'root_admin', category: 'Executive', color: '#ed4245', icon: '👑', isDefault: false },
  { name: 'Curator Of Project', systemRole: 'root_admin', category: 'Executive', color: '#3b82f6', icon: '👑', isDefault: false },
  { name: 'Chief Administrator', systemRole: 'admin', category: 'Executive', color: '#06b6d4', icon: '🛡️', isDefault: false },
  { name: 'Deputy Chief Administrator', systemRole: 'admin', category: 'Executive', color: '#14b8a6', icon: '🛡️', isDefault: false },
  { name: 'Technical Administrator', systemRole: 'admin', category: 'Executive', color: '#f97316', icon: '🛡️', isDefault: false },
  { name: 'Community Manager', systemRole: 'admin', category: 'Executive', color: '#a855f7', icon: '🛡️', isDefault: false },
  { name: 'Curator of Administrator', systemRole: 'admin', category: 'Executive', color: '#06b6d4', icon: '🛡️', isDefault: false },
  { name: 'Senior Administrator', systemRole: 'admin', category: 'Executive', color: '#ec4899', icon: '🛡️', isDefault: false },
  { name: 'Server Administrator', systemRole: 'admin', category: 'Executive', color: '#3b82f6', icon: '🛡️', isDefault: false },
  { name: 'PR Manager', systemRole: 'admin', category: 'Executive', color: '#8b5cf6', icon: '🛡️', isDefault: false },

  // 2. Curators & Administration Staff
  { name: 'Junior Administrator', systemRole: 'mod', category: 'Staff', color: '#2dd4bf', icon: '⚔️', isDefault: false },
  { name: 'Assistant Administrator', systemRole: 'mod', category: 'Staff', color: '#14b8a6', icon: '⚔️', isDefault: false },
  { name: 'Discord Moderator', systemRole: 'mod', category: 'Staff', color: '#d97706', icon: '⚔️', isDefault: false },
  { name: 'PC Checker', systemRole: 'mod', category: 'Staff', color: '#ef4444', icon: '⚔️', isDefault: false },
  { name: 'Senior Curator State', systemRole: 'mod', category: 'Staff', color: '#2563eb', icon: '⚔️', isDefault: false },
  { name: 'Senior Curator Crime', systemRole: 'mod', category: 'Staff', color: '#10b981', icon: '⚔️', isDefault: false },
  { name: 'Curator: State', systemRole: 'mod', category: 'Staff', color: '#94a3b8', icon: '⚔️', isDefault: false },
  { name: 'Curator: Crime', systemRole: 'mod', category: 'Staff', color: '#94a3b8', icon: '⚔️', isDefault: false },
  { name: 'Curator: Families', systemRole: 'mod', category: 'Staff', color: '#94a3b8', icon: '⚔️', isDefault: false },
  { name: 'Tester', systemRole: 'mod', category: 'Staff', color: '#10b981', icon: '⚔️', isDefault: false },

  // 3. City & Faction Leadership
  { name: 'Governor', systemRole: 'member', category: 'City Leadership', color: '#22c55e', icon: '🏛️', isDefault: false },
  { name: 'Election Commissioner', systemRole: 'member', category: 'City Leadership', color: '#f97316', icon: '🗳️', isDefault: false },
  { name: 'Faction Leader', systemRole: 'member', category: 'City Leadership', color: '#eab308', icon: '⭐', isDefault: false },
  { name: 'State Leader', systemRole: 'member', category: 'City Leadership', color: '#eab308', icon: '⭐', isDefault: false },
  { name: 'Crime Leader', systemRole: 'member', category: 'City Leadership', color: '#eab308', icon: '⭐', isDefault: false },
  { name: 'State Deputy', systemRole: 'member', category: 'City Leadership', color: '#eab308', icon: '⭐', isDefault: false },
  { name: 'Crime Deputy', systemRole: 'member', category: 'City Leadership', color: '#eab308', icon: '⭐', isDefault: false },
  { name: 'Weazel News', systemRole: 'member', category: 'City Leadership', color: '#64748b', icon: '📰', isDefault: false },

  // 4. Community & Player Roles
  { name: 'Fide Booster', systemRole: 'member', category: 'Community', color: '#ec4899', icon: '💎', isDefault: false },
  { name: 'EN | Player', systemRole: 'member', category: 'Community', color: '#f43f5e', icon: '🎮', isDefault: true },
  { name: 'Awaiting Admin Interview', systemRole: 'member', category: 'Community', color: '#94a3b8', icon: '⏳', isDefault: false },
  { name: 'Awaiting Leader Interview', systemRole: 'member', category: 'Community', color: '#94a3b8', icon: '⏳', isDefault: false },
  { name: 'Muted', systemRole: 'member', category: 'Community', color: '#6b7280', icon: '🔇', isDefault: false },
];

const DEFAULT_ROLE_NAME = 'EN | Player';

function findRoleByName(name) {
  if (!name) return null;
  return CITY_ROLES.find((r) => r.name.toLowerCase() === String(name).trim().toLowerCase()) || null;
}

function getRoleMeta(userOrTitle, fallbackRole) {
  let title = '';
  let role = 'member';

  if (typeof userOrTitle === 'object' && userOrTitle !== null) {
    title = userOrTitle.staff_title || '';
    role = userOrTitle.role || 'member';
  } else if (typeof userOrTitle === 'string') {
    title = userOrTitle;
    role = fallbackRole || 'member';
  }

  const isRootAdmin = (role === 'root_admin') || (typeof userOrTitle === 'object' && userOrTitle && userOrTitle.email && String(userOrTitle.email).toLowerCase().trim() === 'basharathussain.mail@gmail.com');
  if (isRootAdmin) {
    return { name: 'Root Admin', systemRole: 'root_admin', category: 'Executive', color: '#ffd700', icon: '👑' };
  }

  // Critical security guard: No non-root account can ever hold or display Root/Project Management titles
  if (title === 'Project Management' || title === 'Curator Of Project' || title === 'Root Admin' || role === 'root_admin') {
    title = 'Chief Administrator';
    role = 'admin';
  }

  const matched = findRoleByName(title);
  if (matched) return matched;

  // Fallback defaults based on system role
  if (role === 'admin') {
    return { name: title || 'Server Administrator', systemRole: 'admin', category: 'Executive', color: '#06b6d4', icon: '🛡️' };
  }
  if (role === 'mod') {
    return { name: title || 'Staff Moderator', systemRole: 'mod', category: 'Staff', color: '#a855f7', icon: '⚔️' };
  }
  return { name: title || DEFAULT_ROLE_NAME, systemRole: 'member', category: 'Community', color: '#f43f5e', icon: '🎮' };
}

const PERMANENT_PLAYER_ROLE = {
  name: 'EN | Player',
  systemRole: 'member',
  category: 'Community',
  color: '#f43f5e',
  icon: '🎮',
  isDefault: true,
  isPermanent: true,
};

function getUserRoles(userOrTitle, fallbackRole) {
  const primary = getRoleMeta(userOrTitle, fallbackRole);
  const secondary = PERMANENT_PLAYER_ROLE;
  return { primary, secondary };
}

module.exports = {
  CITY_ROLES,
  DEFAULT_ROLE_NAME,
  PERMANENT_PLAYER_ROLE,
  findRoleByName,
  getRoleMeta,
  getUserRoles,
};
