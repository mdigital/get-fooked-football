import { describe, it, expect } from 'vitest';
import { OIL_BARRELS_PER_YEAR, oilBarrelsForCode } from '@/lib/oil';
import { TEAM_META } from '@/lib/seed-data';

describe('oilBarrelsForCode', () => {
  it('returns the barrels for a known producer', () => {
    expect(oilBarrelsForCode('USA')).toBe(4_700_000_000);
    expect(oilBarrelsForCode('KSA')).toBe(3_285_000_000);
  });

  it('returns 0 for a non-producer', () => {
    expect(oilBarrelsForCode('KOR')).toBe(0);
  });

  it('returns 0 for an unknown or empty code', () => {
    expect(oilBarrelsForCode('XYZ')).toBe(0);
    expect(oilBarrelsForCode(null)).toBe(0);
    expect(oilBarrelsForCode(undefined)).toBe(0);
  });

  it('has an entry for every World Cup team (no team falls through to 0 by accident)', () => {
    for (const t of TEAM_META) {
      expect(OIL_BARRELS_PER_YEAR, `missing oil entry for ${t.code} (${t.name})`).toHaveProperty(t.code);
    }
  });
});
