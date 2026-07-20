import { describe, it, expect } from 'vitest';
import { buildWinnersTable, totalsByWinner, type WrapUpPrize } from '@/lib/wrap-up';

const NAMES = new Map([
  [1, 'Robin'],
  [2, 'Dan'],
  [3, 'Nick'],
  [4, 'Liam'],
]);
const EVEN_BUY_INS = new Map([
  [1, 100],
  [2, 100],
  [3, 100],
  [4, 100],
]);

function prize(over: Partial<WrapUpPrize> & Pick<WrapUpPrize, 'id' | 'name' | 'pctOfPot'>): WrapUpPrize {
  return { category: 'SPECIAL', boardKey: null, awardedUserId: null, ...over };
}

const BASE_OPTS = {
  pot: 600,
  topBuyIn: 100,
  buyInByUserId: EVEN_BUY_INS,
  nameByUserId: NAMES,
  leaderByBoard: new Map([
    ['overall', 4],
    ['sheep', 1],
  ]),
  inswapLeaderUserId: 3,
};

describe('buildWinnersTable', () => {
  it('resolves a board-linked prize to the board leader', () => {
    const rows = buildWinnersTable(
      [prize({ id: 11, name: 'The Big One', pctOfPot: 50, category: 'GRAND', boardKey: 'overall' })],
      BASE_OPTS,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].winnerUserId).toBe(4);
    expect(rows[0].winnerName).toBe('Liam');
    expect(rows[0].amount).toBe(300); // 50% of $600
    expect(rows[0].official).toBe(false);
  });

  it('an explicit award beats the board leader and is marked official', () => {
    const rows = buildWinnersTable(
      [prize({ id: 11, name: 'The Big One', pctOfPot: 50, boardKey: 'overall', awardedUserId: 2 })],
      BASE_OPTS,
    );
    expect(rows[0].winnerUserId).toBe(2);
    expect(rows[0].winnerName).toBe('Dan');
    expect(rows[0].official).toBe(true);
  });

  it('resolves an INSWAP prize to the inswap leader', () => {
    const rows = buildWinnersTable(
      [prize({ id: 16, name: 'The InSwap League', pctOfPot: 6, category: 'INSWAP' })],
      BASE_OPTS,
    );
    expect(rows[0].winnerUserId).toBe(3);
    expect(rows[0].amount).toBe(36);
  });

  it('leaves a judgment prize unresolved (TBD) with its gross amount', () => {
    const rows = buildWinnersTable(
      [prize({ id: 18, name: 'Cinderella Cup', pctOfPot: 4 })],
      BASE_OPTS,
    );
    expect(rows[0].winnerUserId).toBeNull();
    expect(rows[0].winnerName).toBeNull();
    expect(rows[0].amount).toBe(24);
    expect(rows[0].official).toBe(false);
  });

  it("caps a cheap winner's amount by their buy-in share", () => {
    const rows = buildWinnersTable(
      [prize({ id: 11, name: 'The Big One', pctOfPot: 10, boardKey: 'overall' })],
      { ...BASE_OPTS, buyInByUserId: new Map([[4, 50]]), topBuyIn: 100 },
    );
    expect(rows[0].amount).toBe(30); // $60 gross, halved by the 50/100 pledge cap
  });

  it('keeps the given prize order', () => {
    const rows = buildWinnersTable(
      [
        prize({ id: 11, name: 'The Big One', pctOfPot: 50, boardKey: 'overall' }),
        prize({ id: 14, name: 'The Wool Cup', pctOfPot: 6, boardKey: 'sheep' }),
      ],
      BASE_OPTS,
    );
    expect(rows.map((r) => r.prizeId)).toEqual([11, 14]);
  });
});

describe('totalsByWinner', () => {
  it('aggregates resolved rows per winner, biggest haul first', () => {
    const rows = buildWinnersTable(
      [
        prize({ id: 11, name: 'The Big One', pctOfPot: 50, boardKey: 'overall' }), // Liam $300
        prize({ id: 14, name: 'The Wool Cup', pctOfPot: 6, boardKey: 'sheep' }), // Robin $36
        prize({ id: 13, name: 'Best Knockout Stage', pctOfPot: 8, boardKey: 'ko_only' }), // no leader -> TBD
        prize({ id: 16, name: 'The InSwap League', pctOfPot: 6, category: 'INSWAP' }), // Nick $36
        prize({ id: 21, name: 'Underdog Cup', pctOfPot: 2, boardKey: 'overall' }), // Liam $12
      ],
      BASE_OPTS,
    );
    const totals = totalsByWinner(rows);
    expect(totals).toEqual([
      { userId: 4, name: 'Liam', total: 312 },
      { userId: 3, name: 'Nick', total: 36 },
      { userId: 1, name: 'Robin', total: 36 },
    ]);
  });
});
