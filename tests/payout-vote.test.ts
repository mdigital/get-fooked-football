import { describe, it, expect } from 'vitest';
import { tallyPayoutVotes, validatePayoutChoice } from '@/lib/payout-vote';

describe('validatePayoutChoice', () => {
  it('accepts the two ballot options, case-insensitively', () => {
    expect(validatePayoutChoice('PAY')).toBe('PAY');
    expect(validatePayoutChoice('NOT')).toBe('NOT');
    expect(validatePayoutChoice('pay')).toBe('PAY');
    expect(validatePayoutChoice('not')).toBe('NOT');
  });

  it('rejects anything else', () => {
    expect(validatePayoutChoice('YES')).toBeNull();
    expect(validatePayoutChoice('')).toBeNull();
    expect(validatePayoutChoice(null)).toBeNull();
    expect(validatePayoutChoice(undefined)).toBeNull();
    expect(validatePayoutChoice(42)).toBeNull();
  });
});

describe('tallyPayoutVotes', () => {
  const SIX = [1, 2, 3, 4, 5, 6];

  it('counts pay / not / no-answer over all registered users', () => {
    const t = tallyPayoutVotes(SIX, [
      { userId: 1, choice: 'PAY' },
      { userId: 2, choice: 'PAY' },
      { userId: 3, choice: 'PAY' },
      { userId: 4, choice: 'NOT' },
      { userId: 5, choice: 'NOT' },
    ]);
    expect(t.eligible).toBe(6);
    expect(t.pay).toBe(3);
    expect(t.not).toBe(2);
    expect(t.noAnswer).toBe(1);
  });

  it('percentages always sum to exactly 100', () => {
    const t = tallyPayoutVotes(SIX, [
      { userId: 1, choice: 'PAY' },
      { userId: 2, choice: 'PAY' },
      { userId: 3, choice: 'PAY' },
      { userId: 4, choice: 'NOT' },
      { userId: 5, choice: 'NOT' },
    ]);
    // 50 / 33.3 / 16.7 — largest remainder gives the spare point to no-answer.
    expect(t.payPct).toBe(50);
    expect(t.notPct).toBe(33);
    expect(t.noAnswerPct).toBe(17);
    expect(t.payPct + t.notPct + t.noAnswerPct).toBe(100);
  });

  it('breaks remainder ties in pay → not → no-answer order', () => {
    const t = tallyPayoutVotes([1, 2, 3], [
      { userId: 1, choice: 'PAY' },
      { userId: 2, choice: 'NOT' },
    ]);
    // Three-way 33.33 split: the single spare point goes to pay.
    expect(t.payPct).toBe(34);
    expect(t.notPct).toBe(33);
    expect(t.noAnswerPct).toBe(33);
  });

  it('a unanimous vote reads 100 / 0 / 0', () => {
    const t = tallyPayoutVotes([1, 2], [
      { userId: 1, choice: 'PAY' },
      { userId: 2, choice: 'PAY' },
    ]);
    expect(t.payPct).toBe(100);
    expect(t.notPct).toBe(0);
    expect(t.noAnswerPct).toBe(0);
  });

  it('ignores votes from users who are not registered', () => {
    const t = tallyPayoutVotes([1, 2], [{ userId: 99, choice: 'PAY' }]);
    expect(t.pay).toBe(0);
    expect(t.noAnswer).toBe(2);
  });

  it('counts each user once — the latest vote wins', () => {
    const t = tallyPayoutVotes([1, 2], [
      { userId: 1, choice: 'PAY' },
      { userId: 1, choice: 'NOT' },
    ]);
    expect(t.pay).toBe(0);
    expect(t.not).toBe(1);
    expect(t.noAnswer).toBe(1);
  });

  it('handles nobody registered without dividing by zero', () => {
    const t = tallyPayoutVotes([], []);
    expect(t.eligible).toBe(0);
    expect(t.payPct).toBe(0);
    expect(t.notPct).toBe(0);
    expect(t.noAnswerPct).toBe(0);
  });
});
