/**
 * Pure name matcher for mapping Polymarket outcome names to our team rows.
 * Polymarket uses a mix of common forms ("United States", "South Korea") and
 * occasionally diacritics ("Türkiye"); our DB stores canonical names. We
 * normalize both sides and use an alias map for the well-known divergences.
 */

type TeamLike = { id: number; code: string; name: string };

// Normalized aliases: { polymarketNormalised: ourTeamNormalised }
const ALIASES: Record<string, string> = {
  usa: 'united states',
  us: 'united states',
  'korea republic': 'south korea',
  'republic of korea': 'south korea',
  turkey: 'turkiye',
  'ivory coast': "cote divoire",
  'democratic republic of the congo': 'dr congo',
  drc: 'dr congo',
  'congo dr': 'dr congo',
  'iran islamic republic': 'iran',
};

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchPolymarketName<T extends TeamLike>(polyName: string, teams: T[]): T | null {
  const norm = normalize(polyName);
  const target = ALIASES[norm] ?? norm;
  // Exact normalized match against our team list.
  for (const t of teams) {
    if (normalize(t.name) === target) return t;
  }
  // Try the alias map in reverse — our DB might already hold the canonical
  // form ("DR Congo") while polymarket sent the long form.
  for (const t of teams) {
    const nName = normalize(t.name);
    if (ALIASES[target] === nName) return t;
  }
  // Final fallback: 3-letter code (some polymarket sub-markets use them).
  if (target.length === 3) {
    const upper = polyName.toUpperCase().trim();
    return teams.find((t) => t.code === upper) ?? null;
  }
  return null;
}
