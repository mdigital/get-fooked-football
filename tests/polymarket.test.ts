import { describe, it, expect } from 'vitest';
import { parsePolyEvent } from '@/lib/polymarket';

describe('parsePolyEvent', () => {
  const raw = [
    {
      title: '2026 World Cup Winner',
      slug: 'fifa-world-cup-2026-winner',
      endDate: '2026-07-19T00:00:00Z',
      volumeNum: 1234567,
      markets: [
        {
          id: '1',
          slug: 'will-spain-win',
          groupItemTitle: 'Spain',
          icon: 'spain.png',
          outcomePrices: '["0.22","0.78"]', // JSON-encoded string, as Gamma sends
          clobTokenIds: '["tok-spain-yes","tok-spain-no"]',
          volumeNum: 500,
        },
        {
          id: '2',
          slug: 'will-brazil-win',
          groupItemTitle: 'Brazil',
          outcomePrices: ['0.18', '0.82'], // already an array
          clobTokenIds: ['tok-brazil-yes'],
          volume: '300',
        },
      ],
    },
  ];

  it('sorts outcomes by yes price descending', () => {
    const ev = parsePolyEvent(raw);
    expect(ev.outcomes.map((o) => o.name)).toEqual(['Spain', 'Brazil']);
  });

  it('parses JSON-encoded price/token strings and plain arrays alike', () => {
    const ev = parsePolyEvent(raw);
    const spain = ev.outcomes.find((o) => o.name === 'Spain')!;
    expect(spain.yesPrice).toBeCloseTo(0.22);
    expect(spain.noPrice).toBeCloseTo(0.78);
    expect(spain.yesTokenId).toBe('tok-spain-yes');
    expect(spain.volume).toBe(500);
  });

  it('derives noPrice as 1 - yes when missing', () => {
    const ev = parsePolyEvent([
      { title: 't', slug: 's', markets: [{ id: '1', slug: 'm', groupItemTitle: 'X', outcomePrices: '["0.3"]' }] },
    ]);
    expect(ev.outcomes[0].noPrice).toBeCloseTo(0.7);
  });

  it('falls back through groupItemTitle → question → slug for the name', () => {
    const ev = parsePolyEvent([
      { title: 't', slug: 's', markets: [{ id: '1', slug: 'fallback-slug' }] },
    ]);
    expect(ev.outcomes[0].name).toBe('fallback-slug');
  });

  it('reads top-level volume + endDate', () => {
    const ev = parsePolyEvent(raw);
    expect(ev.totalVolume).toBe(1234567);
    expect(ev.endDate).toBe('2026-07-19T00:00:00Z');
  });

  it('throws a helpful error on an empty payload', () => {
    expect(() => parsePolyEvent([])).toThrow(/No Polymarket event/);
  });
});
