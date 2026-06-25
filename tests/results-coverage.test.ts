import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTeamMatcher, planResultSync, type SyncFixture } from '@/lib/results-sync';
import { parseSportsDbEvents } from '@/lib/thesportsdb';
import { parseFixtures, parseRankings, buildTeamSeeds } from '@/lib/seed-data';

/** Build the real 48 teams + 72 group fixtures from the seed CSVs (no DB). */
function loadSeed() {
  const dir = resolve(__dirname, '../scripts/data');
  const parsed = parseFixtures(readFileSync(resolve(dir, 'fixtures.csv'), 'utf8'));
  const seeds = buildTeamSeeds(parseRankings(readFileSync(resolve(dir, 'rankings.csv'), 'utf8')), parsed);
  const teams = seeds.map((t, i) => ({ id: i + 1, code: t.code, name: t.name }));
  const idByCode = new Map(teams.map((t) => [t.code, t.id] as const));
  const groupFixtures: SyncFixture[] = parsed
    .filter((f) => f.stage === 'GROUP' && f.homeCode && f.awayCode)
    .map((f, i) => ({
      id: i + 1,
      stage: 'GROUP',
      status: 'SCHEDULED',
      kickoff: f.kickoff,
      homeTeamId: idByCode.get(f.homeCode!)!,
      awayTeamId: idByCode.get(f.awayCode!)!,
      homeScore: null,
      awayScore: null,
      homePens: null,
      awayPens: null,
    }));
  return { teams, groupFixtures, idByCode };
}

/**
 * TheSportsDB's name for every one of our 48 teams. The 14 marked //feed are
 * confirmed from the live snapshot (tests/fixtures/thesportsdb-rounds.json);
 * the rest follow TheSportsDB's national-team naming. If TheSportsDB renames a
 * team, this table is where the failing assertion will point.
 */
const TSDB_NAME: Record<string, string> = {
  ALG: 'Algeria', ARG: 'Argentina', AUS: 'Australia', AUT: 'Austria', BEL: 'Belgium',
  BIH: 'Bosnia-Herzegovina', // feed
  BRA: 'Brazil', // feed
  CAN: 'Canada', // feed
  CIV: 'Ivory Coast', COD: 'DR Congo', COL: 'Colombia', CPV: 'Cape Verde',
  CRO: 'Croatia', CUW: 'Curaçao',
  CZE: 'Czech Republic', // feed
  ECU: 'Ecuador', EGY: 'Egypt', ENG: 'England', ESP: 'Spain', FRA: 'France',
  GER: 'Germany', GHA: 'Ghana',
  HAI: 'Haiti', // feed
  IRN: 'Iran', IRQ: 'Iraq', JOR: 'Jordan', JPN: 'Japan',
  KOR: 'South Korea', // feed
  KSA: 'Saudi Arabia',
  MAR: 'Morocco', // feed
  MEX: 'Mexico', // feed
  NED: 'Netherlands', NOR: 'Norway', NZL: 'New Zealand', PAN: 'Panama',
  PAR: 'Paraguay', // feed
  POR: 'Portugal',
  QAT: 'Qatar', // feed
  RSA: 'South Africa', // feed
  SCO: 'Scotland', // feed
  SEN: 'Senegal',
  SUI: 'Switzerland', // feed
  SWE: 'Sweden', TUN: 'Tunisia', TUR: 'Turkey', URU: 'Uruguay',
  USA: 'USA', // feed
  UZB: 'Uzbekistan',
};

