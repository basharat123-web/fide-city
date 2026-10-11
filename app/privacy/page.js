import config from '../../lib/config.js';

export const metadata = { title: 'Privacy policy' };

export default function PrivacyPage() {
  return <article className="wrap prose-wrap prose">
    <h1 className="page-title">Privacy policy</h1><p className="muted">Last updated 9 October 2026</p>
    <p>This policy explains what personal data this website collects when you create an account or use the forum, and what we do with it.</p>
    <h2>What we collect</h2>
    <ul><li><strong>Account details:</strong> username, email address and a salted, hashed password. Passwords are never stored in readable form.</li><li><strong>Content you post:</strong> forum threads, replies and other text you submit.</li><li><strong>Security data:</strong> IP address and timestamps when you sign in, register or use staff tools.</li><li><strong>Session cookie:</strong> a strictly necessary cookie to keep you signed in and protect forms. See <a href="/cookies">Cookies</a>.</li></ul>
    <h2>How we use it</h2><ul><li>To run your account and show your forum posts.</li><li>To keep the community secure and prevent abuse.</li><li>To contact you about your account or moderation decisions.</li></ul>
    <p>We do not sell your data and do not use advertising or analytics trackers on this site.</p>
    <h2>Third parties</h2><p>Pages may load fonts from Google Fonts. Cloudflare Turnstile may process technical data when CAPTCHA protection is enabled. Our hosting and database providers process requests on our behalf.</p>
    <h2>Retention and your choices</h2><p>Account and forum data are retained until account deletion. You can change your password or request account deletion from your <a href="/account">account page</a>. For other data requests, email <a href={`mailto:${config.links.supportEmail}`}>{config.links.supportEmail}</a>.</p>
    <h2>Security and children</h2><p>Passwords are hashed with scrypt, connections use HTTPS, and forms are protected against cross-site request forgery. This community is for players aged 16 and over; we do not knowingly collect data from younger children.</p>
    <h2>Contact</h2><p>Questions about this policy: <a href={`mailto:${config.links.supportEmail}`}>{config.links.supportEmail}</a>.</p>
  </article>;
}
