import Script from 'next/script';
import AccountNav from './components/account-nav';
import '../public/css/style.css';

const navigation = [
  ['Home', '/'],
  ['How to play', '/#how-to-play'],
  ['Forum', '/forum'],
  ['News', '/news'],
  ['Team', '/team'],
  ['Rules', '/rules'],
];

export const metadata = {
  title: {
    default: 'Fide City Roleplay | GTA V roleplay community',
    template: '%s | Fide City Roleplay',
  },
  description: 'A GTA V roleplay city. Pick a path, build a character and write your own story in Los Santos.',
  icons: {
    icon: '/img/favicon.png',
    apple: '/img/logo-256.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div id="top-loader" className="top-loader" aria-hidden="true" />
        <div id="fc-global-loader" className="fc-loader-overlay" aria-hidden="true" role="status">
          <div className="fc-loader-card">
            <div className="fc-spinner-rings">
              <span className="ring ring-outer" />
              <span className="ring ring-middle" />
              <span className="ring ring-inner" />
              <span className="ring-core" />
            </div>
            <div className="fc-loader-text" id="fc-loader-msg">SYNCING FIDE CITY</div>
            <div className="fc-loader-sub">TRANSMITTING SECURE DATA...</div>
          </div>
        </div>
        <a className="skip" href="#main">Skip to content</a>
        <header className="site-header">
          <div className="header-wrap bar">
            <a className="brand" href="/" aria-label="Fide City Roleplay home">
              <img src="/img/logo-256.png" width="48" height="48" alt="" />
              <span className="brand-text">Fide City<small>Roleplay</small></span>
            </a>
            <nav className="nav" id="nav" aria-label="Main">
              <ul>{navigation.map(([label, href]) => <li key={label}><a href={href}>{label}</a></li>)}</ul>
            </nav>
            <div className="bar-end">
              <div className="pill" data-status-pill aria-live="polite"><span className="dot" aria-hidden="true" /><span data-status-text>Checking city</span></div>
              <AccountNav />
              <button className="menu-btn" type="button" aria-expanded="false" aria-controls="nav" data-menu>
                <span className="sr">Menu</span><span className="bars" aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div className="wrap foot-grid">
            <div className="foot-brand">
              <img src="/img/logo-256.png" width="96" height="96" alt="Fide City Roleplay logo" loading="lazy" />
              <p>A GTA V roleplay city. Pick a path, build a character and write your own story in Los Santos.</p>
            </div>
            <nav aria-label="Explore">
              <h2>Explore</h2>
              <ul>
                <li><a href="/#how-to-play">How to play</a></li><li><a href="/#organizations">Organizations</a></li>
                <li><a href="/#faq">FAQ</a></li><li><a href="/forum">Forum</a></li>
                <li><a href="/news">News</a></li><li><a href="/team">Team</a></li>
              </ul>
            </nav>
            <nav aria-label="Legal">
              <h2>Legal</h2>
              <ul>
                <li><a href="/rules">Server rules</a></li><li><a href="/terms">Terms of use</a></li>
                <li><a href="/privacy">Privacy policy</a></li><li><a href="/cookies">Cookies</a></li>
              </ul>
            </nav>
            <div>
              <h2>Contact</h2>
              <ul><li><a href="mailto:">Contact the team</a></li></ul>
            </div>
          </div>
          <div className="wrap foot-bottom">
            <p>© {new Date().getFullYear()} Fide City Roleplay. All rights reserved.</p>
            <p>Fide City Roleplay is a fan-made community project. It is not affiliated with or endorsed by Rockstar Games, Take-Two Interactive or Cfx.re.</p>
          </div>
        </footer>
        <Script src="/js/main.js?v=3.2" strategy="afterInteractive" />
      </body>
    </html>
  );
}
