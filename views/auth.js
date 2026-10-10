'use strict';
const { html, raw } = require('../lib/html');
const config = require('../lib/config');
const { page, csrfField } = require('./layout');

const turnstile = () =>
  config.turnstile.enabled
    ? html`<div class="cf-turnstile" data-sitekey="${config.turnstile.siteKey}" data-theme="dark"></div>
       <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`
    : '';

function field(id, label, input, error, hint) {
  return html`<div class="field${error ? ' has-error' : ''}">
    <label for="${id}">${label}</label>
    ${input}
    ${hint ? html`<p class="hint" id="${id}-hint">${hint}</p>` : ''}
    ${error ? html`<p class="form-error" id="${id}-err" role="alert">${error}</p>` : ''}
  </div>`;
}

function login(ctx, { error = '', username = '' } = {}) {
  const body = html`<div class="wrap auth-wrap">
    <div class="auth-card">
      <h1>Sign in</h1>
      <p class="muted">Welcome back to Fide City.</p>
      ${error ? html`<p class="form-error banner" role="alert">${error}</p>` : ''}
      <form class="form" method="post" action="/login" novalidate>
        ${csrfField(ctx)}
        ${field('username', 'Username or email', html`<input id="username" name="username" type="text" value="${username}" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="254" autofocus>`)}
        ${field('password', 'Password', html`<input id="password" name="password" type="password" autocomplete="current-password" required maxlength="128">`)}
        <div style="display: flex; justify-content: flex-end; margin-top: -0.5rem; margin-bottom: 1rem;">
          <a href="/forgot-password" style="font-size: 0.88rem; color: #c084fc; font-weight: 600;">Forgot password?</a>
        </div>
        ${turnstile()}
        <button class="btn btn-primary btn-block" type="submit">Sign in</button>
      </form>
      <p class="alt">New here? <a href="/register">Create an account</a></p>
    </div>
  </div>`;
  return page(ctx, { title: 'Sign in', body, robots: 'noindex' });
}

function forgotPassword(ctx, { error = '', message = '', ident = '' } = {}) {
  const body = html`<div class="wrap auth-wrap">
    <div class="auth-card">
      <h1>Forgot password?</h1>
      <p class="muted">Enter your registered username or email. We will generate a 6-digit OTP verification code to reset your password.</p>
      ${error ? html`<p class="form-error banner" role="alert">${error}</p>` : ''}
      ${message ? html`<p class="form-ok banner" role="status" style="background: rgba(34, 197, 94, 0.15); border: 1px solid #22c55e; color: #4ade80; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1rem;">${message}</p>` : ''}
      <form class="form" method="post" action="/forgot-password" novalidate>
        ${csrfField(ctx)}
        ${field('ident', 'Username or Email', html`<input id="ident" name="ident" type="text" value="${ident}" autocomplete="email" autocapitalize="none" spellcheck="false" required maxlength="254" autofocus>`)}
        ${turnstile()}
        <button class="btn btn-primary btn-block" type="submit">Send OTP Verification Code</button>
      </form>
      <p class="alt"><a href="/login">Back to Sign In</a> • <a href="/reset-password">Already have an OTP?</a></p>
    </div>
  </div>`;
  return page(ctx, { title: 'Forgot Password | Fide City', body, robots: 'noindex' });
}

function resetPassword(ctx, { error = '', ident = '', otp = '' } = {}) {
  const body = html`<div class="wrap auth-wrap">
    <div class="auth-card">
      <h1>Reset password</h1>
      <p class="muted">Enter your account email/username, the 6-digit OTP code, and your new password.</p>
      ${error ? html`<p class="form-error banner" role="alert">${error}</p>` : ''}
      <form class="form" method="post" action="/reset-password" novalidate>
        ${csrfField(ctx)}
        ${field('ident', 'Username or Email', html`<input id="ident" name="ident" type="text" value="${ident}" autocomplete="email" autocapitalize="none" spellcheck="false" required maxlength="254">`)}
        ${field('otp', '6-Digit OTP Code', html`<input id="otp" name="otp" type="text" value="${otp}" pattern="[0-9]{6}" maxlength="6" inputmode="numeric" placeholder="e.g. 123456" required style="font-size: 1.2rem; letter-spacing: 0.2em; text-align: center; font-weight: 700;">`, '', 'Enter the 6-digit verification code.')}
        ${field('password', 'New Password', html`<input id="password" name="password" type="password" autocomplete="new-password" required minlength="10" maxlength="128">`, '', 'At least 10 characters.')}
        ${field('confirm', 'Confirm New Password', html`<input id="confirm" name="confirm" type="password" autocomplete="new-password" required maxlength="128">`)}
        ${turnstile()}
        <button class="btn btn-primary btn-block" type="submit">Reset Password</button>
      </form>
      <p class="alt"><a href="/login">Back to Sign In</a> • <a href="/forgot-password">Resend OTP</a></p>
    </div>
  </div>`;
  return page(ctx, { title: 'Reset Password | Fide City', body, robots: 'noindex' });
}

function register(ctx, { errors = {}, values = {}, closed = false } = {}) {
  if (closed) {
    return page(ctx, {
      title: 'Join',
      robots: 'noindex',
      body: html`<div class="wrap auth-wrap"><div class="auth-card"><h1>Registration is closed</h1><p>New accounts are paused right now. Join the Discord for updates.</p><p><a class="btn btn-primary" href="/">Back to home</a></p></div></div>`,
    });
  }
  const body = html`<div class="wrap auth-wrap">
    <div class="auth-card">
      <h1>Create your account</h1>
      <p class="muted">One account for the forum, news and community.</p>
      ${errors.form ? html`<p class="form-error banner" role="alert">${errors.form}</p>` : ''}
      <form class="form" method="post" action="/register" novalidate>
        ${csrfField(ctx)}
        ${field('username', 'Username', html`<input id="username" name="username" type="text" value="${values.username || ''}" autocomplete="username" autocapitalize="none" spellcheck="false" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_]{3,20}" aria-describedby="username-hint">`, errors.username, 'Letters, numbers and underscores. 3 to 20 characters.')}
        ${field('email', 'Email', html`<input id="email" name="email" type="email" value="${values.email || ''}" autocomplete="email" required maxlength="254">`, errors.email, 'Used for account recovery and staff contact only.')}
        ${field('password', 'Password', html`<input id="password" name="password" type="password" autocomplete="new-password" required minlength="10" maxlength="128" aria-describedby="password-hint">`, errors.password, 'At least 10 characters. A long phrase is best.')}
        ${field('confirm', 'Confirm password', html`<input id="confirm" name="confirm" type="password" autocomplete="new-password" required maxlength="128">`, errors.confirm)}
        <div class="hp" aria-hidden="true"><label for="website">Leave this empty</label><input id="website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
        <div class="field check${errors.agree ? ' has-error' : ''}">
          <label class="checkbox"><input type="checkbox" name="agree" value="yes" required> <span>I am 16 or older and I agree to the <a href="/rules" target="_blank">rules</a>, <a href="/terms" target="_blank">terms</a> and <a href="/privacy" target="_blank">privacy policy</a>.</span></label>
          ${errors.agree ? html`<p class="form-error" role="alert">${errors.agree}</p>` : ''}
        </div>
        ${turnstile()}
        <button class="btn btn-primary btn-block" type="submit">Create account</button>
      </form>
      <p class="alt">Already have an account? <a href="/login">Sign in</a></p>
    </div>
  </div>`;
  return page(ctx, { title: 'Join', body, robots: 'noindex' });
}

module.exports = { login, register, forgotPassword, resetPassword, field };
