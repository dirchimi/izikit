import { describe, it, expect } from 'vitest';
import { computeExpiryStatus } from './expiry';

const NOW = new Date('2026-07-10T09:00:00.000Z');
const ymd = (s: string) => `${s}T12:00:00.000Z`;

describe('computeExpiryStatus', () => {
  it('null si pas de date (produit non périssable)', () => {
    expect(computeExpiryStatus(null, 30, NOW)).toBeNull();
    expect(computeExpiryStatus(undefined, 30, NOW)).toBeNull();
  });

  it('null si date invalide', () => {
    expect(computeExpiryStatus('pas-une-date', 30, NOW)).toBeNull();
  });

  it('ok quand la péremption est au-delà du seuil', () => {
    const v = computeExpiryStatus(ymd('2026-09-10'), 30, NOW); // ~62 j
    expect(v).toEqual({ status: 'ok', daysLeft: 62 });
  });

  it('expiring quand la péremption est dans le seuil', () => {
    const v = computeExpiryStatus(ymd('2026-08-05'), 30, NOW); // 26 j ≤ 30
    expect(v?.status).toBe('expiring');
    expect(v?.daysLeft).toBe(26);
  });

  it('expiring le jour même (daysLeft 0)', () => {
    const v = computeExpiryStatus(ymd('2026-07-10'), 30, NOW);
    expect(v).toEqual({ status: 'expiring', daysLeft: 0 });
  });

  it('expired dès le lendemain de la date', () => {
    const v = computeExpiryStatus(ymd('2026-07-09'), 30, NOW);
    expect(v).toEqual({ status: 'expired', daysLeft: -1 });
  });

  it('bord exact : daysLeft == alertDays reste expiring', () => {
    const v = computeExpiryStatus(ymd('2026-08-09'), 30, NOW); // exactement 30 j
    expect(v).toEqual({ status: 'expiring', daysLeft: 30 });
  });

  it('l’heure est ignorée (comparaison par jour calendaire)', () => {
    // Péremption à 23h aujourd'hui, il est 9h → toujours « jour même », pas périmé.
    const v = computeExpiryStatus('2026-07-10T23:00:00.000Z', 30, NOW);
    expect(v?.status).toBe('expiring');
    expect(v?.daysLeft).toBe(0);
  });
});
