import { redirect } from 'next/navigation';
import config from '../../lib/config.js';
import { getCurrentUser } from '../../lib/next/auth.js';
import { registerAction } from '../auth/actions.js';
import Captcha from '../auth/captcha.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Join', robots: { index: false, follow: false } };

export default async function RegisterPage({ searchParams }) {
  const [{ error }, user] = await Promise.all([searchParams, getCurrentUser()]);
  if (user) redirect('/');
  if (!config.registrationOpen) return <div className="wrap auth-wrap"><div className="auth-card"><h1>Registration is closed</h1><p>New accounts are paused right now. Join the Discord for updates.</p><p><a className="btn btn-primary" href="/">Back to home</a></p></div></div>;
  return <div className="wrap auth-wrap"><div className="auth-card">
    <h1>Create your account</h1><p className="muted">One account for the forum, news and community.</p>
    {error && <p className="form-error banner" role="alert">{error}</p>}
    <form className="form" action={registerAction}>
      <label htmlFor="username">Username</label><input id="username" name="username" type="text" autoComplete="username" autoCapitalize="none" minLength="3" maxLength="20" pattern="[A-Za-z0-9_]{3,20}" required />
      <p className="hint">Letters, numbers and underscores. 3 to 20 characters.</p>
      <label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" maxLength="254" required />
      <label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength="10" maxLength="128" required />
      <p className="hint">At least 10 characters. A long phrase is best.</p>
      <label htmlFor="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" maxLength="128" required />
      <div className="hp" aria-hidden="true"><label htmlFor="website">Leave this empty</label><input id="website" name="website" type="text" tabIndex="-1" autoComplete="off" /></div>
      <label className="checkbox"><input type="checkbox" name="agree" value="yes" required /> <span>I am 16 or older and agree to the <a href="/rules" target="_blank">rules</a>, <a href="/terms" target="_blank">terms</a> and <a href="/privacy" target="_blank">privacy policy</a>.</span></label>
      <Captcha />
      <button className="btn btn-primary btn-block" type="submit">Create account</button>
    </form>
    <p className="alt">Already have an account? <a href="/login">Sign in</a></p>
  </div></div>;
}
