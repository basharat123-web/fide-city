'use client';

import { useEffect, useState } from 'react';
import { logoutAction } from '../auth/actions.js';

export default function AccountNav() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (active) {
          setUser(data && data.user);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) setReady(true);
      });
    return () => { active = false; };
  }, []);

  if (!ready) return <div className="account"><a className="btn btn-quiet" href="/login">Sign in</a><a className="btn btn-primary" href="/register">Join now</a></div>;
  if (!user) return <div className="account"><a className="btn btn-quiet" href="/login">Sign in</a><a className="btn btn-primary" href="/register">Join now</a></div>;

  return (
    <div className="account-capsule">
      <a className="account-pill" href="/account" title={`Account: ${user.username}`}>
        {user.avatar
          ? <img src={user.avatar} alt={user.username} width="26" height="26" style={{ borderRadius: '50%', objectFit: 'cover' }} />
          : <span className="avatar-badge">{user.isRoot ? '👑' : '🎮'}</span>}
        <span className="user-handle">{user.username}</span>
        <span className="role-chip">{user.isRoot ? `👑 Root Admin · ${user.staffTitle}` : user.staffTitle}</span>
      </a>
      {user.isRoot
        ? <a className="btn-console btn-console-root" href="/admin/root">👑 Master Console</a>
        : user.canOpenAdmin ? <a className="btn-console" href="/admin">Staff Panel</a> : null}
      <form action={logoutAction} className="signout-form">
        <input type="hidden" name="csrf" value={user.csrfToken} />
        <button className="btn-signout" type="submit">Sign out</button>
      </form>
    </div>
  );
}
