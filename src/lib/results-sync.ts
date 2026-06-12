/**
 * Pure logic for the admin "auto-update results" feature ("clanker").
 *
 * Given the fixtures, the teams, a set of external results pulled from an
 * online source, and the set of fixtures a human has already edited, decide
 * which fixtures to update and which to skip (and why). The DB wrapper in
 * `results-sync-db.ts` does the fetching and applies these decisions.
 *
 * Rules:
 *  - A fixture a human has touched is NEVER overwritten.
 *  - Scores are oriented to OUR home/away by team identity, not the source's.
 *  - A drawn knockout game with no penalty data is flagged for a human rather
 *    than written as an invalid (would-be-rejected) score.
 *  - A result that already matches the fixture is a no-op (no churn).
 */

/** Lowercase, strip diacritics, drop everything but a–z/0–9. */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Aliases the online source uses that don't normalize to our team name.
 * Keyed by normalized alias → our team code.
 */
const ALIAS_TO_CODE: Record<string, string> = {
  southkorea: 'KOR',
  korea: 'KOR',
  korearep: 'KOR',
  usa: 'USA',
  unitedstatesofamerica: 'USA',
  turkey: 'TUR',
  czechrepublic: 'CZE',
  iriran: 'IRN',
  islamicrepublicofiran: 'IRN',
  ivorycoast: 'CIV',
  capeverde: 'CPV',
  capeverdeislands: 'CPV',
  congodr: 'COD',
  drcongo: 'COD',
  democraticrepublicofthecongo: 'COD',
  congodemocraticrepublic: 'COD',
  bosnia: 'BIH',
  bosniaherzegovina: 'BIH',
  holland: 'NED',
  southafrica: 'RSA',
  saudiarabia: 'KSA',
  curacao: 'CUW',
  newzealand: 'NZL',
};

/**
 * Build a matcher from an external team name to our team id. Tries the team's
 * own name and code first, then the alias table.
 */
export function buildTeamMatcher(teams: { id: number; code: string; name: string }[]): (name: string) => number | null {
  const byNorm = new Map<string, number>();
  const idByCode = new Map<string, number>();
  for (const t of teams) {
    idByCode.set(t.code.toUpperCase(), t.id);
    byNorm.set(normalize(t.name), t.id);
    byNorm.set(normalize(t.code), t.id);
  }
  for (const [alias, code] of Object.entries(ALIAS_TO_CODE)) {
    const id = idByCode.get(code);
    if (id != null && !byNorm.has(alias)) byNorm.set(alias, id);
  }
  return (name: string) => {
    if (!name) return null;
    return byNorm.get(normalize(name)) ?? null;
  };
}

export type ExternalResult = {
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
  homePens?: number | null;
  awayPens?: number | null;
  finished: boolean;
  /** Opaque id from the source, for logging/debug. */
  sourceId?: string;
};

export type SyncFixture = {
  id: number;
  stage: string;
  status: string;
  homeTeamId: number | null;
  awayTeamId: number | null;
  homeScore: number | null;
  awayScore: number | null;
  homePens: number | null;
  awayPens: number | null;
};

export type SyncUpdate = {
  fixtureId: number;
  stage: string;
  status: 'FINISHED';
  homeScore: number;
  awayScore: number;
  homePens: number | null;
  awayPens: number | null;
};

export type SkipReason =
  | 'human-edited'
  | 'teams-tbd'
  | 'no-data'
  | 'not-finished'
  | 'needs-pens'
  | 'already-current';

export type SyncSkip = { fixtureId: number; reason: SkipReason };

/** Unordered team-pair key so source/fixture home-away order doesn't matter. */
function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function planResultSync(args: {
  fixtures: SyncFixture[];
  teams: { id: number; code: string; name: string }[];
  externalResults: ExternalResult[];
  humanEditedFixtureIds: Set<number>;
}): { updates: SyncUpdate[]; skips: SyncSkip[] } {
  const match = buildTeamMatcher(args.teams);

  // Index external results by unordered team pair, keeping the resolved ids so
  // we can orient scores to whichever side is our home team.
  type Resolved = { homeId: number; awayId: number; r: ExternalResult };
  const byPair = new Map<string, Resolved>();
  for (const r of args.externalResults) {
    const homeId = match(r.homeName);
    const awayId = match(r.awayName);
    if (homeId == null || awayId == null || homeId === awayId) continue;
    byPair.set(pairKey(homeId, awayId), { homeId, awayId, r });
  }

  const updates: SyncUpdate[] = [];
  const skips: SyncSkip[] = [];

  for (const f of args.fixtures) {
    if (f.homeTeamId == null || f.awayTeamId == null) {
      skips.push({ fixtureId: f.id, reason: 'teams-tbd' });
      continue;
    }
    if (args.humanEditedFixtureIds.has(f.id)) {
      skips.push({ fixtureId: f.id, reason: 'human-edited' });
      continue;
    }
    const found = byPair.get(pairKey(f.homeTeamId, f.awayTeamId));
    if (!found) {
      skips.push({ fixtureId: f.id, reason: 'no-data' });
      continue;
    }
    if (!found.r.finished || found.r.homeScore == null || found.r.awayScore == null) {
      skips.push({ fixtureId: f.id, reason: 'not-finished' });
      continue;
    }

    // Orient the source scores onto our home/away by team identity.
    const sourceHomeIsOurHome = found.homeId === f.homeTeamId;
    const homeScore = sourceHomeIsOurHome ? found.r.homeScore : found.r.awayScore;
    const awayScore = sourceHomeIsOurHome ? found.r.awayScore : found.r.homeScore;
    const homePens = (sourceHomeIsOurHome ? found.r.homePens : found.r.awayPens) ?? null;
    const awayPens = (sourceHomeIsOurHome ? found.r.awayPens : found.r.homePens) ?? null;

    // Drawn knockout game with no decisive pens — leave for a human.
    if (f.stage !== 'GROUP' && homeScore === awayScore) {
      if (homePens == null || awayPens == null || homePens === awayPens) {
        skips.push({ fixtureId: f.id, reason: 'needs-pens' });
        continue;
      }
    }

    const samePens = (f.homePens ?? null) === homePens && (f.awayPens ?? null) === awayPens;
    if (f.status === 'FINISHED' && f.homeScore === homeScore && f.awayScore === awayScore && samePens) {
      skips.push({ fixtureId: f.id, reason: 'already-current' });
      continue;
    }

    updates.push({
      fixtureId: f.id,
      stage: f.stage,
      status: 'FINISHED',
      homeScore,
      awayScore,
      homePens,
      awayPens,
    });
  }

  return { updates, skips };
}
