import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../lib/next/auth.js';
import { resetPasswordAction } from '../auth/actions.js';
import Captcha from '../auth/captcha.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reset password', robots: { index: false, follow: false } };

export default async function ResetPasswordPage({ searchParams }) {
  const [{ error }, user] = await Promise.all([searchParams, getCurrentUser()]);
  if (user) redirect('/account');
  return <div className="wrap auth-wrap"><div className="auth-card">
    <h1>Reset password</h1><p className="muted">Enter the username or email address, the six-digit code sent to your registered email, and your new password.</p>
    {error && <p className="form-error banner" role="alert">{error}</p>}
    <form className="form" action={resetPasswordAction}>
      <label htmlFor="ident">Username or email</label><input id="ident" name="ident" type="text" autoComplete="email" autoCapitalize="none" maxLength="254" required />
      <label htmlFor="otp">Six-digit verification code</label><input id="otp" name="otp" type="text" pattern="[0-9]{6}" maxLength="6" inputMode="numeric" autoComplete="one-time-code" required />
      <label htmlFor="password">New password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength="10" maxLength="128" required />
      <label htmlFor="confirm">Confirm new password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" maxLength="128" required />
      <Captcha />
      <button className="btn btn-primary btn-block" type="submit">Reset password</button>
    </form>
    <p className="alt"><a href="/login">Back to sign in</a> · <a href="/forgot-password">Request another code</a></p>
  </div></div>;
}
