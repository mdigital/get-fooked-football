/**
 * The end-of-tournament payout referendum. Registered users cast an anonymous
 * PAY / NOT ballot; the homepage shows only aggregate percentages (never who
 * voted what), with everyone who hasn't answered counted as its own bucket.
 * Pure — the DB wrapper lives in the server action.
 */

export const PAYOUT_CHOICES = ['PAY', 'NOT'] as const;
export type PayoutChoice = (typeof PAYOUT_CHOICES)[number];

export function validatePayoutChoice(raw: unknown): PayoutChoice | null {
  if (typeof raw !== 'string') return null;
  const upper = raw.trim().toUpperCase();
  return (PAYOUT_CHOICES as readonly string[]).includes(upper) ? (upper as PayoutChoice) : null;
}

export type PayoutVoteInput = { userId: number; choice: PayoutChoice };

export type PayoutTally = {
  eligible: number;
  pay: number;
  not: number;
  noAnswer: number;
  payPct: number;
  notPct: number;
  noAnswerPct: number;
};

/**
 * Integer percentages that always sum to exactly 100 (largest-remainder
 * method; ties go to the earlier bucket). Avoids the classic 33+33+33 bar.
 */
function wholePercents(counts: number[], total: number): number[] {
  if (total <= 0) return counts.map(() => 0);
  const exact = counts.map((c) => (c * 100) / total);
  const floored = exact.map(Math.floor);
  let spare = 100 - floored.reduce((s, n) => s + n, 0);
  const byRemainder = exact
    .map((v, i) => ({ i, rem: v - Math.floor(v) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of byRemainder) {
    if (spare <= 0) break;
    floored[i] += 1;
    spare -= 1;
  }
  return floored;
}

/**
 * Tally the ballot over every registered user. Votes from unknown users are
 * ignored; if a user somehow appears twice, their latest vote wins.
 */
export function tallyPayoutVotes(
  eligibleUserIds: ReadonlyArray<number>,
  votes: ReadonlyArray<PayoutVoteInput>,
): PayoutTally {
  const eligible = new Set(eligibleUserIds);
  const byUser = new Map<number, PayoutChoice>();
  for (const v of votes) {
    if (eligible.has(v.userId)) byUser.set(v.userId, v.choice);
  }
  let pay = 0;
  let not = 0;
  for (const choice of byUser.values()) {
    if (choice === 'PAY') pay += 1;
    else not += 1;
  }
  const noAnswer = eligible.size - pay - not;
  const [payPct, notPct, noAnswerPct] = wholePercents([pay, not, noAnswer], eligible.size);
  return { eligible: eligible.size, pay, not, noAnswer, payPct, notPct, noAnswerPct };
}
