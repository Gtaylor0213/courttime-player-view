import { describe, expect, it } from 'vitest';
import { evaluateStrikeLockout, parseStrikeRuleConfig } from '../strikeLockout';

describe('evaluateStrikeLockout', () => {
  const config = parseStrikeRuleConfig({
    strike_threshold: 3,
    strike_window_days: 30,
    lockout_days: 7,
  });

  const now = new Date('2026-05-27T12:00:00.000Z');

  it('is not locked below threshold', () => {
    const status = evaluateStrikeLockout(
      [{ issuedAt: '2026-05-20T12:00:00.000Z' }],
      config,
      now
    );
    expect(status.isLockedOut).toBe(false);
    expect(status.activeStrikes).toBe(1);
  });

  it('is not locked when lockout period has ended', () => {
    const status = evaluateStrikeLockout(
      [
        { issuedAt: '2026-05-10T12:00:00.000Z' },
        { issuedAt: '2026-05-11T12:00:00.000Z' },
        { issuedAt: '2026-05-12T12:00:00.000Z' },
      ],
      config,
      now
    );
    expect(status.isLockedOut).toBe(false);
    expect(status.activeStrikes).toBe(3);
    expect(status.lockoutEndsAt).toBeNull();
  });

  it('is locked when at threshold inside lockout window', () => {
    const status = evaluateStrikeLockout(
      [
        { issuedAt: '2026-05-25T12:00:00.000Z' },
        { issuedAt: '2026-05-24T12:00:00.000Z' },
        { issuedAt: '2026-05-23T12:00:00.000Z' },
      ],
      config,
      now
    );
    expect(status.isLockedOut).toBe(true);
    expect(status.lockoutEndsAt).toBeTruthy();
  });

  it('ignores revoked and expired strikes', () => {
    const status = evaluateStrikeLockout(
      [
        { issuedAt: '2026-05-25T12:00:00.000Z', revoked: true },
        { issuedAt: '2026-05-24T12:00:00.000Z', expiresAt: '2026-05-01T12:00:00.000Z' },
        { issuedAt: '2026-05-23T12:00:00.000Z' },
      ],
      config,
      now
    );
    expect(status.isLockedOut).toBe(false);
    expect(status.activeStrikes).toBe(1);
  });
});
