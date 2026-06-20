import { describe, it, expect } from 'vitest';
import {
  parsePeriod,
  periodRange,
  buildBuckets,
  bucketIndexFor,
  marginPct,
  rankTopProducts,
} from './helpers';

// Ancre déterministe : vendredi 19 juin 2026, 14:00 locale.
const NOW = new Date(2026, 5, 19, 14, 0, 0);

describe('parsePeriod', () => {
  it('valide ou retombe sur week', () => {
    expect(parsePeriod('month')).toBe('month');
    expect(parsePeriod('year')).toBe('year');
    expect(parsePeriod(null)).toBe('week');
    expect(parsePeriod('bogus')).toBe('week');
  });
});

describe('periodRange', () => {
  it('today = [minuit, minuit+1j)', () => {
    const { from, to } = periodRange('today', NOW);
    expect(from).toEqual(new Date(2026, 5, 19));
    expect(to).toEqual(new Date(2026, 5, 20));
  });
  it('week = 7 jours finissant aujourd’hui', () => {
    const { from, to } = periodRange('week', NOW);
    expect(from).toEqual(new Date(2026, 5, 13));
    expect(to).toEqual(new Date(2026, 5, 20));
  });
  it('month = mois calendaire', () => {
    const { from, to } = periodRange('month', NOW);
    expect(from).toEqual(new Date(2026, 5, 1));
    expect(to).toEqual(new Date(2026, 6, 1));
  });
  it('year = année calendaire', () => {
    const { from, to } = periodRange('year', NOW);
    expect(from).toEqual(new Date(2026, 0, 1));
    expect(to).toEqual(new Date(2027, 0, 1));
  });
});

describe('buildBuckets', () => {
  it('week → 7 compartiments journaliers, labels jours', () => {
    const b = buildBuckets('week', NOW);
    expect(b).toHaveLength(7);
    expect(b[0]?.label).toBe('Sam'); // 13 juin 2026 = samedi
    expect(b[6]?.label).toBe('Ven'); // 19 juin 2026 = vendredi
  });
  it('year → 12 compartiments mensuels', () => {
    const b = buildBuckets('year', NOW);
    expect(b).toHaveLength(12);
    expect(b[0]?.label).toBe('Jan');
    expect(b[11]?.label).toBe('Déc');
  });
  it('month → du 1er à aujourd’hui (19 jours)', () => {
    const b = buildBuckets('month', NOW);
    expect(b).toHaveLength(19);
    expect(b[0]?.label).toBe('1');
    expect(b[18]?.label).toBe('19');
  });
  it('today → 1 compartiment', () => {
    expect(buildBuckets('today', NOW)).toHaveLength(1);
  });
});

describe('bucketIndexFor', () => {
  it('place une date dans le bon compartiment', () => {
    const b = buildBuckets('week', NOW);
    expect(bucketIndexFor(b, new Date(2026, 5, 19, 9, 0))).toBe(6);
    expect(bucketIndexFor(b, new Date(2026, 5, 13, 23, 0))).toBe(0);
    expect(bucketIndexFor(b, new Date(2026, 5, 1))).toBe(-1); // hors fenêtre
  });
});

describe('marginPct', () => {
  it('arrondit la marge en %, 0 si CA nul', () => {
    expect(marginPct(2500, 10000)).toBe(25);
    expect(marginPct(0, 0)).toBe(0);
  });
});

describe('rankTopProducts', () => {
  it('regroupe par produit, trie par CA, classe', () => {
    const top = rankTopProducts([
      { name: 'Riz', qty: 2, unitPrice: 6000, productId: 'p1' },
      { name: 'Riz', qty: 1, unitPrice: 6000, productId: 'p1' },
      { name: 'Eau', qty: 10, unitPrice: 500, productId: 'p2' },
    ]);
    expect(top[0]).toEqual({ rank: 1, name: 'Riz', qty: 3, ca: 18000 });
    expect(top[1]).toEqual({ rank: 2, name: 'Eau', qty: 10, ca: 5000 });
  });
  it('regroupe par nom les lignes sans produit (supprimé)', () => {
    const top = rankTopProducts([
      { name: 'Ancien', qty: 1, unitPrice: 1000, productId: null },
      { name: 'Ancien', qty: 2, unitPrice: 1000, productId: null },
    ]);
    expect(top).toHaveLength(1);
    expect(top[0]?.qty).toBe(3);
  });
});
