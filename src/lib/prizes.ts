/**
 * Pure prize-math helpers. Storing prize amounts as percentages of the pot
 * means the actual NZD value scales with the number of paying players —
 * the league doesn't need to be re-priced every time someone joins.
 */

export function prizePotShare(pctOfPot: number, totalPotNzd: number): number {
  if (pctOfPot < 0) throw new Error('Prize percentage cannot be negative');
  if (pctOfPot > 100) throw new Error('Prize percentage cannot exceed 100');
  return Math.round((pctOfPot / 100) * totalPotNzd);
}

export function totalAllocatedPct(prizes: Array<{ pctOfPot: number }>): number {
  return prizes.reduce((s, p) => s + p.pctOfPot, 0);
}

/**
 * How much of a prize a winner is actually allowed to collect. The crew picks
 * their own buy-in, so the person who pledged the most sets the bar at 100% and
 * anyone who pledged less is capped pro-rata to their pledge — cheap out on the
 * buy-in, cheap out on the winnings. Clamped to [0, 1].
 */
export function payoutFraction(buyIn: number, topBuyIn: number): number {
  if (!Number.isFinite(buyIn) || buyIn <= 0) return 0;
  // No reference pledge yet (empty group, or everyone on zero): pay in full.
  if (!Number.isFinite(topBuyIn) || topBuyIn <= 0) return 1;
  return Math.min(1, buyIn / topBuyIn);
}

/**
 * Split a gross prize into the amount the winner actually pockets and the
 * remainder that overflows into the slush fund. The remainder is whatever the
 * cap leaves on the table, kept whole so paid + slush === gross.
 */
export function splitPrizePayout(
  gross: number,
  buyIn: number,
  topBuyIn: number,
): { paid: number; slush: number } {
  const paid = Math.round(gross * payoutFraction(buyIn, topBuyIn));
  return { paid, slush: gross - paid };
}

/**
 * Total slush fund: the sum of every capped-off remainder across all the prizes
 * that have actually been awarded. Grows each time a cheap bettor takes a prize.
 */
export function computeSlushFund(
  awardedPrizes: Array<{ gross: number; winnerBuyIn: number }>,
  topBuyIn: number,
): number {
  return awardedPrizes.reduce(
    (sum, p) => sum + splitPrizePayout(p.gross, p.winnerBuyIn, topBuyIn).slush,
    0,
  );
}
