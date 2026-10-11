import config from '../../lib/config.js';

export const metadata = { title: 'Cookies' };

export default function CookiesPage() {
  const cookieName = config.isProd ? '__Host-fc_sid' : 'fc_sid';
  return <article className="wrap prose-wrap prose">
    <h1 className="page-title">Cookies</h1><p className="muted">Last updated 9 October 2026</p>
    <p>We keep cookies to the minimum needed to run the site.</p>
    <div className="table-scroll"><table className="data"><thead><tr><th scope="col">Cookie</th><th scope="col">Purpose</th><th scope="col">Lasts</th></tr></thead><tbody><tr><td><code>{cookieName}</code></td><td>Keeps you signed in and protects forms. Strictly necessary.</td><td>Up to 7 days</td></tr></tbody></table></div>
    <p>We do not use advertising, tracking or analytics cookies. Because the only cookie is strictly necessary, there is no cookie banner. Third-party services we load, such as Google Fonts, follow their own policies.</p>
  </article>;
}
