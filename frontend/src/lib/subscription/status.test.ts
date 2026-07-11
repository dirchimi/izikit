import { describe, it, expect } from 'vitest';
import { computeSubscription, extendPeriod } from './status';

const NOW = new Date('2026-07-04T12:00:00.000Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * 86400000);

describe('computeSubscription', () => {
  it('TRIAL when trial in the future and no paid period', () => {
    const v = computeSubscription(
      { plan: null, trialEndsAt: inDays(10), currentPeriodEnd: null },
      NOW,
    );
    expect(v.status).toBe('TRIAL');
    expect(v.daysLeft).toBe(10);
    expect(v.activeUntil).toBe(inDays(10).toISOString());
    expect(v.plan).toBeNull();
  });

  it('ACTIVE when paid period valid (paid overrides expired trial)', () => {
    const v = computeSubscription(
      { plan: 'PREMIUM', trialEndsAt: inDays(-5), currentPeriodEnd: inDays(20) },
      NOW,
    );
    expect(v.status).toBe('ACTIVE');
    expect(v.plan).toBe('PREMIUM');
    expect(v.daysLeft).toBe(20);
  });

  it('EXPIRED when both trial and paid period are past', () => {
    const v = computeSubscription(
      { plan: 'SOLO', trialEndsAt: inDays(-30), currentPeriodEnd: inDays(-1) },
      NOW,
    );
    expect(v.status).toBe('EXPIRED');
    expect(v.daysLeft).toBe(0);
  });

  it('EXPIRED when never had a trial or period', () => {
    const v = computeSubscription({ plan: null, trialEndsAt: null, currentPeriodEnd: null }, NOW);
    expect(v.status).toBe('EXPIRED');
    expect(v.activeUntil).toBeNull();
  });

  it('ignores an unknown plan string', () => {
    const v = computeSubscription(
      { plan: 'GOLD', trialEndsAt: inDays(3), currentPeriodEnd: null },
      NOW,
    );
    expect(v.plan).toBeNull();
  });

  // ── Grâce / blocage des écritures (« appli douce ») ──────────────────────
  it('TRIAL/ACTIVE ne bloque jamais les écritures', () => {
    expect(
      computeSubscription({ plan: null, trialEndsAt: inDays(2), currentPeriodEnd: null }, NOW)
        .writeBlocked,
    ).toBe(false);
    expect(
      computeSubscription({ plan: 'SOLO', trialEndsAt: null, currentPeriodEnd: inDays(5) }, NOW)
        .writeBlocked,
    ).toBe(false);
  });

  it('EXPIRED mais DANS la grâce (≤ 3 jours) : pas encore bloqué', () => {
    // Essai fini il y a 2 jours → grâce jusqu'à J+3 → encore ouvert.
    const v = computeSubscription(
      { plan: 'SOLO', trialEndsAt: inDays(-2), currentPeriodEnd: null },
      NOW,
    );
    expect(v.status).toBe('EXPIRED');
    expect(v.writeBlocked).toBe(false);
    expect(v.graceEndsAt).toBe(inDays(1).toISOString()); // -2 + 3 = +1
  });

  it('EXPIRED au-delà de la grâce (> 3 jours) : écritures bloquées', () => {
    const v = computeSubscription(
      { plan: 'SOLO', trialEndsAt: inDays(-4), currentPeriodEnd: null },
      NOW,
    );
    expect(v.status).toBe('EXPIRED');
    expect(v.writeBlocked).toBe(true);
  });

  it('bord exact : blocage à l’instant précis où la grâce se termine', () => {
    // trial fini il y a exactement 3 jours → graceEndsAt == NOW → bloqué (>=).
    const v = computeSubscription(
      { plan: 'SOLO', trialEndsAt: inDays(-3), currentPeriodEnd: null },
      NOW,
    );
    expect(v.graceEndsAt).toBe(NOW.toISOString());
    expect(v.writeBlocked).toBe(true);
  });

  it('EXPIRED sans aucune date connue : fail-open (jamais bloqué)', () => {
    const v = computeSubscription({ plan: null, trialEndsAt: null, currentPeriodEnd: null }, NOW);
    expect(v.status).toBe('EXPIRED');
    expect(v.writeBlocked).toBe(false);
    expect(v.graceEndsAt).toBeNull();
  });
});

describe('extendPeriod', () => {
  it('stacks on top of a still-valid period', () => {
    const cur = new Date('2026-08-01T00:00:00.000Z');
    const { periodStart, periodEnd } = extendPeriod(cur, NOW, 1);
    expect(periodStart).toEqual(cur);
    expect(periodEnd).toEqual(new Date('2026-09-01T00:00:00.000Z'));
  });

  it('starts from now when no valid period', () => {
    const { periodStart, periodEnd } = extendPeriod(inDays(-10), NOW, 2);
    expect(periodStart).toEqual(NOW);
    expect(periodEnd.getMonth()).toBe(8); // July (6) + 2 = September (8)
  });

  it('clamps end-of-month instead of overflowing (31 Jan +1 mois → 29 Fév)', () => {
    // Sans garde, setMonth(0→1) sur le 31 janvier déborde au 2/3 mars.
    const jan31 = new Date('2028-01-31T00:00:00.000Z'); // 2028 = année bissextile
    const { periodEnd } = extendPeriod(jan31, new Date('2028-01-01T00:00:00.000Z'), 1);
    expect(periodEnd).toEqual(new Date('2028-02-29T00:00:00.000Z'));
  });
});
