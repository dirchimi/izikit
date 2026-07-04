import { describe, it, expect } from 'vitest';
import { toWhatsAppNumber } from './phone';

describe('toWhatsAppNumber', () => {
  it('préfixe l’indicatif à un numéro local (cas Tchad)', () => {
    expect(toWhatsAppNumber('66 12 34 56', '235')).toBe('23566123456');
  });

  it('tolère les séparateurs (tirets, points, parenthèses)', () => {
    expect(toWhatsAppNumber('66-12.34 56', '235')).toBe('23566123456');
  });

  it('laisse un numéro déjà international (+indicatif) intact', () => {
    expect(toWhatsAppNumber('+235 66 12 34 56', '235')).toBe('23566123456');
    expect(toWhatsAppNumber('23566123456', '235')).toBe('23566123456');
  });

  it('convertit le préfixe 00 en international', () => {
    expect(toWhatsAppNumber('0023566123456', '235')).toBe('23566123456');
  });

  it('retire un 0 national de tête avant de préfixer', () => {
    expect(toWhatsAppNumber('066123456', '235')).toBe('23566123456');
  });

  it('respecte un autre indicatif (Sénégal)', () => {
    expect(toWhatsAppNumber('77 123 45 67', '221')).toBe('221771234567');
  });

  it('renvoie une chaîne vide pour une saisie vide', () => {
    expect(toWhatsAppNumber('', '235')).toBe('');
    expect(toWhatsAppNumber(null, '235')).toBe('');
  });
});
