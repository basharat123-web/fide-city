import config from '../lib/config.js';

export default function robots() {
  return {
    rules: {
      userAgent: '*',
      disallow: ['/admin', '/account', '/login', '/register', '/api/'],
    },
    sitemap: `${config.siteUrl}/sitemap.xml`,
  };
}
