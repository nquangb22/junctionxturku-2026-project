import { describe, expect, it } from 'vitest';

import {
  LOCKOUT_MAX_ATTEMPTS,
  LOCKOUT_STEPS_MS,
  NO_LOCKOUT,
  attemptsLeft,
  lockoutRemainingMs,
  parseLockout,
  recordUnlockFailure,
  recordUnlockSuccess,
  type LockoutState,
} from '../lockout';

const T0 = Date.parse('2026-10-17T12:00:00Z');

function fail(times: number, s: LockoutState = NO_LOCKOUT, at = T0): LockoutState {
  for (let i = 0; i < times; i++) s = recordUnlockFailure(s, at);
  return s;
}

describe('unlock lockout', () => {
  it('allows four failures, then bans for a minute on the fifth', () => {
    const four = fail(4);
    expect(lockoutRemainingMs(four, T0)).toBe(0);
    expect(attemptsLeft(four, T0)).toBe(1);
    const five = recordUnlockFailure(four, T0);
    expect(five.failures).toBe(LOCKOUT_MAX_ATTEMPTS);
    expect(lockoutRemainingMs(five, T0)).toBe(60_000);
    expect(attemptsLeft(five, T0)).toBe(0);
    expect(lockoutRemainingMs(five, T0 + 59_000)).toBe(1_000);
    expect(lockoutRemainingMs(five, T0 + 60_000)).toBe(0);
  });

  it('does not count tries while banned', () => {
    const banned = fail(5);
    const again = recordUnlockFailure(banned, T0 + 10_000);
    expect(again.failures).toBe(5);
    expect(again.bannedUntil).toBe(banned.bannedUntil);
  });

  it('lengthens the ban with every failure after it ends, up to an hour', () => {
    let s = fail(5);
    const waits: number[] = [];
    let t = T0;
    for (let i = 0; i < 5; i++) {
      t += lockoutRemainingMs(s, t);
      s = recordUnlockFailure(s, t);
      waits.push(lockoutRemainingMs(s, t));
    }
    expect(waits).toEqual([LOCKOUT_STEPS_MS[1], LOCKOUT_STEPS_MS[2], LOCKOUT_STEPS_MS[3], LOCKOUT_STEPS_MS[3], LOCKOUT_STEPS_MS[3]]);
  });

  it('clears everything after a successful unlock', () => {
    const ok = recordUnlockSuccess(T0 + 61_000);
    expect(ok.failures).toBe(0);
    expect(lockoutRemainingMs(ok, T0 + 61_000)).toBe(0);
    expect(attemptsLeft(ok, T0 + 61_000)).toBe(LOCKOUT_MAX_ATTEMPTS);
  });

  it('is not shortened by setting the clock back', () => {
    const banned = fail(5);
    expect(lockoutRemainingMs(banned, T0 - 3_600_000)).toBe(60_000);
  });

  it('treats malformed stored data as a fresh start', () => {
    expect(parseLockout(null)).toEqual(NO_LOCKOUT);
    expect(parseLockout('x')).toEqual(NO_LOCKOUT);
    expect(parseLockout({ failures: -3, bannedUntil: 'soon', lastSeen: Number.NaN })).toEqual(NO_LOCKOUT);
    expect(parseLockout({ failures: 5, bannedUntil: T0, lastSeen: T0 })).toEqual({ failures: 5, bannedUntil: T0, lastSeen: T0 });
  });
});
