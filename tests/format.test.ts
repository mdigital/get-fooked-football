import { describe, it, expect } from 'vitest';
import { fmtNzDateTime, fmtNzTime, fmtNzDay, nzZoneAbbr } from '@/lib/format';

describe('NZ date formatters', () => {
  // 2026-06-11 18:00 UTC = 2026-06-12 06:00 NZST (UTC+12 in winter)
  const wcKickoff = new Date('2026-06-11T18:00:00Z');
  // 2026-12-15 03:00 UTC = 2026-12-15 16:00 NZDT (UTC+13 in summer)
  const summer = new Date('2026-12-15T03:00:00Z');

  it('fmtNzTime converts UTC to NZ wall-clock time', () => {
    // 18:00 UTC + 12h = 06:00 NZST. Format may use "6:00" or "06:00" depending on
    // the engine; assert it doesn't say 18:00.
    const out = fmtNzTime(wcKickoff);
    expect(out).not.toMatch(/18:?00/);
    expect(out).toMatch(/06|6:00/);
  });

  it('fmtNzDateTime includes a weekday + month + day + time', () => {
    const out = fmtNzDateTime(wcKickoff);
    expect(out).toMatch(/Fri|Friday/i);
    expect(out).toMatch(/Jun/);
    expect(out).toMatch(/12/);
  });

  it('nzZoneAbbr is NZST in June, NZDT in December', () => {
    expect(nzZoneAbbr(wcKickoff)).toBe('NZST');
    expect(nzZoneAbbr(summer)).toBe('NZDT');
  });

  it('fmtNzDay returns the day in NZ', () => {
    const out = fmtNzDay(wcKickoff);
    expect(out).toMatch(/Jun/);
    expect(out).toMatch(/12/);
  });
});
