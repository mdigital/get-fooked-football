import { describe, it, expect } from 'vitest';
import { computeSchadenfreude, SCHADENFREUDE_PER_LOSS, type CurseInput } from '@/lib/schadenfreude';
import { makeFixture } from './helpers/factories';

// Team ids: 1 (home), 2 (away) for most fixtures. Some draws + a final.

const T0 = new Date('2026-06-01T00:00:00Z'); // well before every kickoff
const KICKOFF = new Date('2026-06-15T18:00:00Z');
const BEFORE = new Date('2026-06-15T17:00:00Z');
const AFTER = new Date('2026-06-15T19:00:00Z');

/** A curse active from T0, never lifted — the simple always-on case. */
function curse(userId: number, teamId: number, over: Partial<CurseInput> = {}): CurseInput {
  return { userId, teamId, scoresFrom: T0, liftedAt: null, ...over };
}

function finishedMatch(over: Parameters<typeof makeFixture>[0]) {
  return makeFixture({ kickoff: KICKOFF, status: 'FINISHED', ...over });
}

describe('computeSchadenfreude', () => {
  it('awards +3 to every curser when a cursed team loses', () => {
    const fixtures = [
      finishedMatch({ id: 1, stage: 'GROUP', homeTeamId: 1, awayTeamId: 2, homeScore: 0, awayScore: 2 }),
    ];
    const curses = [
      curse(10, 1), // cursed home, home lost -> +3
      curse(11, 1), // cursed home, home lost -> +3
      curse(12, 2), // cursed away, away won  -> 0
    ];
    const out = computeSchadenfreude(fixtures, curses);
    expect(out.get(10)).toBe(SCHADENFREUDE_PER_LOSS);
    expect(out.get(11)).toBe(SCHADENFREUDE_PER_LOSS);
    expect(out.get(12)).toBeUndefined();
  });

  it('cancels out when a user cursed BOTH teams in the match', () => {
    const fixtures = [
      finishedMatch({ id: 1, stage: 'GROUP', homeTeamId: 1, awayTeamId: 2, homeScore: 0, awayScore: 2 }),
    ];
    const curses = [
      curse(10, 1), // cursed only the loser -> +3
      curse(20, 1), // cursed the loser...
      curse(20, 2), // ...and the winner -> hedged, cancels to 0
    ];
    const out = computeSchadenfreude(fixtures, curses);
    expect(out.get(10)).toBe(SCHADENFREUDE_PER_LOSS);
    expect(out.get(20)).toBeUndefined();
  });

  it('still rewards other matches where the double-curser backed only one side', () => {
    const fixtures = [
      finishedMatch({ id: 1, stage: 'GROUP', homeTeamId: 1, awayTeamId: 2, homeScore: 0, awayScore: 1 }),
      finishedMatch({ id: 2, stage: 'GROUP', homeTeamId: 3, awayTeamId: 4, homeScore: 0, awayScore: 2 }),
    ];
    const curses = [curse(20, 1), curse(20, 2), curse(20, 3)];
    const out = computeSchadenfreude(fixtures, curses);
    expect(out.get(20)).toBe(SCHADENFREUDE_PER_LOSS);
  });

  it('does not award on a draw', () => {
    const fixtures = [
      finishedMatch({ id: 1, stage: 'GROUP', homeTeamId: 1, awayTeamId: 2, homeScore: 1, awayScore: 1 }),
    ];
    expect(computeSchadenfreude(fixtures, [curse(10, 1)]).size).toBe(0);
  });

  it('uses ET / pens to resolve KO losers', () => {
    const fixtures = [
      finishedMatch({
        id: 1, stage: 'R32', homeTeamId: 1, awayTeamId: 2,
        homeScore: 1, awayScore: 1, homeScoreEt: 1, awayScoreEt: 1, homePens: 3, awayPens: 4,
      }),
    ];
    expect(computeSchadenfreude(fixtures, [curse(10, 1)]).get(10)).toBe(SCHADENFREUDE_PER_LOSS);
  });

  it('skips unfinished fixtures', () => {
    const fixtures = [
      makeFixture({ id: 1, stage: 'GROUP', kickoff: KICKOFF, homeTeamId: 1, awayTeamId: 2, homeScore: 3, awayScore: 0, status: 'LIVE' }),
    ];
    expect(computeSchadenfreude(fixtures, [curse(10, 2)]).size).toBe(0);
  });

  it('sums across multiple losses for the same curser', () => {
    const fixtures = [
      finishedMatch({ id: 1, stage: 'GROUP', homeTeamId: 1, awayTeamId: 2, homeScore: 0, awayScore: 1 }),
      finishedMatch({ id: 2, stage: 'GROUP', homeTeamId: 1, awayTeamId: 3, homeScore: 0, awayScore: 2 }),
    ];
    expect(computeSchadenfreude(fixtures, [curse(10, 1)]).get(10)).toBe(2 * SCHADENFREUDE_PER_LOSS);
  });

  it('returns empty when there are no curses / no fixtures', () => {
    const fixtures = [
      finishedMatch({ id: 1, stage: 'GROUP', homeTeamId: 1, awayTeamId: 2, homeScore: 0, awayScore: 2 }),
    ];
    expect(computeSchadenfreude(fixtures, []).size).toBe(0);
    expect(computeSchadenfreude([], [curse(10, 1)]).size).toBe(0);
  });

  // --- curse-state-at-kickoff rules -------------------------------------

  it('retains points for a curse lifted AFTER the match', () => {
    const fixtures = [
      finishedMatch({ id: 1, stage: 'GROUP', homeTeamId: 1, awayTeamId: 2, homeScore: 0, awayScore: 2 }),
    ];
    const out = computeSchadenfreude(fixtures, [curse(10, 1, { liftedAt: AFTER })]);
    expect(out.get(10)).toBe(SCHADENFREUDE_PER_LOSS);
  });

  it('awards nothing for a curse lifted BEFORE kickoff', () => {
    const fixtures = [
      finishedMatch({ id: 1, stage: 'GROUP', homeTeamId: 1, awayTeamId: 2, homeScore: 0, awayScore: 2 }),
    ];
    const out = computeSchadenfreude(fixtures, [curse(10, 1, { liftedAt: BEFORE })]);
    expect(out.size).toBe(0);
  });

  it('awards nothing for a curse cast AFTER kickoff', () => {
    const fixtures = [
      finishedMatch({ id: 1, stage: 'GROUP', homeTeamId: 1, awayTeamId: 2, homeScore: 0, awayScore: 2 }),
    ];
    const out = computeSchadenfreude(fixtures, [curse(10, 1, { scoresFrom: AFTER })]);
    expect(out.size).toBe(0);
  });

  it('a lift-then-recast cycle scores each interval independently', () => {
    const early = finishedMatch({ id: 1, stage: 'GROUP', kickoff: new Date('2026-06-13T18:00:00Z'), homeTeamId: 1, awayTeamId: 2, homeScore: 0, awayScore: 1 });
    const middle = finishedMatch({ id: 2, stage: 'GROUP', kickoff: new Date('2026-06-18T18:00:00Z'), homeTeamId: 1, awayTeamId: 3, homeScore: 0, awayScore: 1 });
    const late = finishedMatch({ id: 3, stage: 'GROUP', kickoff: new Date('2026-06-24T18:00:00Z'), homeTeamId: 1, awayTeamId: 4, homeScore: 0, awayScore: 1 });
    const curses = [
      // Active for the early match only.
      curse(10, 1, { scoresFrom: T0, liftedAt: new Date('2026-06-14T00:00:00Z') }),
      // Re-cast covering the late match only — middle match falls in the gap.
      curse(10, 1, { scoresFrom: new Date('2026-06-20T00:00:00Z'), liftedAt: null }),
    ];
    const out = computeSchadenfreude([early, middle, late], curses);
    expect(out.get(10)).toBe(2 * SCHADENFREUDE_PER_LOSS);
  });

  it('hedge-cancel only applies when BOTH curses were active at kickoff', () => {
    const fixtures = [
      finishedMatch({ id: 1, stage: 'GROUP', homeTeamId: 1, awayTeamId: 2, homeScore: 0, awayScore: 2 }),
    ];
    // Cursed the loser (active) and the winner (lifted before kickoff) — not
    // a hedge at kickoff time, so the loser curse pays out.
    const curses = [curse(20, 1), curse(20, 2, { liftedAt: BEFORE })];
    expect(computeSchadenfreude(fixtures, curses).get(20)).toBe(SCHADENFREUDE_PER_LOSS);
  });

  it('a curse cast exactly at kickoff counts (inclusive start, exclusive lift)', () => {
    const fixtures = [
      finishedMatch({ id: 1, stage: 'GROUP', homeTeamId: 1, awayTeamId: 2, homeScore: 0, awayScore: 2 }),
    ];
    expect(computeSchadenfreude(fixtures, [curse(10, 1, { scoresFrom: KICKOFF })]).get(10)).toBe(SCHADENFREUDE_PER_LOSS);
    expect(computeSchadenfreude(fixtures, [curse(11, 1, { liftedAt: KICKOFF })]).size).toBe(0);
  });

  // --- reconstructed history (cast time lost to the old hard-delete) -----

  it('a reconstructed curse still pays out when the cursed team lost', () => {
    const fixtures = [
      finishedMatch({ id: 1, stage: 'GROUP', homeTeamId: 1, awayTeamId: 2, homeScore: 0, awayScore: 2 }),
    ];
    const out = computeSchadenfreude(fixtures, [curse(10, 1, { liftedAt: AFTER, reconstructed: true })]);
    expect(out.get(10)).toBe(SCHADENFREUDE_PER_LOSS);
  });

  it('a reconstructed curse never hedge-cancels: its cast time is unknown', () => {
    // User 20's curse on the WINNER was rebuilt from the audit log (epoch
    // start, real cast time lost). Give the curser the benefit of the doubt:
    // it does not cancel their live curse on the loser.
    const fixtures = [
      finishedMatch({ id: 1, stage: 'GROUP', homeTeamId: 1, awayTeamId: 2, homeScore: 0, awayScore: 2 }),
    ];
    const curses = [
      curse(20, 1), // live curse on the loser
      curse(20, 2, { liftedAt: AFTER, reconstructed: true }), // rebuilt winner curse
    ];
    expect(computeSchadenfreude(fixtures, curses).get(20)).toBe(SCHADENFREUDE_PER_LOSS);
  });

  it('a real (non-reconstructed) lifted winner curse still hedges as usual', () => {
    const fixtures = [
      finishedMatch({ id: 1, stage: 'GROUP', homeTeamId: 1, awayTeamId: 2, homeScore: 0, awayScore: 2 }),
    ];
    const curses = [curse(20, 1), curse(20, 2, { liftedAt: AFTER })];
    expect(computeSchadenfreude(fixtures, curses).size).toBe(0);
  });
});
