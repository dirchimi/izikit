import { describe, it, expect, vi, afterEach } from 'vitest';
import { relativeTime } from './relative-time';

function fakeT(key: string, vars?: Record<string, string | number>): string {
  if (!vars) return key;
  return `${key}:${JSON.stringify(vars)}`;
}

describe('relativeTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "now" under 1 minute', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:30Z'));
    expect(relativeTime('2026-07-20T12:00:00Z', fakeT)).toBe('notif.ago.now');
  });

  it('returns minutes between 1 and 59', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:05:00Z'));
    expect(relativeTime('2026-07-20T12:00:00Z', fakeT)).toBe('notif.ago.min:{"n":5}');
  });

  it('returns hours between 1 and 23', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T15:00:00Z'));
    expect(relativeTime('2026-07-20T12:00:00Z', fakeT)).toBe('notif.ago.hour:{"n":3}');
  });

  it('returns days under 30', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T12:00:00Z'));
    expect(relativeTime('2026-07-20T12:00:00Z', fakeT)).toBe('notif.ago.day:{"n":2}');
  });

  it('falls back to a locale date string at 30+ days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
    const result = relativeTime('2026-07-20T12:00:00Z', fakeT);
    expect(result).not.toMatch(/^notif\.ago\./);
  });
});
