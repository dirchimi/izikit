/**
 * auth-gate.ts — companion unit test (Task 1.5).
 *
 * `authGateState` is the pure branching logic behind AppShell's client-side
 * auth guard. No React render harness exists in this repo (see Task 1.4's
 * notes on session.test.ts / pull.test.ts), so the guard's three states are
 * verified here in isolation instead of via a component render test.
 */
import { describe, it, expect } from 'vitest';
import { authGateState } from './auth-gate';

describe('authGateState', () => {
  it('returns "loading" while auth status is unresolved, regardless of user', () => {
    expect(authGateState(true, null)).toBe('loading');
    expect(authGateState(true, { id: 'u1' })).toBe('loading');
  });

  it('returns "redirect" once resolved with no user (falsy)', () => {
    expect(authGateState(false, null)).toBe('redirect');
    expect(authGateState(false, undefined)).toBe('redirect');
  });

  it('returns "ready" once resolved with a truthy user', () => {
    expect(authGateState(false, { id: 'u1' })).toBe('ready');
  });

  it('never returns "ready" when user is null, even if loading is false — this is the security invariant the guard depends on', () => {
    expect(authGateState(false, null)).not.toBe('ready');
  });
});
