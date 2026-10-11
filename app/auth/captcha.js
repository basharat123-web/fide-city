import Script from 'next/script';
import config from '../../lib/config.js';

export default function Captcha() {
  if (!config.turnstile.enabled) return null;
  return <>
    <div className="cf-turnstile" data-sitekey={config.turnstile.siteKey} data-theme="dark" />
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
  </>;
}
