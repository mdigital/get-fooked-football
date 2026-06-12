import { describe, expect, it } from 'vitest';
import { mergeResults, parseSportsDbEvents } from '@/lib/thesportsdb';

// A trimmed sample of TheSportsDB's eventsseason.php payload shape.
const SAMPLE = {
  events: [
    {
      idEvent: '2000001',
      strHomeTeam: 'Mexico',
      strAwayTeam: 'South Korea',
      intHomeScore: '3',
      intAwayScore: '1',
      strStatus: 'Match Finished',
      dateEvent: '2026-06-11',
    },
    {
      idEvent: '2000002',
      strHomeTeam: 'USA',
      strAwayTeam: 'Paraguay',
      intHomeScore: null,
      intAwayScore: null,
      strStatus: 'Not Started',
      dateEvent: '2026-06-13',
    },
    {
      // Scores present but blank status — TheSportsDB often does this. We treat
      // it as NOT finished to avoid finalising a live game prematurely.
      idEvent: '2000003',
      strHomeTeam: 'Brazil',
      strAwayTeam: 'Morocco',
      intHomeScore: '2',
      intAwayScore: '0',
      strStatus: '',
      dateEvent: '2026-06-14',
    },
    {
      idEvent: '2000004',
      strHomeTeam: 'France',
      strAwayTeam: 'Senegal',
      intHomeScore: '1',
      intAwayScore: '1',
      strStatus: 'AET',
      dateEvent: '2026-06-17',
    },
  ],
};

describe('parseSportsDbEvents', () => {
  it('parses finished events into normalized results', () => {
    const results = parseSportsDbEvents(SAMPLE);
    const mex = results.find((r) => r.homeName === 'Mexico')!;
    expect(mex).toMatchObject({ homeName: 'Mexico', awayName: 'South Korea', homeScore: 3, awayScore: 1, finished: true });
  });

  it('marks not-started games as unfinished with null scores', () => {
    const results = parseSportsDbEvents(SAMPLE);
    const usa = results.find((r) => r.homeName === 'USA')!;
    expect(usa).toMatchObject({ homeScore: null, awayScore: null, finished: false });
  });

  it('treats blank-status games as unfinished even when scores are present', () => {
    const results = parseSportsDbEvents(SAMPLE);
    const bra = results.find((r) => r.homeName === 'Brazil')!;
    expect(bra.finished).toBe(false);
  });

  it('treats AET / full-time variants as finished', () => {
    const results = parseSportsDbEvents(SAMPLE);
    const fra = results.find((r) => r.homeName === 'France')!;
    expect(fra).toMatchObject({ homeScore: 1, awayScore: 1, finished: true });
  });

  it('handles an empty / null events payload', () => {
    expect(parseSportsDbEvents({ events: null })).toEqual([]);
    expect(parseSportsDbEvents({})).toEqual([]);
    expect(parseSportsDbEvents(null)).toEqual([]);
  });
});

describe('mergeResults', () => {
  const ev = (id: string, finished: boolean): ReturnType<typeof parseSportsDbEvents>[number] => ({
    homeName: 'A', awayName: 'B', homeScore: finished ? 1 : null, awayScore: finished ? 0 : null,
    homePens: null, awayPens: null, finished, sourceId: id,
  });

  it('dedupes by sourceId, preferring the finished version', () => {
    const merged = mergeResults([ev('100', false)], [ev('100', true)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].finished).toBe(true);
  });

  it('keeps entries without a sourceId', () => {
    const noId = { ...ev('x', true), sourceId: undefined };
    expect(mergeResults([noId], [ev('1', true)])).toHaveLength(2);
  });
});
