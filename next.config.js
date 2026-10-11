const config = require('./lib/config.js');

const responseHeaders = [
  ...(config.isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }] : []),
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      `script-src 'self' 'unsafe-inline'${config.turnstile.enabled ? ' https://challenges.cloudflare.com' : ''}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      'font-src https://fonts.gstatic.com',
      "img-src 'self' data: https:",
      `connect-src 'self'${config.turnstile.enabled ? ' https://challenges.cloudflare.com' : ''}`,
      config.turnstile.enabled ? 'frame-src https://challenges.cloudflare.com' : "frame-src 'none'",
      ...(config.isProd ? ['upgrade-insecure-requests'] : []),
    ].join('; '),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['@supabase/supabase-js'],
  async headers() {
    return [{ source: '/:path*', headers: responseHeaders }];
  },
  async redirects() {
    return [{ source: '/favicon.ico', destination: '/img/favicon.png', statusCode: 301 }];
  },
};

module.exports = nextConfig;
