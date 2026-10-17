/**
 * Unlock lockout: after LOCKOUT_MAX_ATTEMPTS failed unlocks in a row the app refuses to ask again for a while,
 * and every further failure lengthens the wait (the iPhone passcode pattern). A success clears it.
 *
 * The clock can only move forward: `lastSeen` remembers the latest time we saw, so setting the phone's
 * clock back does not shorten a ban.
 */

export const LOCKOUT_MAX_ATTEMPTS = 5;
/** Ban after the 5th failure, the 6th, the 7th, and the 8th onwards. */
export const LOCKOUT_STEPS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000] as const;

export interface LockoutState {
  /** Failed unlocks since the last success. */
  failures: number;
  /** Epoch ms; no new attempt before this. */
  bannedUntil: number | null;
  /** Latest epoch ms seen, so a clock set backwards cannot end a ban early. */
  lastSeen: number;
}

export const NO_LOCKOUT: LockoutState = { failures: 0, bannedUntil: null, lastSeen: 0 };

const clock = (s: LockoutState, now: number) => Math.max(now, s.lastSeen);

/** Milliseconds left on the ban, 0 when an attempt is allowed. */
export function lockoutRemainingMs(s: LockoutState, now: number): number {
  const t = clock(s, now);
  return s.bannedUntil !== null && s.bannedUntil > t ? s.bannedUntil - t : 0;
}

/** Attempts left before the next ban (0 while banned). */
export function attemptsLeft(s: LockoutState, now: number): number {
  if (lockoutRemainingMs(s, now) > 0) return 0;
  return Math.max(0, LOCKOUT_MAX_ATTEMPTS - s.failures);
}

/** A failed unlock. While a ban runs nothing is counted, so retrying cannot stack bans. */
export function recordUnlockFailure(s: LockoutState, now: number): LockoutState {
  const t = clock(s, now);
  if (lockoutRemainingMs(s, t) > 0) return { ...s, lastSeen: t };
  const failures = s.failures + 1;
  const over = failures - LOCKOUT_MAX_ATTEMPTS;
  const step = LOCKOUT_STEPS_MS[Math.min(over, LOCKOUT_STEPS_MS.length - 1)];
  return { failures, bannedUntil: over >= 0 && step !== undefined ? t + step : null, lastSeen: t };
}

export function recordUnlockSuccess(now: number): LockoutState {
  return { failures: 0, bannedUntil: null, lastSeen: now };
}

/** Reads stored state; anything malformed counts as a fresh start rather than a crash. */
export function parseLockout(raw: unknown): LockoutState {
  if (!raw || typeof raw !== 'object') return NO_LOCKOUT;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  return {
    failures: Math.floor(num(r.failures) ?? 0),
    bannedUntil: num(r.bannedUntil) ?? null,
    lastSeen: num(r.lastSeen) ?? 0,
  };
}
