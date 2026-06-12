import { describe, expect, it } from 'vitest';
import {
  buildTeamMatcher,
  planResultSync,
  type ExternalResult,
  type SyncFixture,
} from '@/lib/results-sync';

const TEAMS = [
  { id: 1, code: 'KOR', name: 'Korea Republic' },
  { id: 2, code: 'CZE', name: 'Czechia' },
  { id: 3, code: 'USA', name: 'United States' },
  { id: 4, code: 'TUR', name: 'Türkiye' },
  { id: 5, code: 'CIV', name: "Côte d'Ivoire" },
  { id: 6, code: 'CPV', name: 'Cabo Verde' },
  { id: 7, code: 'COD', name: 'DR Congo' },
  { id: 8, code: 'IRN', name: 'Iran' },
  { id: 9, code: 'BIH', name: 'Bosnia and Herzegovina' },
  { id: 10, code: 'NED', name: 'Netherlands' },
];

describe('buildTeamMatcher', () => {
  const match = buildTeamMatcher(TEAMS);

  it('matches exact names case/diacritic-insensitively', () => {
    expect(match('Czechia')).toBe(2);
    expect(match('türkiye')).toBe(4);
    expect(match('Cote d Ivoire')).toBe(5);
    expect(match('CURAÇAO')).toBeNull(); // not in this team list
  });

  it('matches TheSportsDB-style aliases', () => {
    expect(match('South Korea')).toBe(1);
    expect(match('USA')).toBe(3);
    expect(match('Turkey')).toBe(4);
    expect(match('Ivory Coast')).toBe(5);
    expect(match('Cape Verde')).toBe(6);
    expect(match('Congo DR')).toBe(7);
    expect(match('IR Iran')).toBe(8);
    expect(match('Bosnia-Herzegovina')).toBe(9);
    expect(match('Holland')).toBe(10);
  });

  it('returns null for unknown teams', () => {
    expect(match('Atlantis')).toBeNull();
    expect(match('')).toBeNull();
  });
});

/** Minimal fixture builder for planner tests. */
function fx(over: Partial<SyncFixture> & { id: number }): SyncFixture {
  return {
    id: over.id,
    stage: over.stage ?? 'GROUP',
    status: over.status ?? 'SCHEDULED',
    homeTeamId: 'homeTeamId' in over ? over.homeTeamId! : 1,
    awayTeamId: 'awayTeamId' in over ? over.awayTeamId! : 2,
    homeScore: over.homeScore ?? null,
    awayScore: over.awayScore ?? null,
    homePens: over.homePens ?? null,
    awayPens: over.awayPens ?? null,
  };
}

function ext(over: Partial<ExternalResult>): ExternalResult {
  return {
    homeName: over.homeName ?? 'Korea Republic',
    awayName: over.awayName ?? 'Czechia',
    homeScore: over.homeScore ?? null,
    awayScore: over.awayScore ?? null,
    homePens: over.homePens ?? null,
    awayPens: over.awayPens ?? null,
    finished: over.finished ?? false,
  };
}

