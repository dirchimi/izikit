// Fondation « temps réel » : le contrat de cache/invalidation sur lequel
// reposent les helpers de src/lib/boutique/realtime.ts. (Le hook lui-même n'est
// pas monté ici — l'env de test est `node`, sans testing-library.)
import { describe, it, expect, beforeEach } from 'vitest';
import {
  setCache,
  getCache,
  invalidateCache,
  invalidateCachePrefix,
  revalidateResources,
} from './useApi';

const KEYS = [
  '/api/products',
  '/api/sales',
  '/api/dashboard',
  '/api/reports?range=day',
  '/api/reports?range=week',
  '/api/other',
];

describe('useApi cache (fondation temps réel)', () => {
  beforeEach(() => KEYS.forEach(invalidateCache));

  it('setCache / getCache : aller-retour', () => {
    setCache('/api/products', { n: 1 });
    expect(getCache('/api/products')).toEqual({ n: 1 });
  });

  it('invalidateCache : supprime une entrée', () => {
    setCache('/api/products', 1);
    invalidateCache('/api/products');
    expect(getCache('/api/products')).toBeNull();
  });

  it('invalidateCachePrefix : couvre les variantes à query-string (reports)', () => {
    setCache('/api/reports?range=day', 1);
    setCache('/api/reports?range=week', 2);
    setCache('/api/other', 3);
    invalidateCachePrefix('/api/reports');
    expect(getCache('/api/reports?range=day')).toBeNull();
    expect(getCache('/api/reports?range=week')).toBeNull();
    expect(getCache('/api/other')).toBe(3);
  });

  it('revalidateResources : invalide plusieurs ressources, épargne les autres', () => {
    setCache('/api/products', 1);
    setCache('/api/sales', 2);
    setCache('/api/dashboard', 3);
    revalidateResources(['/api/products', '/api/sales']);
    expect(getCache('/api/products')).toBeNull();
    expect(getCache('/api/sales')).toBeNull();
    expect(getCache('/api/dashboard')).toBe(3);
  });
});
