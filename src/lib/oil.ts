/**
 * Annual crude-oil production per World Cup 2026 nation, in barrels per year
 * (≈ daily output × 365, rounded). Static reference data — precision doesn't
 * matter for a joke leaderboard. Keyed by the 3-letter team code used in
 * `seed-data.ts`, so this needs no DB column or migration.
 *
 * Source figures are rough recent crude-production estimates. North Sea output
 * is attributed to Scotland because, well, it's funnier that way.
 */
export const OIL_BARRELS_PER_YEAR: Readonly<Record<string, number>> = {
  // Group A
  MEX: 693_000_000,
  RSA: 2_000_000,
  KOR: 0,
  CZE: 0,
  // Group B
  CAN: 1_752_000_000,
  BIH: 0,
  QAT: 475_000_000,
  SUI: 0,
  // Group C
  BRA: 1_241_000_000,
  MAR: 0,
  HAI: 0,
  SCO: 256_000_000,
  // Group D
  USA: 4_700_000_000,
  PAR: 0,
  AUS: 128_000_000,
  TUR: 29_000_000,
  // Group E
  GER: 15_000_000,
  CUW: 0,
  CIV: 11_000_000,
  ECU: 175_000_000,
  // Group F
  NED: 7_000_000,
  JPN: 1_000_000,
  SWE: 0,
  TUN: 15_000_000,
  // Group G
  BEL: 0,
  EGY: 219_000_000,
  IRN: 1_387_000_000,
  NZL: 7_000_000,
  // Group H
  ESP: 500_000,
  CPV: 0,
  KSA: 3_285_000_000,
  URU: 0,
  // Group I
  FRA: 5_000_000,
  SEN: 36_000_000,
  IRQ: 1_570_000_000,
  NOR: 657_000_000,
  // Group J
  ARG: 256_000_000,
  ALG: 511_000_000,
  AUT: 4_000_000,
  JOR: 0,
  // Group K
  POR: 0,
  COD: 7_000_000,
  UZB: 22_000_000,
  COL: 285_000_000,
  // Group L
  ENG: 18_000_000,
  CRO: 4_000_000,
  GHA: 62_000_000,
  PAN: 0,
};

/** Barrels/year for a team code (0 for non-producers / unknown codes). */
export function oilBarrelsForCode(code: string | null | undefined): number {
  if (!code) return 0;
  return OIL_BARRELS_PER_YEAR[code] ?? 0;
}
