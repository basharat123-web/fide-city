import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../lib/next/auth.js';
import { loginAction } from '../auth/actions.js';
import Captcha from '../auth/captcha.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in', robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }) {
  const [{ error, message }, user] = await Promise.all([searchParams, getCurrentUser()]);
  if (user) redirect('/');
  return <div className="wrap auth-wrap"><div className="auth-card">
    <h1>Sign in</h1><p className="muted">Welcome back to Fide City.</p>
    {error && <p className="form-error banner" role="alert">{error}</p>}
    {message && <p className="form-ok banner" role="status">{message}</p>}
    <form className="form" action={loginAction}>
      <label htmlFor="username">Username or email</label><input id="username" name="username" type="text" autoComplete="username" autoCapitalize="none" required maxLength="254" autoFocus />
      <label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength="128" />
      <p className="hint"><a href="/forgot-password">Forgot password?</a></p>
      <Captcha />
      <button className="btn btn-primary btn-block" type="submit">Sign in</button>
    </form>
    <p className="alt">New here? <a href="/register">Create an account</a></p>
  </div></div>;
}
