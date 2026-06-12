import { describe, it, expect } from 'vitest';
import { computeSchadenfreude, SCHADENFREUDE_PER_LOSS } from '@/lib/schadenfreude';
import { makeFixture } from './helpers/factories';

// Team ids: 1 (home), 2 (away) for most fixtures. Some draws + a final.

describe('computeSchadenfreude', () => {
  it('awards +3 to every curser when a cursed team loses', () => {
    const fixtures = [
      makeFixture({ id: 1, stage: 'GROUP', homeTeamId: 1, awayTeamId: 2, homeScore: 0, awayScore: 2, status: 'FINISHED' }),
    ];
    const curses = [
      { userId: 10, teamId: 1 }, // cursed home, home lost -> +3
      { userId: 11, teamId: 1 }, // cursed home, home lost -> +3
      { userId: 12, teamId: 2 }, // cursed away, away won  -> 0
    ];
    const out = computeSchadenfreude(fixtures, curses);
    expect(out.get(10)).toBe(SCHADENFREUDE_PER_LOSS);
    expect(out.get(11)).toBe(SCHADENFREUDE_PER_LOSS);
    expect(out.get(12)).toBeUndefined();
  });

  it('cancels out when a user cursed BOTH teams in the match', () => {
    const fixtures = [
      makeFixture({ id: 1, stage: 'GROUP', homeTeamId: 1, awayTeamId: 2, homeScore: 0, awayScore: 2, status: 'FINISHED' }),
    ];
    const curses = [
      { userId: 10, teamId: 1 }, // cursed only the loser -> +3
      { userId: 20, teamId: 1 }, // cursed the loser...
      { userId: 20, teamId: 2 }, // ...and the winner -> hedged, cancels to 0
    ];
    const out = computeSchadenfreude(fixtures, curses);
    expect(out.get(10)).toBe(SCHADENFREUDE_PER_LOSS);
    expect(out.get(20)).toBeUndefined();
  });

  it('still rewards other matches where the double-curser backed only one side', () => {
    const fixtures = [
      // Match A: user 20 cursed both teams -> cancels.
      makeFixture({ id: 1, stage: 'GROUP', homeTeamId: 1, awayTeamId: 2, homeScore: 0, awayScore: 1, status: 'FINISHED' }),
      // Match B: user 20 cursed only team 3, which loses -> +3.
      makeFixture({ id: 2, stage: 'GROUP', homeTeamId: 3, awayTeamId: 4, homeScore: 0, awayScore: 2, status: 'FINISHED' }),
    ];
    const curses = [
      { userId: 20, teamId: 1 },
      { userId: 20, teamId: 2 },
      { userId: 20, teamId: 3 },
    ];
    const out = computeSchadenfreude(fixtures, curses);
    expect(out.get(20)).toBe(SCHADENFREUDE_PER_LOSS);
  });

  it('does not award on a draw', () => {
    const fixtures = [
      makeFixture({ id: 1, stage: 'GROUP', homeTeamId: 1, awayTeamId: 2, homeScore: 1, awayScore: 1, status: 'FINISHED' }),
    ];
    const out = computeSchadenfreude(fixtures, [{ userId: 10, teamId: 1 }]);
    expect(out.size).toBe(0);
  });

  it('uses ET / pens to resolve KO losers', () => {
    // ET tied 1-1, pens 4-3 away — so home loses on pens.
    const fixtures = [
      makeFixture({
        id: 1,
        stage: 'R32',
        homeTeamId: 1,
        awayTeamId: 2,
        homeScore: 1,
        awayScore: 1,
        homeScoreEt: 1,
        awayScoreEt: 1,
        homePens: 3,
        awayPens: 4,
        status: 'FINISHED',
      }),
    ];
    const out = computeSchadenfreude(fixtures, [{ userId: 10, teamId: 1 }]);
    expect(out.get(10)).toBe(SCHADENFREUDE_PER_LOSS);
  });

  it('skips unfinished fixtures', () => {
    const fixtures = [
      makeFixture({ id: 1, stage: 'GROUP', homeTeamId: 1, awayTeamId: 2, homeScore: 3, awayScore: 0, status: 'LIVE' }),
    ];
    const out = computeSchadenfreude(fixtures, [{ userId: 10, teamId: 2 }]);
    expect(out.size).toBe(0);
  });

  it('sums across multiple losses for the same curser', () => {
    const fixtures = [
      makeFixture({ id: 1, stage: 'GROUP', homeTeamId: 1, awayTeamId: 2, homeScore: 0, awayScore: 1, status: 'FINISHED' }),
      makeFixture({ id: 2, stage: 'GROUP', homeTeamId: 1, awayTeamId: 3, homeScore: 0, awayScore: 2, status: 'FINISHED' }),
    ];
    const out = computeSchadenfreude(fixtures, [{ userId: 10, teamId: 1 }]);
    expect(out.get(10)).toBe(2 * SCHADENFREUDE_PER_LOSS);
  });

  it('returns empty when there are no curses', () => {
    const fixtures = [
      makeFixture({ id: 1, stage: 'GROUP', homeTeamId: 1, awayTeamId: 2, homeScore: 0, awayScore: 2, status: 'FINISHED' }),
    ];
    expect(computeSchadenfreude(fixtures, []).size).toBe(0);
  });

  it('returns empty when no fixtures finished', () => {
    expect(computeSchadenfreude([], [{ userId: 10, teamId: 1 }]).size).toBe(0);
  });
});
