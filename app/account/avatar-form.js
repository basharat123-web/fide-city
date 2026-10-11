'use client';

import { useState } from 'react';
import { updateAvatarAction } from '../auth/actions.js';

export default function AvatarForm({ avatar, csrfToken, username }) {
  const [data, setData] = useState('');
  const [error, setError] = useState('');
  function chooseFile(event) {
    const file = event.target.files?.[0];
    setError('');
    setData('');
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 180 * 1024) {
      setError('Choose a PNG, JPEG, WebP or GIF smaller than 180 KB.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setData(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => setError('Could not read that image file.');
    reader.readAsDataURL(file);
  }

  return <section className="card">
    <h2>Citizen profile picture</h2>
    <div className="account-avatar-preview">
      {avatar ? <img className="avatar" src={avatar} alt={`${username}'s current profile picture`} /> : <span className="avatar">{username.slice(0, 1).toUpperCase()}</span>}
      <p className="muted">Appears in the navigation and forum posts.</p>
    </div>
    <form className="form" action={updateAvatarAction}>
      <input type="hidden" name="csrf" value={csrfToken} />
      <label htmlFor="avatar-file">Upload from device</label>
      <input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={chooseFile} />
      <input type="hidden" name="avatar" value={data} />
      <label htmlFor="avatar-url">Or paste an HTTPS image URL</label>
      <input id="avatar-url" name="avatar_url" type="url" maxLength="500" placeholder="https://..." />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="btn btn-primary" type="submit">Save profile picture</button>{avatar && <button className="btn btn-danger" type="submit" name="remove" value="1">Remove picture</button>}</div>
    </form>
  </section>;
}
