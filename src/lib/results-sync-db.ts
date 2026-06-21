/**
 * DB-aware orchestration for the "clanker" auto-update feature. Thin wrapper
 * over the pure `planResultSync`: read fixtures/teams/edit-history, fetch the
 * online results, apply each planned update as a clanker-attributed score edit,
 * and log one audit summary as clanker.
 */
import { db, schema } from '@/db/client';
import { isNotNull } from 'drizzle-orm';
import { submitScoreEdit } from './score-edits';
import { logAudit } from './audit';
import { fetchWorldCupResults } from './thesportsdb';
import { planResultSync, type ExternalResult, type SkipReason } from './results-sync';

export const CLANKER = 'clanker';

export type ResultsSyncSummary = {
  updated: number;
  skipped: Record<SkipReason, number>;
  /** Fixtures actually changed, for the admin flash. */
  changedFixtureIds: number[];
};

function emptySkips(): Record<SkipReason, number> {
  return { 'human-edited': 0, 'teams-tbd': 0, 'no-data': 0, 'not-finished': 0, 'needs-pens': 0, 'already-current': 0 };
}

/**
 * Run a sync. `fetchResults` is injectable so the DB path can be exercised
 * with a fixed feed in tests; defaults to the live TheSportsDB fetch.
 */
export async function runResultsSync(
  fetchResults: () => Promise<ExternalResult[]> = fetchWorldCupResults,
): Promise<ResultsSyncSummary> {
  const [teams, fixtures, edited] = await Promise.all([
    db.select({ id: schema.teams.id, code: schema.teams.code, name: schema.teams.name }).from(schema.teams),
    db.select().from(schema.fixtures),
    // Distinct fixtures with at least one HUMAN edit (userId not null).
    db
      .selectDistinct({ fixtureId: schema.scoreEdits.fixtureId })
      .from(schema.scoreEdits)
      .where(isNotNull(schema.scoreEdits.userId)),
  ]);

  const externalResults = await fetchResults();
  const humanEditedFixtureIds = new Set(edited.map((e) => e.fixtureId));

  const { updates, skips } = planResultSync({
    fixtures: fixtures.map((f) => ({
      id: f.id,
      stage: f.stage,
      status: f.status,
      kickoff: f.kickoff,
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
      homeScore: f.homeScore,
      awayScore: f.awayScore,
      homePens: f.homePens,
      awayPens: f.awayPens,
    })),
    teams,
    externalResults,
    humanEditedFixtureIds,
  });

  const changedFixtureIds: number[] = [];
  for (const u of updates) {
    await submitScoreEdit({
      fixtureId: u.fixtureId,
      editorName: CLANKER,
      stage: u.stage,
      status: u.status,
      homeScore: u.homeScore,
      awayScore: u.awayScore,
      homePens: u.homePens,
      awayPens: u.awayPens,
      note: 'auto-updated from TheSportsDB',
    });
    changedFixtureIds.push(u.fixtureId);
  }

  const skipped = emptySkips();
  for (const s of skips) skipped[s.reason] += 1;

  await logAudit({
    actorName: CLANKER,
    kind: 'results.sync',
    detail: `updated ${updates.length}; needs-pens ${skipped['needs-pens']}; protected ${skipped['human-edited']}`,
  });

  return { updated: updates.length, skipped, changedFixtureIds };
}
