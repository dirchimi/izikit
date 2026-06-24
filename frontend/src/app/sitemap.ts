import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sahilley.com';

// Pages publiques indexables (l'app sous /dashboard est privée → hors sitemap).
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ['', '/connexion', '/inscription', '/mot-de-passe-oublie'];
  return routes.map((path) => ({
    url: `${BASE}${path}`,
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : 0.6,
  }));
}
