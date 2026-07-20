/**
 * End-of-tournament winners table. Resolves each prize to a winner:
 * an explicit admin award wins outright; otherwise board-linked prizes fall
 * back to the final board leader (unofficial until awarded), INSWAP falls
 * back to the photo-league leader, and judgment prizes stay TBD.
 * Pure — the homepage widget feeds it boards + DB rows.
 */

import { prizePotShare, splitPrizePayout } from './prizes';

export type WrapUpPrize = {
  id: number;
  name: string;
  /** Share of the pot, 0..100. */
  pctOfPot: number;
  category: string;
  boardKey: string | null;
  awardedUserId: number | null;
};

export type WinnersRow = {
  prizeId: number;
  prizeName: string;
  pctOfPot: number;
  winnerUserId: number | null;
  winnerName: string | null;
  /** What the winner actually pockets (buy-in capped); gross while unresolved. */
  amount: number;
  /** True only when an admin has formally awarded it. */
  official: boolean;
};

export function buildWinnersTable(
  prizes: ReadonlyArray<WrapUpPrize>,
  opts: {
    pot: number;
    topBuyIn: number;
    buyInByUserId: ReadonlyMap<number, number>;
    nameByUserId: ReadonlyMap<number, string>;
    /** boardKey -> userId of that board's final leader. */
    leaderByBoard: ReadonlyMap<string, number>;
    inswapLeaderUserId?: number | null;
  },
): WinnersRow[] {
  return prizes.map((p) => {
    const winnerUserId =
      p.awardedUserId ??
      (p.boardKey != null ? opts.leaderByBoard.get(p.boardKey) ?? null : null) ??
      (p.category === 'INSWAP' ? opts.inswapLeaderUserId ?? null : null);
    const gross = prizePotShare(p.pctOfPot, opts.pot);
    const amount =
      winnerUserId != null
        ? splitPrizePayout(gross, opts.buyInByUserId.get(winnerUserId) ?? 0, opts.topBuyIn).paid
        : gross;
    return {
      prizeId: p.id,
      prizeName: p.name,
      pctOfPot: p.pctOfPot,
      winnerUserId,
      winnerName: winnerUserId != null ? opts.nameByUserId.get(winnerUserId) ?? null : null,
      amount,
      official: p.awardedUserId != null,
    };
  });
}

/** Take-home totals per resolved winner, biggest haul first (name breaks ties). */
export function totalsByWinner(rows: ReadonlyArray<WinnersRow>): Array<{ userId: number; name: string; total: number }> {
  const totals = new Map<number, { userId: number; name: string; total: number }>();
  for (const r of rows) {
    if (r.winnerUserId == null || r.winnerName == null) continue;
    const t = totals.get(r.winnerUserId) ?? { userId: r.winnerUserId, name: r.winnerName, total: 0 };
    t.total += r.amount;
    totals.set(r.winnerUserId, t);
  }
  return Array.from(totals.values()).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}
