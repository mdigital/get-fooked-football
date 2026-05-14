/**
 * Pure helpers for the variable-buy-in pot model. The crew pledges different
 * amounts so it works for everyone, and the prize pool is the sum of pledges.
 */

export const BUY_IN_MIN = 20;
export const BUY_IN_MAX = 500;
export const BUY_IN_DEFAULT = 100;
/** Step the slider snaps to (and what we round/validate against). */
export const BUY_IN_STEP = 5;

export type BuyInValidation =
  | { ok: true; value: number }
  | { ok: false; reason: 'not-a-number' | 'too-low' | 'too-high' };

/**
 * Validate + clamp a raw input from the onboarding form. Snaps to the nearest
 * BUY_IN_STEP (so a slider can pretend it's continuous) and rejects values
 * outside the allowed range.
 */
export function validateBuyIn(raw: unknown): BuyInValidation {
  if (raw === undefined || raw === null) return { ok: false, reason: 'not-a-number' };
  let n: number;
  if (typeof raw === 'number') {
    n = raw;
  } else {
    const s = String(raw).trim();
    if (s === '') return { ok: false, reason: 'not-a-number' };
    n = Number(s);
  }
  if (!Number.isFinite(n)) return { ok: false, reason: 'not-a-number' };
  const snapped = Math.round(n / BUY_IN_STEP) * BUY_IN_STEP;
  if (snapped < BUY_IN_MIN) return { ok: false, reason: 'too-low' };
  if (snapped > BUY_IN_MAX) return { ok: false, reason: 'too-high' };
  return { ok: true, value: snapped };
}

/** Sum each user's pledge to get the total pot. */
export function computePot(users: Array<{ buyIn: number | string | null | undefined }>): number {
  let total = 0;
  for (const u of users) {
    const n = typeof u.buyIn === 'number' ? u.buyIn : Number(u.buyIn ?? 0);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}
