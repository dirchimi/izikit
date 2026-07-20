import { describe, it, expect } from 'vitest';
import {
  resolveClientCreatedAt,
  MAX_FUTURE_SKEW_MS,
  MAX_PAST_AGE_MS,
} from './client-entry-timestamp';

const NOW = new Date('2026-07-20T12:00:00.000Z');

describe('resolveClientCreatedAt', () => {
  it('returns null when iso is undefined (online caller — DB default(now()) applies)', () => {
    expect(resolveClientCreatedAt(undefined, NOW)).toBeNull();
  });

  it('returns the parsed date when it is a plausible past entry time', () => {
    const iso = '2026-07-19T15:00:00.000Z';
    expect(resolveClientCreatedAt(iso, NOW)?.toISOString()).toBe(iso);
  });

  it('accepts small clock drift within MAX_FUTURE_SKEW_MS', () => {
    const iso = new Date(NOW.getTime() + MAX_FUTURE_SKEW_MS - 1000).toISOString();
    expect(resolveClientCreatedAt(iso, NOW)?.toISOString()).toBe(iso);
  });

  it('falls back to now for a value beyond the future skew allowance', () => {
    const future = new Date(NOW.getTime() + MAX_FUTURE_SKEW_MS + 1000).toISOString();
    expect(resolveClientCreatedAt(future, NOW)?.getTime()).toBe(NOW.getTime());
  });

  it('accepts a value right at the edge of MAX_PAST_AGE_MS', () => {
    const iso = new Date(NOW.getTime() - MAX_PAST_AGE_MS + 1000).toISOString();
    expect(resolveClientCreatedAt(iso, NOW)?.toISOString()).toBe(iso);
  });

  it('falls back to now for a value older than MAX_PAST_AGE_MS', () => {
    const ancient = new Date(NOW.getTime() - MAX_PAST_AGE_MS - 1000).toISOString();
    expect(resolveClientCreatedAt(ancient, NOW)?.getTime()).toBe(NOW.getTime());
  });

  it('falls back to now for an unparsable string', () => {
    expect(resolveClientCreatedAt('not-a-date', NOW)?.getTime()).toBe(NOW.getTime());
  });
});
