import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../lib/next/auth.js';
import { requestPasswordResetAction } from '../auth/actions.js';
import Captcha from '../auth/captcha.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Forgot password', robots: { index: false, follow: false } };

export default async function ForgotPasswordPage({ searchParams }) {
  const [{ error, message }, user] = await Promise.all([searchParams, getCurrentUser()]);
  if (user) redirect('/account');
  return <div className="wrap auth-wrap"><div className="auth-card">
    <h1>Forgot password?</h1><p className="muted">Enter the username or email address for your account. If eligible, we will send a six-digit code to your registered email.</p>
    {error && <p className="form-error banner" role="alert">{error}</p>}
    {message && <p className="form-ok banner" role="status">{message}</p>}
    <form className="form" action={requestPasswordResetAction}>
      <label htmlFor="ident">Username or email</label><input id="ident" name="ident" type="text" autoComplete="email" autoCapitalize="none" maxLength="254" required autoFocus />
      <Captcha />
      <button className="btn btn-primary btn-block" type="submit">Send reset code</button>
    </form>
    <p className="alt"><a href="/login">Back to sign in</a> · <a href="/reset-password">Already have a code?</a></p>
  </div></div>;
}