describe('planResultSync', () => {
  const base = { teams: TEAMS, humanEditedFixtureIds: new Set<number>() };

  it('updates a finished group game with no prior human edit', () => {
    const { updates, skips } = planResultSync({
      ...base,
      fixtures: [fx({ id: 10, homeTeamId: 1, awayTeamId: 2 })],
      externalResults: [ext({ homeName: 'Korea Republic', awayName: 'Czechia', homeScore: 2, awayScore: 1, finished: true })],
    });
    expect(skips).toEqual([]);
    expect(updates).toEqual([
      { fixtureId: 10, stage: 'GROUP', status: 'FINISHED', homeScore: 2, awayScore: 1, homePens: null, awayPens: null },
    ]);
  });

  it('never touches a fixture a human has edited', () => {
    const { updates, skips } = planResultSync({
      ...base,
      humanEditedFixtureIds: new Set([10]),
      fixtures: [fx({ id: 10, homeTeamId: 1, awayTeamId: 2 })],
      externalResults: [ext({ homeName: 'Korea Republic', awayName: 'Czechia', homeScore: 2, awayScore: 1, finished: true })],
    });
    expect(updates).toEqual([]);
    expect(skips).toEqual([{ fixtureId: 10, reason: 'human-edited' }]);
  });

  it('orients scores to our home/away even if the source lists teams reversed', () => {
    const { updates } = planResultSync({
      ...base,
      fixtures: [fx({ id: 10, homeTeamId: 1, awayTeamId: 2 })],
      // Source has Czechia as home, Korea as away — scores must be flipped back.
      externalResults: [ext({ homeName: 'Czechia', awayName: 'Korea Republic', homeScore: 1, awayScore: 2, finished: true })],
    });
    expect(updates[0]).toMatchObject({ fixtureId: 10, homeScore: 2, awayScore: 1 });
  });

  it('skips when the external match has not finished', () => {
    const { updates, skips } = planResultSync({
      ...base,
      fixtures: [fx({ id: 10 })],
      externalResults: [ext({ homeScore: 1, awayScore: 0, finished: false })],
    });
    expect(updates).toEqual([]);
    expect(skips).toEqual([{ fixtureId: 10, reason: 'not-finished' }]);
  });

  it('skips when no external data matches the fixture', () => {
    const { skips } = planResultSync({
      ...base,
      fixtures: [fx({ id: 10, homeTeamId: 3, awayTeamId: 4 })],
      externalResults: [ext({ homeName: 'Korea Republic', awayName: 'Czechia', homeScore: 1, awayScore: 0, finished: true })],
    });
    expect(skips).toEqual([{ fixtureId: 10, reason: 'no-data' }]);
  });

  it('skips fixtures whose teams are still TBD (knockout not yet drawn)', () => {
    const { skips } = planResultSync({
      ...base,
      fixtures: [fx({ id: 90, stage: 'R16', homeTeamId: null as unknown as number, awayTeamId: null as unknown as number })],
      externalResults: [],
    });
    expect(skips).toEqual([{ fixtureId: 90, reason: 'teams-tbd' }]);
  });

  it('skips re-applying a result that already matches the fixture', () => {
    const { updates, skips } = planResultSync({
      ...base,
      fixtures: [fx({ id: 10, status: 'FINISHED', homeScore: 2, awayScore: 1 })],
      externalResults: [ext({ homeScore: 2, awayScore: 1, finished: true })],
    });
    expect(updates).toEqual([]);
    expect(skips).toEqual([{ fixtureId: 10, reason: 'already-current' }]);
  });

  it('updates a clanker-set result when the external score changes', () => {
    // Fixture already FINISHED (by a previous clanker run, not human) but the
    // online score was corrected afterwards.
    const { updates } = planResultSync({
      ...base,
      fixtures: [fx({ id: 10, status: 'FINISHED', homeScore: 1, awayScore: 1 })],
      externalResults: [ext({ homeScore: 2, awayScore: 1, finished: true })],
    });
    expect(updates[0]).toMatchObject({ fixtureId: 10, homeScore: 2, awayScore: 1 });
  });

  it('carries knockout penalties through when the source provides them', () => {
    const { updates } = planResultSync({
      ...base,
      fixtures: [fx({ id: 73, stage: 'R32', homeTeamId: 1, awayTeamId: 2 })],
      externalResults: [ext({ homeScore: 1, awayScore: 1, homePens: 4, awayPens: 3, finished: true })],
    });
    expect(updates[0]).toMatchObject({ fixtureId: 73, stage: 'R32', homeScore: 1, awayScore: 1, homePens: 4, awayPens: 3 });
  });

  it('flags a drawn knockout game with no penalty data for a human', () => {
    const { updates, skips } = planResultSync({
      ...base,
      fixtures: [fx({ id: 73, stage: 'R32', homeTeamId: 1, awayTeamId: 2 })],
      externalResults: [ext({ homeScore: 1, awayScore: 1, finished: true })],
    });
    expect(updates).toEqual([]);
    expect(skips).toEqual([{ fixtureId: 73, reason: 'needs-pens' }]);
  });

  it('still updates a decisive knockout game without pens', () => {
    const { updates } = planResultSync({
      ...base,
      fixtures: [fx({ id: 73, stage: 'R32', homeTeamId: 1, awayTeamId: 2 })],
      externalResults: [ext({ homeScore: 2, awayScore: 1, finished: true })],
    });
    expect(updates[0]).toMatchObject({ fixtureId: 73, homeScore: 2, awayScore: 1, homePens: null, awayPens: null });
  });
});
