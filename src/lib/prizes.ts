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
