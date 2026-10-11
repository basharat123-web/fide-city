import config from '../../../lib/config.js';

export function GET() {
  const expires = new Date(Date.now() + 180 * 86400000).toISOString();
  const body = [
    `Contact: mailto:${config.links.supportEmail}`,
    `Expires: ${expires}`,
    'Preferred-Languages: en',
    `Canonical: ${config.siteUrl}/.well-known/security.txt`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
