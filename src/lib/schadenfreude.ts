/**
 * Schadenfreude scoring — the troll side-board.
 *
 * Anyone can cast a curse on any team. Every fixture where a cursed team
 * *loses* (group draws don't count) gives the curser +3. Pure function, no
 * DB, easy to unit-test alongside the existing scoring code.
 *
 * Cancel-out rule: a curse only counts if you backed one side of a match. If
 * you cursed *both* teams in a fixture you were hedging, so they cancel and you
 * score nothing for that match — even though one of them necessarily lost.
 */
import type { Fixture } from '@/db/schema';
import { winnerSide } from './scoring';

export const SCHADENFREUDE_PER_LOSS = 3;

export type CurseInput = { userId: number; teamId: number };

/**
 * Returns userId -> total schadenfreude points across the supplied fixtures
 * and curses. Only FINISHED fixtures with both team ids set contribute.
 */
export function computeSchadenfreude(
  fixtures: Pick<
    Fixture,
    | 'stage'
    | 'status'
    | 'homeTeamId'
    | 'awayTeamId'
    | 'homeScore'
    | 'awayScore'
    | 'homeScoreEt'
    | 'awayScoreEt'
    | 'homePens'
    | 'awayPens'
  >[],
  curses: ReadonlyArray<CurseInput>,
): Map<number, number> {
  const cursersByTeam = new Map<number, number[]>();
  for (const c of curses) {
    const arr = cursersByTeam.get(c.teamId) ?? [];
    arr.push(c.userId);
    cursersByTeam.set(c.teamId, arr);
  }

  const out = new Map<number, number>();
  for (const f of fixtures) {
    if (f.status !== 'FINISHED' || f.homeTeamId == null || f.awayTeamId == null) continue;
    const side = winnerSide(f as Fixture);
    if (side === 'draw') continue;
    const loserTeamId = side === 'home' ? f.awayTeamId : f.homeTeamId;
    const winnerTeamId = side === 'home' ? f.homeTeamId : f.awayTeamId;
    const loserCursers = cursersByTeam.get(loserTeamId);
    if (!loserCursers || loserCursers.length === 0) continue;
    // Anyone who also cursed the winning team hedged this match — cancel them out.
    const winnerCursers = new Set(cursersByTeam.get(winnerTeamId) ?? []);
    for (const uid of loserCursers) {
      if (winnerCursers.has(uid)) continue;
      out.set(uid, (out.get(uid) ?? 0) + SCHADENFREUDE_PER_LOSS);
    }
  }
  return out;
}
