import { describe, it, expect } from 'vitest';
import {
  prizePotShare,
  totalAllocatedPct,
  payoutFraction,
  splitPrizePayout,
  computeSlushFund,
} from '@/lib/prizes';
import { topBuyIn } from '@/lib/buy-in';

describe('prizePotShare', () => {
  it('50% of $700 = $350', () => {
    expect(prizePotShare(50, 700)).toBe(350);
  });

  it('rounds to nearest dollar', () => {
    expect(prizePotShare(33.3, 100)).toBe(33);
    expect(prizePotShare(33.5, 100)).toBe(34);
  });

  it('returns 0 for a zero pot', () => {
    expect(prizePotShare(50, 0)).toBe(0);
  });

  it('returns 0 for a 0% prize', () => {
    expect(prizePotShare(0, 700)).toBe(0);
  });

  it('rejects negative percentages', () => {
    expect(() => prizePotShare(-5, 100)).toThrow();
  });

  it('rejects > 100%', () => {
    expect(() => prizePotShare(150, 100)).toThrow();
  });
});

describe('totalAllocatedPct', () => {
  it('sums all the prize percentages', () => {
    expect(totalAllocatedPct([{ pctOfPot: 50 }, { pctOfPot: 25 }, { pctOfPot: 10 }])).toBe(85);
  });

  it('handles fractional percentages', () => {
    expect(totalAllocatedPct([{ pctOfPot: 33.3 }, { pctOfPot: 33.3 }, { pctOfPot: 33.4 }])).toBeCloseTo(100, 1);
  });

  it('returns 0 for an empty array', () => {
    expect(totalAllocatedPct([])).toBe(0);
  });
});

describe('topBuyIn', () => {
  it('returns the largest pledge', () => {
    expect(topBuyIn([{ buyIn: 100 }, { buyIn: 250 }, { buyIn: 50 }])).toBe(250);
  });

  it('coerces string pledges', () => {
    expect(topBuyIn([{ buyIn: '80' }, { buyIn: '500' }])).toBe(500);
  });

  it('ignores null/undefined pledges', () => {
    expect(topBuyIn([{ buyIn: null }, { buyIn: 120 }, { buyIn: undefined }])).toBe(120);
  });

  it('returns 0 for an empty group', () => {
    expect(topBuyIn([])).toBe(0);
  });
});

describe('payoutFraction', () => {
  it('is 1 when you pledged the top buy-in', () => {
    expect(payoutFraction(500, 500)).toBe(1);
  });

  it('caps in proportion to a smaller pledge', () => {
    expect(payoutFraction(250, 500)).toBe(0.5);
    expect(payoutFraction(100, 500)).toBe(0.2);
  });

  it('never exceeds 1 even if somehow above the top', () => {
    expect(payoutFraction(600, 500)).toBe(1);
  });

  it('is 1 when there is no top reference yet (everyone equal / empty)', () => {
    expect(payoutFraction(100, 0)).toBe(1);
  });

  it('is 0 for a non-positive pledge', () => {
    expect(payoutFraction(0, 500)).toBe(0);
  });
});

describe('splitPrizePayout', () => {
  it('pays the full prize to a top-tier bettor', () => {
    expect(splitPrizePayout(740, 500, 500)).toEqual({ paid: 740, slush: 0 });
  });

  it('caps a cheap bettor and overflows the rest to the slush fund', () => {
    expect(splitPrizePayout(740, 250, 500)).toEqual({ paid: 370, slush: 370 });
  });

  it('rounds the payout and keeps the remainder whole', () => {
    // 1/3 of $100 -> $33 paid, $67 to slush
    expect(splitPrizePayout(100, 100, 300)).toEqual({ paid: 33, slush: 67 });
  });

  it('sends everything to slush for a zero pledge', () => {
    expect(splitPrizePayout(200, 0, 500)).toEqual({ paid: 0, slush: 200 });
  });
});

describe('computeSlushFund', () => {
  it('sums the remainders from every awarded prize', () => {
    const slush = computeSlushFund(
      [
        { gross: 740, winnerBuyIn: 250 }, // 370 to slush
        { gross: 100, winnerBuyIn: 500 }, // 0 to slush
        { gross: 60, winnerBuyIn: 100 }, // 48 to slush
      ],
      500,
    );
    expect(slush).toBe(370 + 0 + 48);
  });

  it('is 0 when everyone is at the top buy-in', () => {
    expect(
      computeSlushFund(
        [
          { gross: 740, winnerBuyIn: 500 },
          { gross: 100, winnerBuyIn: 500 },
        ],
        500,
      ),
    ).toBe(0);
  });

  it('is 0 with no awarded prizes', () => {
    expect(computeSlushFund([], 500)).toBe(0);
  });
});
