# Fide City Roleplay – website and forum

Official site for Fide City Roleplay: home page, how to play, organizations, FAQ, rules, news, team page, member accounts and a moderated forum. The Next.js app requires Node.js 22.13 or newer and the packages in `package.json`. The legacy Node server remains available as a fallback during migration.

The Next.js App Router implementation is the target for Vercel. The legacy Node server remains available for the existing deployment until the Supabase schema and data migration are applied and validated.

## Migrating SQLite data to Supabase

1. Back up the SQLite database and run `supabase/schema.sql` in the Supabase SQL Editor.
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the environment where the migration is run. Use a private machine; the service-role key must never be exposed to a browser.
3. Review a read-only count of the source data:

   ```bash
   npm run migrate:supabase -- --sqlite=data/fidecity.db
   ```

4. After reviewing the counts and ensuring the source file is the intended production database, run:

   ```bash
   npm run migrate:supabase -- --apply --sqlite=data/fidecity.db
   ```

The migration is additive and repeatable: existing Supabase rows are not overwritten, and imported rows are tagged with migration keys. It maps users by existing migration key, username, or email, remaps forum/session foreign keys, migrates active sessions and unexpired password-reset codes, and excludes the known sample accounts and forum threads unless `--include-demo-data` is explicitly supplied. Rows whose referenced user/category cannot be mapped are skipped with a warning. Inspect the completion output and validate the destination data before changing Vercel routing. No live database is modified by the default dry run.

## Run it on your computer

```bash
node --disable-warning=ExperimentalWarning server.js
```

Open http://localhost:3000. In development the app creates its own database in `data/` and uses a temporary session secret.

## Put it online

This is a Node.js app with a database, so it needs a Node host. Netlify's static hosting cannot run it. Good options: Render, Railway, Fly.io, or any VPS (with nginx or Caddy in front for HTTPS).

1. Copy `.env.example` to `.env` (or set the same variables in your host's dashboard).
2. Set at least `NODE_ENV=production`, `SITE_URL` (your https address), `SESSION_SECRET` (the app refuses to start in production without a strong one), `DISCORD_INVITE`, `FIVEM_CONNECT`, and `FIVEM_STATUS_HOST` if you want the live player count.
3. Start with `npm start`.
4. Create your owner account: `npm run create-admin -- YourName you@example.com` (the password is typed at a hidden prompt). Then sign in and open `/admin`.
5. Put the site behind Cloudflare (free plan is fine) and set `TRUST_PROXY=1` (or `2` if you have Cloudflare and nginx).
6. Keep the database file (`data/fidecity.db`, or wherever `DB_PATH` points) on persistent storage and back it up.

## Make it yours

- Texts for the home page, organizations, FAQ and rules: `data/content.js`
- Colors and layout: `public/css/style.css` (palette is sampled from the logo)
- Logo: `public/img/logo.png` (the other sizes are generated from it)
- Forum categories: seeded on first run in `lib/db.js`

## Security built in

- Passwords hashed with scrypt, 10-character minimum, common-password and username checks.
- Sign-in lockout after repeated failures per account, plus per-IP rate limits, with identical error messages for unknown users and wrong passwords.
- Server-side sessions: HttpOnly, SameSite=Lax, `__Host-` cookie and Secure flag in production, new session id on login (no fixation), sessions revoked on password change.
- CSRF token on every form, plus Origin checks on every POST.
- Strict Content-Security-Policy (no inline scripts or styles), HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP and CORP.
- All user text is escaped on output (no HTML is accepted); SQL is parameterized everywhere.
- Host-header check, request size and method limits, path traversal protection, no server version leaks.
- Sign-up bot traps (honeypot and minimum fill time), optional Cloudflare Turnstile CAPTCHA (`TURNSTILE_*` variables), forum posting rate limits and duplicate detection.
- Roles (member, moderator, admin), ban and unban, an audit log of staff actions and sign-in events in `/admin`.

Run `npm test` any time. It starts the site on a temporary database and checks all of the above (58 checks).

## What it does not do (yet)

- No password-reset email and no email verification. An admin can ban or remove accounts, but there is no "forgot password" flow.
- Rate limits live in memory, so they reset when the app restarts and are per server instance.
- Network-level attacks (DDoS) need to be handled by Cloudflare or your host, not by the app.
- The privacy policy, terms and rules are sensible starting texts. Have them reviewed for your own community and local law before launch.
- Fonts load from Google Fonts. If you want zero third-party requests, self-host them and tighten `style-src` and `font-src` in `lib/security.js`.
