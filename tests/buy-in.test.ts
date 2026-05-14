import { describe, it, expect } from 'vitest';
import {
  BUY_IN_DEFAULT,
  BUY_IN_MAX,
  BUY_IN_MIN,
  BUY_IN_STEP,
  computePot,
  validateBuyIn,
} from '@/lib/buy-in';

describe('validateBuyIn', () => {
  it('accepts the default', () => {
    expect(validateBuyIn(BUY_IN_DEFAULT)).toEqual({ ok: true, value: BUY_IN_DEFAULT });
  });
  it('accepts the lower bound', () => {
    expect(validateBuyIn(BUY_IN_MIN)).toEqual({ ok: true, value: BUY_IN_MIN });
  });
  it('accepts the upper bound', () => {
    expect(validateBuyIn(BUY_IN_MAX)).toEqual({ ok: true, value: BUY_IN_MAX });
  });
  it('rejects below the minimum', () => {
    expect(validateBuyIn(BUY_IN_MIN - 5)).toEqual({ ok: false, reason: 'too-low' });
    expect(validateBuyIn(0)).toEqual({ ok: false, reason: 'too-low' });
  });
  it('rejects above the maximum', () => {
    expect(validateBuyIn(BUY_IN_MAX + 5)).toEqual({ ok: false, reason: 'too-high' });
    expect(validateBuyIn(10_000)).toEqual({ ok: false, reason: 'too-high' });
  });
  it('rejects non-numeric input', () => {
    expect(validateBuyIn('banana')).toEqual({ ok: false, reason: 'not-a-number' });
    expect(validateBuyIn(undefined)).toEqual({ ok: false, reason: 'not-a-number' });
    expect(validateBuyIn(null)).toEqual({ ok: false, reason: 'not-a-number' });
  });
  it('parses numeric strings (form-data)', () => {
    expect(validateBuyIn('200')).toEqual({ ok: true, value: 200 });
    expect(validateBuyIn(' 250 ')).toEqual({ ok: true, value: 250 });
  });
  it('snaps to the nearest step', () => {
    expect(validateBuyIn(102)).toEqual({ ok: true, value: 100 });
    expect(validateBuyIn(103)).toEqual({ ok: true, value: 105 });
    expect(validateBuyIn(BUY_IN_STEP * 5 + 1)).toEqual({ ok: true, value: BUY_IN_STEP * 5 });
  });
});

describe('computePot', () => {
  it('sums user pledges', () => {
    expect(computePot([{ buyIn: 100 }, { buyIn: 50 }, { buyIn: 200 }])).toBe(350);
  });
  it('handles numeric strings (Drizzle numeric returns strings)', () => {
    expect(computePot([{ buyIn: '100' }, { buyIn: '50' }])).toBe(150);
  });
  it('treats null/undefined as zero', () => {
    expect(computePot([{ buyIn: 100 }, { buyIn: null }, { buyIn: undefined }])).toBe(100);
  });
  it('is zero for empty input', () => {
    expect(computePot([])).toBe(0);
  });
});
