/**
 * TheSportsDB results feed for the 2026 World Cup.
 *
 * Keyless free tier (test key "3"). We fetch the season's events for the World
 * Cup league and normalize them into `ExternalResult`s for the pure sync
 * planner. No auth, cached briefly so re-runs don't thrash their API.
 *
 * Defaults are env-overridable in case TheSportsDB's ids/season label differ:
 *   THESPORTSDB_KEY        (default "3")
 *   THESPORTSDB_LEAGUE_ID  (default "4429" — FIFA World Cup)
 *   THESPORTSDB_SEASON     (default "2026")
 */
import type { ExternalResult } from './results-sync';

const KEY = process.env.THESPORTSDB_KEY || '3';
const LEAGUE_ID = process.env.THESPORTSDB_LEAGUE_ID || '4429';
const SEASON = process.env.THESPORTSDB_SEASON || '2026';

/** Status strings that mean the match is over and the score is final. */
const FINISHED_RE = /(match\s*finished|full\s*time|^ft$|after\s*extra|^aet$|after\s*pen|^pen$|^fin)/i;

function toIntOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Parse a TheSportsDB events payload into normalized results.
 *
 * Conservative on "finished": only an explicit finished-status string counts.
 * TheSportsDB frequently leaves `strStatus` blank even when scores are filled,
 * and we'd rather skip those (admin can finish them) than finalise a live game.
 */
export function parseSportsDbEvents(json: unknown): ExternalResult[] {
  const events = (json as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) return [];
  const out: ExternalResult[] = [];
  for (const e of events as Record<string, unknown>[]) {
    const homeName = typeof e.strHomeTeam === 'string' ? e.strHomeTeam : '';
    const awayName = typeof e.strAwayTeam === 'string' ? e.strAwayTeam : '';
    if (!homeName || !awayName) continue;
    const status = typeof e.strStatus === 'string' ? e.strStatus : '';
    const homeScore = toIntOrNull(e.intHomeScore);
    const awayScore = toIntOrNull(e.intAwayScore);
    const finished = FINISHED_RE.test(status.trim()) && homeScore != null && awayScore != null;
    out.push({
      homeName,
      awayName,
      homeScore,
      awayScore,
      homePens: toIntOrNull(e.intHomeScorePenalty),
      awayPens: toIntOrNull(e.intAwayScorePenalty),
      finished,
      sourceId: typeof e.idEvent === 'string' ? e.idEvent : undefined,
    });
  }
  return out;
}

async function fetchEvents(path: string): Promise<ExternalResult[]> {
  const url = `https://www.thesportsdb.com/api/v1/json/${KEY}/${path}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`TheSportsDB ${res.status} ${res.statusText}`);
  return parseSportsDbEvents(await res.json());
}

/**
 * Merge two result lists, deduping by sourceId. The free `eventsseason`
 * endpoint only returns a rolling ~15-game window, so we also pull
 * `eventspastleague` (recently finished). On a clash we keep the finished
 * version, since the past-league feed is the authoritative final.
 */
export function mergeResults(...lists: ExternalResult[][]): ExternalResult[] {
  const byId = new Map<string, ExternalResult>();
  const anon: ExternalResult[] = [];
  for (const r of lists.flat()) {
    if (!r.sourceId) {
      anon.push(r);
      continue;
    }
    const existing = byId.get(r.sourceId);
    if (!existing || (r.finished && !existing.finished)) byId.set(r.sourceId, r);
  }
  return [...byId.values(), ...anon];
}

let cache: { at: number; results: ExternalResult[] } | null = null;
const TTL_MS = 60_000;

/** Fetch and normalize the World Cup season's results. Cached for 60s. */
export async function fetchWorldCupResults(now = Date.now()): Promise<ExternalResult[]> {
  if (cache && now - cache.at < TTL_MS) return cache.results;
  const [season, past] = await Promise.all([
    fetchEvents(`eventsseason.php?id=${LEAGUE_ID}&s=${SEASON}`),
    // Recently-finished games that may have scrolled out of the season window.
    fetchEvents(`eventspastleague.php?id=${LEAGUE_ID}`).catch(() => [] as ExternalResult[]),
  ]);
  const results = mergeResults(season, past);
  cache = { at: now, results };
  return results;
}

/** Test hook. */
export function __clearCache() {
  cache = null;
}
