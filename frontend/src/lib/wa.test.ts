import { describe, it, expect } from 'vitest';
import { waLink } from './wa';

describe('waLink', () => {
  it('préfixe 235 (Tchad) un numéro local à 8 chiffres', () => {
    expect(waLink('90 12 34 56')).toBe('https://wa.me/23590123456');
  });

  it('garde un numéro déjà international', () => {
    expect(waLink('+235 66 00 11 22')).toBe('https://wa.me/23566001122');
  });

  it('ignore les caractères non numériques', () => {
    expect(waLink('(235) 66-00-11-22')).toBe('https://wa.me/23566001122');
  });

  it('retourne null si vide, null ou trop court', () => {
    expect(waLink(null)).toBeNull();
    expect(waLink(undefined)).toBeNull();
    expect(waLink('')).toBeNull();
    expect(waLink('123')).toBeNull();
  });
});