describe('team matcher covers every World Cup team', () => {
  const { teams } = loadSeed();
  const match = buildTeamMatcher(teams);
  const idByCode = new Map(teams.map((t) => [t.code, t.id] as const));

  it('has a TheSportsDB name mapping for all 48 teams', () => {
    expect(teams).toHaveLength(48);
    for (const t of teams) {
      expect(TSDB_NAME[t.code], `missing TheSportsDB name for ${t.code} (${t.name})`).toBeDefined();
    }
  });

  it('resolves the TheSportsDB name of every team back to that team', () => {
    const unresolved: string[] = [];
    for (const t of teams) {
      const got = match(TSDB_NAME[t.code]);
      if (got !== idByCode.get(t.code)) unresolved.push(`${t.code} "${TSDB_NAME[t.code]}" -> ${got}`);
    }
    expect(unresolved, `these TheSportsDB names did not match our team`).toEqual([]);
  });

  it('handles the specific aliases that diverge from our names', () => {
    const cases: [string, string][] = [
      ['South Korea', 'KOR'], ['South Africa', 'RSA'], ['USA', 'USA'],
      ['Czech Republic', 'CZE'], ['Ivory Coast', 'CIV'], ['Cape Verde', 'CPV'],
      ['Bosnia-Herzegovina', 'BIH'], ['Turkey', 'TUR'], ['DR Congo', 'COD'],
    ];
    for (const [name, code] of cases) {
      expect(match(name), `${name} should map to ${code}`).toBe(idByCode.get(code));
    }
  });
});

describe('every real TheSportsDB result auto-enters against the seed fixtures', () => {
  const { teams, groupFixtures } = loadSeed();
  const snapshot = JSON.parse(
    readFileSync(resolve(__dirname, 'fixtures/thesportsdb-rounds.json'), 'utf8'),
  );
  const externalResults = parseSportsDbEvents(snapshot);
  // Fixed clock well after every group game, so the run is deterministic.
  const NOW = new Date('2026-08-01T00:00:00Z').getTime();

  it('parses all 15 captured events as finished', () => {
    expect(externalResults).toHaveLength(15);
    expect(externalResults.every((r) => r.finished)).toBe(true);
  });

  it('produces an update for every game in the feed (the other fixtures are simply absent from the source)', () => {
    const { updates, skips } = planResultSync({
      fixtures: groupFixtures,
      teams,
      externalResults,
      humanEditedFixtureIds: new Set(),
      now: NOW,
    });
    // All 15 finished feed games turn into updates — if any team name failed to
    // match, that game would be missing and this count would drop.
    expect(updates).toHaveLength(15);
    // The remaining 57 group fixtures aren't in TheSportsDB's partial free feed.
    expect(skips.filter((s) => s.reason === 'no-data')).toHaveLength(groupFixtures.length - 15);
  });

  it('auto-enters "South Africa vs South Korea" with correctly oriented score', () => {
    // The fixture the user reported. Our fixture is RSA(home) vs KOR(away);
    // the feed lists it the same way, 1-0.
    const { teams: t, groupFixtures: fxs } = loadSeed();
    const idByCode = new Map(t.map((x) => [x.code, x.id] as const));
    const rsaKor = fxs.find(
      (f) => f.homeTeamId === idByCode.get('RSA') && f.awayTeamId === idByCode.get('KOR'),
    )!;
    const { updates } = planResultSync({
      fixtures: [rsaKor],
      teams: t,
      externalResults,
      humanEditedFixtureIds: new Set(),
      now: NOW,
    });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ fixtureId: rsaKor.id, homeScore: 1, awayScore: 0, status: 'FINISHED' });
  });

  it('still protects any of those games once a human has edited them', () => {
    // Pick the fixture matching the first feed game and mark it human-edited.
    const idByCode = new Map(teams.map((x) => [x.code, x.id] as const));
    const mexRsa = groupFixtures.find(
      (f) => f.homeTeamId === idByCode.get('MEX') && f.awayTeamId === idByCode.get('RSA'),
    )!;
    const { updates, skips } = planResultSync({
      fixtures: groupFixtures,
      teams,
      externalResults,
      humanEditedFixtureIds: new Set([mexRsa.id]),
      now: NOW,
    });
    expect(updates.find((u) => u.fixtureId === mexRsa.id)).toBeUndefined();
    expect(skips).toContainEqual({ fixtureId: mexRsa.id, reason: 'human-edited' });
  });
});
