/**
 * Schadenfreude scoring — the troll side-board.
 *
 * Anyone can cast a curse on any team. Every fixture where a cursed team
 * *loses* (group draws don't count) gives the curser +3. Pure function, no
 * DB, easy to unit-test alongside the existing scoring code.
 *
 * A curse only pays for a match if it was ACTIVE AT KICKOFF: cast at or
 * before kickoff (`scoresFrom <= kickoff`) and not yet lifted
 * (`liftedAt == null || kickoff < liftedAt`). Lifting a curse keeps the
 * points already banked from earlier matches; casting one never scores
 * matches that already kicked off. (Curses that predate this rule are
 * grandfathered by the migration setting scoresFrom to the epoch.)
 *
 * Cancel-out rule: a curse only counts if you backed one side of a match. If
 * you cursed *both* teams in a fixture — both active at kickoff — you were
 * hedging, so they cancel and you score nothing for that match.
 */
import type { Fixture } from '@/db/schema';
import { winnerSide } from './scoring';

export const SCHADENFREUDE_PER_LOSS = 3;

export type CurseInput = {
  userId: number;
  teamId: number;
  /** When the curse starts paying out (cast time; epoch for grandfathered rows). */
  scoresFrom: Date;
  /** When the curse was lifted, or null while still active. */
  liftedAt: Date | null;
  /**
   * True for rows rebuilt from the audit log after the old hard-delete lift —
   * their real cast time is lost. They still pay out on the loser side
   * (grandfathered from the epoch) but never hedge-cancel: we can't prove the
   * curse was active at kickoff, so the curser gets the benefit of the doubt.
   */
  reconstructed?: boolean;
};

function activeAt(c: CurseInput, at: Date): boolean {
  return c.scoresFrom.getTime() <= at.getTime() && (c.liftedAt == null || at.getTime() < c.liftedAt.getTime());
}

/**
 * Returns userId -> total schadenfreude points across the supplied fixtures
 * and curse intervals. Only FINISHED fixtures with both team ids set
 * contribute, and only curses active at that fixture's kickoff.
 */
export function computeSchadenfreude(
  fixtures: Pick<
    Fixture,
    | 'stage'
    | 'status'
    | 'kickoff'
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
  const cursesByTeam = new Map<number, CurseInput[]>();
  for (const c of curses) {
    const arr = cursesByTeam.get(c.teamId) ?? [];
    arr.push(c);
    cursesByTeam.set(c.teamId, arr);
  }

  const out = new Map<number, number>();
  for (const f of fixtures) {
    if (f.status !== 'FINISHED' || f.homeTeamId == null || f.awayTeamId == null) continue;
    const side = winnerSide(f as Fixture);
    if (side === 'draw') continue;
    const loserTeamId = side === 'home' ? f.awayTeamId : f.homeTeamId;
    const winnerTeamId = side === 'home' ? f.homeTeamId : f.awayTeamId;

    const loserCursers = new Set(
      (cursesByTeam.get(loserTeamId) ?? []).filter((c) => activeAt(c, f.kickoff)).map((c) => c.userId),
    );
    if (loserCursers.size === 0) continue;
    // Anyone whose curse on the WINNER was also active at kickoff hedged this
    // match — cancel them out. Reconstructed rows never hedge (cast unknown).
    const winnerCursers = new Set(
      (cursesByTeam.get(winnerTeamId) ?? [])
        .filter((c) => !c.reconstructed && activeAt(c, f.kickoff))
        .map((c) => c.userId),
    );
    for (const uid of loserCursers) {
      if (winnerCursers.has(uid)) continue;
      out.set(uid, (out.get(uid) ?? 0) + SCHADENFREUDE_PER_LOSS);
    }
  }
  return out;
}
