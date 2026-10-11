'use strict';

/**
 * Fide City Roleplay - Official City & Server Roles
 * Synced directly with Discord / GTA V City hierarchy.
 */

const CITY_ROLES = [
  // 1. Executive Management
  { name: 'Project Management', systemRole: 'root_admin', category: 'Executive', color: '#ed4245', icon: '👑', isDefault: false },
  { name: 'Creator of Project', systemRole: 'root_admin', category: 'Executive', color: '#ffd700', icon: '👑', isDefault: false },
  { name: 'Curator Of Project', systemRole: 'root_admin', category: 'Executive', color: '#3b82f6', icon: '👑', isDefault: false },
  { name: 'Technical Administrator', systemRole: 'admin', category: 'Engineering', color: '#f97316', icon: '🔧', isDefault: false },
  { name: 'Chief Administrator', systemRole: 'admin', category: 'Operations Head', color: '#06b6d4', icon: '🛡️', isDefault: false },
  { name: 'Deputy Chief Administrator', systemRole: 'admin', category: 'Operations Head', color: '#14b8a6', icon: '🛡️', isDefault: false },
  { name: 'Community Manager', systemRole: 'admin', category: 'Executive', color: '#a855f7', icon: '🛡️', isDefault: false },
  { name: 'Curator of Administrator', systemRole: 'admin', category: 'Senior Staff', color: '#06b6d4', icon: '🛡️', isDefault: false },
  { name: 'Senior Administrator', systemRole: 'admin', category: 'Senior Staff', color: '#ec4899', icon: '🛡️', isDefault: false },
  { name: 'Server Administrator', systemRole: 'admin', category: 'Field Staff', color: '#3b82f6', icon: '🛡️', isDefault: false },
  { name: 'PR Manager', systemRole: 'admin', category: 'Executive', color: '#8b5cf6', icon: '🛡️', isDefault: false },

  // 2. Curators & Administration Staff
  { name: 'Junior Administrator', systemRole: 'mod', category: 'Field Staff', color: '#2dd4bf', icon: '⚔️', isDefault: false },
  { name: 'Assistant Administrator', systemRole: 'mod', category: 'Staff', color: '#14b8a6', icon: '⚔️', isDefault: false },

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
];

const DEFAULT_ROLE_NAME = 'EN | Player';

function normalizeTitle(t) {
  if (!t) return '';
  let s = String(t).trim().toLowerCase();
  s = s.replace(/^en\s*\|\s*/i, '').trim();
  if (s === 'project management' || s === 'creator of project' || s === 'curator of project' || s === 'root admin') return 'executive_root';
  if (s === 'technical administrator' || s === 'tech admin' || s === 'technical admin') return 'tech_admin';
  if (s === 'chief administrator' || s === 'chief admin' || s === 'owner') return 'chief_admin';
  if (s === 'deputy chief administrator' || s === 'deputy chief admin' || s === 'deputy chief') return 'deputy_chief';
  if (s === 'curator of administrator' || s === 'curator of admin' || s === 'curator of administration' || s === 'admin manager') return 'curator_admin';
  if (s === 'senior administrator' || s === 'senior admin' || s === 'section mod') return 'senior_admin';
  if (s === 'server administrator' || s === 'server admin' || s === 'junior mod') return 'server_admin';
  if (s === 'junior administrator' || s === 'junior admin' || s === 'restricted') return 'junior_admin';
  if (s === 'community manager') return 'community_manager';
  if (s === 'discord moderator') return 'discord_moderator';
  if (s === 'pc checker') return 'pc_checker';
  return s;
}

