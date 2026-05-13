import { describe, it, expect } from 'vitest';
import { prizePotShare, totalAllocatedPct } from '@/lib/prizes';

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
