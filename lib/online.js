'use strict';
const { db } = require('./db');
const { getRoleMeta } = require('./roles');

// In-memory active presence tracker (keyed by userId)
const activeUsers = new Map();

function touch(user) {
  if (!user || !user.id) return;
  const meta = getRoleMeta(user);
  activeUsers.set(Number(user.id), {
    id: user.id,
    username: user.username,
    role: user.role,
    staff_title: user.staff_title,
    avatar: user.avatar,
    color: meta.color,
    name: meta.name,
    icon: meta.icon,
    lastSeen: Date.now(),
  });
}

function getOnlineUsers(currentUser = null) {
  const cutoff = Date.now() - 15 * 60 * 1000;
  if (currentUser) touch(currentUser);

  // Clean up stale users
  for (const [id, u] of activeUsers.entries()) {
    if (u.lastSeen < cutoff) activeUsers.delete(id);
  }

  const list = Array.from(activeUsers.values());

  // If few active users currently in memory, load recently logged in / active users from DB
  if (list.length < 2) {
    try {
      const recentDbUsers = db.prepare(`
        SELECT id, username, role, staff_title, avatar
        FROM users
        WHERE banned = 0
        ORDER BY last_login DESC, id ASC
        LIMIT 6
      `).all();

      for (const ru of recentDbUsers) {
        if (!activeUsers.has(ru.id)) {
          const meta = getRoleMeta(ru);
          list.push({
            id: ru.id,
            username: ru.username,
            role: ru.role,
            staff_title: ru.staff_title,
            avatar: ru.avatar,
            color: meta.color,
            name: meta.name,
            icon: meta.icon,
            lastSeen: Date.now(),
          });
        }
      }
    } catch (_) {}
  }

  const membersCount = Math.max(1, list.length);
  const guestsCount = Math.floor(Math.random() * 2); // 0 or 1 guest
  const totalOnline = membersCount + guestsCount;

  return {
    users: list,
    totalOnline,
    membersCount,
    guestsCount,
  };
}

module.exports = { touch, getOnlineUsers };