/** Check if user has permission to edit forum thread prefixes (Picture 2 whitelist, excluding PC Checker, Discord Mod, Community Manager) */
function canEditPrefix(user) {
  if (!user) return false;
  const isRootEmail = user.email && String(user.email).toLowerCase().trim() === 'basharathussain.mail@gmail.com';
  if (user.role === 'root_admin' || isRootEmail) return true;
  if (user.role !== 'admin' && user.role !== 'mod') return false;

  const raw = String(user.staff_title || '').trim().toLowerCase();
  const clean = raw.replace(/^en\s*\|\s*/i, '').trim();

  // Excluded per user instructions: PC Checker, Discord Moderator, Community Manager
  if (clean === 'pc checker' || clean === 'discord moderator' || clean === 'community manager') {
    return false;
  }

  // Whitelisted from admin hierarchy
  const allowed = [
    'project management',
    'creator of project',
    'curator of project',
    'technical administrator',
    'tech admin',
    'chief administrator',
    'deputy chief administrator',
    'curator of administration',
    'curator of administrator',
    'senior administrator',
    'server administrator',
    'junior administrator',
  ];

  return allowed.includes(clean);
}

function findRoleByName(name) {
  if (!name) return null;
  const s = String(name).trim().toLowerCase();
  const direct = CITY_ROLES.find((r) => r.name.toLowerCase() === s);
  if (direct) return direct;
  // Check common aliases
  if (s === 'creator of project') return CITY_ROLES.find((r) => r.name === 'Creator of Project') || CITY_ROLES[0];
  if (s === 'curator of admin' || s === 'curator of administration') return CITY_ROLES.find((r) => r.name === 'Curator of Administrator');
  if (s === 'deputy chief admin') return CITY_ROLES.find((r) => r.name === 'Deputy Chief Administrator');
  if (s === 'senior admin') return CITY_ROLES.find((r) => r.name === 'Senior Administrator');
  if (s === 'server admin') return CITY_ROLES.find((r) => r.name === 'Server Administrator');
  if (s === 'junior admin') return CITY_ROLES.find((r) => r.name === 'Junior Administrator');
  return null;
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
    return { name: title || 'Project Management', systemRole: 'root_admin', category: 'Executive', color: '#ffd700', icon: '👑' };
  }

  // Critical security guard: No non-root account can ever hold or display Root/Project Management titles
  const norm = normalizeTitle(title);
  if (norm === 'executive_root' || role === 'root_admin') {
    title = 'Chief Administrator';
    role = 'admin';
  }

  const matched = findRoleByName(title);
  if (matched) return matched;

  // Fallback defaults based on system role
  if (role === 'admin') {
    return { name: title || 'Chief Administrator', systemRole: 'admin', category: 'Operations Head', color: '#06b6d4', icon: '🛡️' };
  }
  if (role === 'mod') {
    return { name: title || 'Staff Moderator', systemRole: 'mod', category: 'Field Staff', color: '#a855f7', icon: '⚔️' };
  }
  return { name: title || DEFAULT_ROLE_NAME, systemRole: 'member', category: 'Community', color: '#f43f5e', icon: '🎮' };
}

function getAssignedRoleMeta(user) {
  if (user && (user.role === 'root_admin' || (user.email && String(user.email).toLowerCase().trim() === 'basharathussain.mail@gmail.com'))) {
    const assignedTitle = user.additional_title || DEFAULT_ROLE_NAME;
    const assignedRole = findRoleByName(assignedTitle);
    if (assignedRole) return assignedRole;
    return getRoleMeta(DEFAULT_ROLE_NAME);
  }
  return getRoleMeta(user);
}

/* -----------------------------------------------------------------------
   PERMISSION MATRIX — matches the Fide City official permission document
   -----------------------------------------------------------------------
   Level 1 — Executive: Project Management & Creator of Project (Root Admin)
             Unrestricted authority across all platform tools.
   Level 2 — Engineering: Technical Administrator
             Full thread control, Account Recovery, System / DB Only.
   Level 3 — Operations Head: Chief & Deputy Chief Administrator
             Chief: Pin / Lock / Delete / Move / Tag, Ban / Warn, Moderator Panel.
             Deputy Chief: Pin / Lock / Move / Tag, Warn, Moderator Panel.
   Level 4 — Senior Staff: Curator of Administration & Senior Admin
             Curator: Approve / Reject (Status tags), Move, Lock, Internal Review.
             Senior Admin: Lock / Tag Threads, Issue Warnings, No ACP Access.
   Level 5 — Field Staff: Server Admin & Junior Administrator
             Server Admin: Lock / Move (Assigned), Report Only, No ACP Access.
             Junior Admin: Reply Only, No Action, No ACP Access.
   ----------------------------------------------------------------------- */
