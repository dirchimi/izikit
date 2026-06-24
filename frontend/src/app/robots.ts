import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sahilley.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Espaces privés / techniques : pas d'indexation.
      disallow: ['/api/', '/admin', '/dashboard', '/vendre', '/stock', '/parametres', '/settings'],
    },
    sitemap: `${BASE}/sitemap.xml`,
  };
}
