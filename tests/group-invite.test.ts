import { describe, it, expect } from 'vitest';
import {
  formatTimeRemaining,
  groupInviteExpiry,
  GROUP_INVITE_TTL_MS,
  validateInvite,
} from '@/lib/group-invite';

const NOW = new Date('2026-06-01T12:00:00Z');

describe('validateInvite', () => {
  it('rejects a missing invite as unknown', () => {
    expect(validateInvite(null, NOW)).toEqual({ ok: false, reason: 'unknown' });
    expect(validateInvite(undefined, NOW)).toEqual({ ok: false, reason: 'unknown' });
  });

  describe('single-use', () => {
    it('accepts when fresh', () => {
      const inv = { token: 'a', usedByUserId: null, multiUse: false, expiresAt: null };
      expect(validateInvite(inv, NOW)).toEqual({ ok: true });
    });
    it('rejects when consumed', () => {
      const inv = { token: 'a', usedByUserId: 7, multiUse: false, expiresAt: null };
      expect(validateInvite(inv, NOW)).toEqual({ ok: false, reason: 'used' });
    });
    it('respects expiresAt if set', () => {
      const past = new Date(NOW.getTime() - 1000);
      expect(
        validateInvite({ token: 'a', usedByUserId: null, multiUse: false, expiresAt: past }, NOW),
      ).toEqual({ ok: false, reason: 'expired' });
    });
  });

  describe('multi-use (group link)', () => {
    it('accepts when not expired, regardless of usedByUserId', () => {
      const future = new Date(NOW.getTime() + 60_000);
      const inv = { token: 'g', usedByUserId: 42, multiUse: true, expiresAt: future };
      expect(validateInvite(inv, NOW)).toEqual({ ok: true });
    });
    it('rejects when past expiry', () => {
      const past = new Date(NOW.getTime() - 1);
      const inv = { token: 'g', usedByUserId: null, multiUse: true, expiresAt: past };
      expect(validateInvite(inv, NOW)).toEqual({ ok: false, reason: 'expired' });
    });
    it('rejects exactly at expiry (boundary)', () => {
      const inv = { token: 'g', usedByUserId: null, multiUse: true, expiresAt: NOW };
      expect(validateInvite(inv, NOW)).toEqual({ ok: false, reason: 'expired' });
    });
  });
});

describe('groupInviteExpiry', () => {
  it('returns now + 24h', () => {
    const exp = groupInviteExpiry(NOW);
    expect(exp.getTime() - NOW.getTime()).toBe(GROUP_INVITE_TTL_MS);
    expect(GROUP_INVITE_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('formatTimeRemaining', () => {
  it('formats hours and minutes', () => {
    const exp = new Date(NOW.getTime() + (3 * 60 + 30) * 60_000);
    expect(formatTimeRemaining(exp, NOW)).toBe('3h 30m left');
  });
  it('formats minutes-only when under an hour', () => {
    const exp = new Date(NOW.getTime() + 12 * 60_000);
    expect(formatTimeRemaining(exp, NOW)).toBe('12m left');
  });
  it('says < 1m when nearly expired', () => {
    const exp = new Date(NOW.getTime() + 30_000);
    expect(formatTimeRemaining(exp, NOW)).toBe('< 1m left');
  });
  it('returns "expired" when in the past', () => {
    const exp = new Date(NOW.getTime() - 1);
    expect(formatTimeRemaining(exp, NOW)).toBe('expired');
  });
  it('returns "no expiry" when null', () => {
    expect(formatTimeRemaining(null, NOW)).toBe('no expiry');
  });
});