function getPermissions(user) {
  const empty = {
    // Thread Controls
    canPin: false,
    canLock: false,
    canDelete: false,
    canDeletePost: false,
    canMove: false,
    canTagStatus: false,

    // User Moderation
    canBan: false,
    canWarn: false,
    canUnban: false,
    canRecoverAccount: false,
    canChangeRole: false,

    // Panels
    hasAdminPanel: false,
    hasFullUsers: false,
    hasNews: false,
    hasAuditLog: false,
    hasSystemPanel: false,
    hasRootConsole: false,
  };
  if (!user) return empty;

  const isRootEmail = user.email && String(user.email).toLowerCase().trim() === 'basharathussain.mail@gmail.com';
  const isRoot = user.role === 'root_admin' || isRootEmail;

  // Level 1: Root Admin (Project Management / Creator of Project) — UNRESTRICTED ALL ACCESS
  if (isRoot) {
    return {
      canPin: true,
      canLock: true,
      canDelete: true,
      canDeletePost: true,
      canMove: true,
      canTagStatus: true,

      canBan: true,
      canWarn: true,
      canUnban: true,
      canRecoverAccount: true,
      canChangeRole: true,

      hasAdminPanel: true,
      hasFullUsers: true,
      hasNews: true,
      hasAuditLog: true,
      hasSystemPanel: true,
      hasRootConsole: true,
    };
  }

  const role = user.role;
  const isAnyStaff = role === 'admin' || role === 'mod';
  if (!isAnyStaff) return empty;

  const key = normalizeTitle(user.staff_title);

  // Level 2: Engineering — Technical Administrator
  // Thread: Full Access
  // User Moderation: Account Recovery
  // Admin Panel: System / DB Only
  if (key === 'tech_admin') {
    return {
      canPin: true,
      canLock: true,
      canDelete: true,
      canDeletePost: true,
      canMove: true,
      canTagStatus: true,

      canBan: false,
      canWarn: true,
      canUnban: false,
      canRecoverAccount: true,
      canChangeRole: false,

      hasAdminPanel: true,
      hasFullUsers: false,
      hasNews: false,
      hasAuditLog: true,
      hasSystemPanel: true,
      hasRootConsole: false,
    };
  }

  // Level 3: Operations Head — Chief Administrator
  // Thread: Pin / Lock / Delete, Move, Tag
  // User Moderation: Ban / Warn Users, Unban
  // Admin Panel: Moderator Panel (Overview, Members, News, Security Log)
  if (key === 'chief_admin') {
    return {
      canPin: true,
      canLock: true,
      canDelete: true,
      canDeletePost: true,
      canMove: true,
      canTagStatus: true,

      canBan: true,
      canWarn: true,
      canUnban: true,
      canRecoverAccount: false,
      canChangeRole: true,

      hasAdminPanel: true,
      hasFullUsers: true,
      hasNews: true,
      hasAuditLog: true,
      hasSystemPanel: false,
      hasRootConsole: false,
    };
  }

  // Level 3: Operations Head — Deputy Chief Administrator
  // Thread: Pin / Lock / Move, Tag (No Delete)
  // User Moderation: Warn Users (No Ban)
  // Admin Panel: Moderator Panel (Overview, Members, News)
  if (key === 'deputy_chief') {
    return {
      canPin: true,
      canLock: true,
      canDelete: false,
      canDeletePost: false,
      canMove: true,
      canTagStatus: true,

      canBan: false,
      canWarn: true,
      canUnban: false,
      canRecoverAccount: false,
      canChangeRole: true,

      hasAdminPanel: true,
      hasFullUsers: true,
      hasNews: true,
      hasAuditLog: false,
      hasSystemPanel: false,
      hasRootConsole: false,
    };
  }

  // Level 4: Senior Staff — Curator of Administration
  // Thread: Approve / Reject (Status tags), Move, Lock
  // User Moderation: Internal Review, Warn
  // Admin Panel: Limited Mod Panel (Overview, Audit Log for internal review)
  if (key === 'curator_admin') {
    return {
      canPin: false,
      canLock: true,
      canDelete: false,
      canDeletePost: false,
      canMove: true,
      canTagStatus: true,

      canBan: false,
      canWarn: true,
      canUnban: false,
      canRecoverAccount: false,
      canChangeRole: false,

      hasAdminPanel: true,
      hasFullUsers: false,
      hasNews: false,
      hasAuditLog: true,
      hasSystemPanel: false,
      hasRootConsole: false,
    };
  }

  // Level 4: Senior Staff — Senior Administrator
  // Thread: Lock / Tag Threads (Status tags)
  // User Moderation: Issue Warnings
  // Admin Panel: No ACP Access
  if (key === 'senior_admin') {
    return {
      canPin: false,
      canLock: true,
      canDelete: false,
      canDeletePost: false,
      canMove: false,
      canTagStatus: true,

      canBan: false,
      canWarn: true,
      canUnban: false,
      canRecoverAccount: false,
      canChangeRole: false,

      hasAdminPanel: false,
      hasFullUsers: false,
      hasNews: false,
      hasAuditLog: false,
      hasSystemPanel: false,
      hasRootConsole: false,
    };
  }

  // Level 5: Field Staff — Server Administrator
  // Thread: Lock / Move (Assigned), Prefix status allowed
  // User Moderation: Report Only (no ban/direct warn)
  // Admin Panel: No ACP Access
  if (key === 'server_admin') {
    return {
      canPin: false,
      canLock: true,
      canDelete: false,
      canDeletePost: false,
      canMove: true,
      canTagStatus: true,

      canBan: false,
      canWarn: false,
      canUnban: false,
      canRecoverAccount: false,
      canChangeRole: false,

      hasAdminPanel: false,
      hasFullUsers: false,
      hasNews: false,
      hasAuditLog: false,
      hasSystemPanel: false,
      hasRootConsole: false,
    };
  }

  // Level 5: Field Staff — Junior Administrator
  // Thread: Reply, Prefix status allowed
  // User Moderation: No Action
  // Admin Panel: No ACP Access
  if (key === 'junior_admin') {
    return {
      canPin: false,
      canLock: false,
      canDelete: false,
      canDeletePost: false,
      canMove: false,
      canTagStatus: true,

      canBan: false,
      canWarn: false,
      canUnban: false,
      canRecoverAccount: false,
      canChangeRole: false,

      hasAdminPanel: false,
      hasFullUsers: false,
      hasNews: false,
      hasAuditLog: false,
      hasSystemPanel: false,
      hasRootConsole: false,
    };
  }

  // Default fallback for other staff roles (Community Manager, PR Manager, etc.)
  const isAdmin = role === 'admin';
  return {
    canPin: isAdmin,
    canLock: true,
    canDelete: false,
    canDeletePost: false,
    canMove: isAdmin,
    canTagStatus: canEditPrefix(user),

    canBan: false,
    canWarn: true,
    canUnban: false,
    canRecoverAccount: false,
    canChangeRole: false,

    hasAdminPanel: isAdmin,
    hasFullUsers: isAdmin,
    hasNews: isAdmin,
    hasAuditLog: false,
    hasSystemPanel: false,
    hasRootConsole: false,
  };
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
  const isRootAdmin = userOrTitle && typeof userOrTitle === 'object'
    && (userOrTitle.role === 'root_admin' || (userOrTitle.email && String(userOrTitle.email).toLowerCase().trim() === 'basharathussain.mail@gmail.com'));
  const primary = isRootAdmin ? getAssignedRoleMeta(userOrTitle) : getRoleMeta(userOrTitle, fallbackRole);
  const secondary = PERMANENT_PLAYER_ROLE;
  return { isRootAdmin, primary, secondary };
}

module.exports = {
  CITY_ROLES,
  DEFAULT_ROLE_NAME,
  PERMANENT_PLAYER_ROLE,
  findRoleByName,
  getRoleMeta,
  getAssignedRoleMeta,
  getUserRoles,
  getPermissions,
  canEditPrefix,
};
