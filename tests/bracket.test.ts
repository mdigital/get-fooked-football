import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  computeGroupStandings,
  fifaMatchNumber,
  parseBracketLabel,
  planBracketUpdate,
  rankThirdPlaces,
} from '@/lib/bracket';
import { parseFixtures, buildTeamSeeds, parseRankings, formatBracketLabel } from '@/lib/seed-data';
import { makeFixture, makeTeam, finishedGroup } from './helpers/factories';
import type { Fixture, Team } from '@/db/schema';

describe('parseBracketLabel', () => {
  it('parses group seeds', () => {
    expect(parseBracketLabel('Group A — 1st')).toEqual({ kind: 'seed', group: 'A', place: 1 });
    expect(parseBracketLabel('Group L — 2nd')).toEqual({ kind: 'seed', group: 'L', place: 2 });
  });
  it('parses third-place combinations', () => {
    expect(parseBracketLabel('3rd: A/B/C/D/F')).toEqual({ kind: 'third', groups: ['A', 'B', 'C', 'D', 'F'] });
  });
  it('parses winner/loser match references', () => {
    expect(parseBracketLabel('Winner M73')).toEqual({ kind: 'winner', match: 73 });
    expect(parseBracketLabel('Loser M101')).toEqual({ kind: 'loser', match: 101 });
  });
  it('returns null for unknown labels', () => {
    expect(parseBracketLabel('TBD')).toBeNull();
    expect(parseBracketLabel('')).toBeNull();
  });
});

describe('computeGroupStandings', () => {
  // Four teams; P and Q finish level on points, GD and GF, but P won the
  // head-to-head. Q has the better FIFA rank so a rank fallback would order
  // Q first — proving head-to-head is applied before the fallback.
  const P = makeTeam({ id: 1, name: 'P', groupName: 'A', fifaRank: 30 });
  const Q = makeTeam({ id: 2, name: 'Q', groupName: 'A', fifaRank: 5 });
  const R = makeTeam({ id: 3, name: 'R', groupName: 'A', fifaRank: 40 });
  const S = makeTeam({ id: 4, name: 'S', groupName: 'A', fifaRank: 50 });
  const teams = [P, Q, R, S];
  const games = [
    finishedGroup(1, 1, 0, P.id, Q.id), // P beats Q
    finishedGroup(2, 2, 1, P.id, R.id),
    finishedGroup(3, 1, 0, S.id, P.id),
    finishedGroup(4, 2, 1, Q.id, R.id),
    finishedGroup(5, 1, 0, Q.id, S.id),
    finishedGroup(6, 0, 0, R.id, S.id),
  ].map((f) => ({ ...f, groupName: 'A' }));

  it('orders by points, then head-to-head when points/GD/GF are level', () => {
    const standings = computeGroupStandings(games, teams);
    const a = standings.get('A')!;
    expect(a.map((r) => r.teamId)).toEqual([P.id, Q.id, S.id, R.id]);
    expect(a[0].points).toBe(6);
    expect(a[1].points).toBe(6);
    expect(a[0].gd).toBe(a[1].gd);
    expect(a[0].gf).toBe(a[1].gf);
  });

  it('tracks played/won/drawn/lost/gf/ga', () => {
    const standings = computeGroupStandings(games, teams);
    const p = standings.get('A')!.find((r) => r.teamId === P.id)!;
    expect(p).toMatchObject({ played: 3, won: 2, drawn: 0, lost: 1, gf: 3, ga: 2 });
  });

  it('falls back to FIFA rank for a full three-way tie', () => {
    // Rock-paper-scissors cycle + all draw with S: identical on every metric
    // including head-to-head, so FIFA rank (ascending) decides.
    const cyc = [
      finishedGroup(1, 1, 0, P.id, Q.id),
      finishedGroup(2, 1, 0, Q.id, R.id),
      finishedGroup(3, 1, 0, R.id, P.id),
      finishedGroup(4, 0, 0, P.id, S.id),
      finishedGroup(5, 0, 0, Q.id, S.id),
      finishedGroup(6, 0, 0, R.id, S.id),
    ].map((f) => ({ ...f, groupName: 'A' }));
    const a = computeGroupStandings(cyc, teams).get('A')!;
    // P, Q, R all on 4pts, 0 GD, 1 GF; fifaRank order: Q(5) < P(30) < R(40).
    expect(a.map((r) => r.teamId)).toEqual([Q.id, P.id, R.id, S.id]);
  });

  it('ignores unfinished games', () => {
    const partial = [...games.slice(0, 3), makeFixture({ id: 99, stage: 'GROUP', groupName: 'A', homeTeamId: Q.id, awayTeamId: R.id })];
    const a = computeGroupStandings(partial, teams).get('A')!;
    expect(a.find((r) => r.teamId === Q.id)!.played).toBe(1);
  });
});

describe('rankThirdPlaces', () => {
  it('ranks third-placed teams across groups by points/GD/GF', () => {
    const teams = [
      makeTeam({ id: 1, name: 'A1', groupName: 'A' }), makeTeam({ id: 2, name: 'A2', groupName: 'A' }),
      makeTeam({ id: 3, name: 'A3', groupName: 'A' }), makeTeam({ id: 4, name: 'A4', groupName: 'A' }),
      makeTeam({ id: 5, name: 'B1', groupName: 'B' }), makeTeam({ id: 6, name: 'B2', groupName: 'B' }),
      makeTeam({ id: 7, name: 'B3', groupName: 'B' }), makeTeam({ id: 8, name: 'B4', groupName: 'B' }),
    ];
    const fixtures = [
      // Group A: 1>2>3>4 cleanly; third (id 3) ends on 3 points.
      { ...finishedGroup(1, 1, 0, 1, 2), groupName: 'A' }, { ...finishedGroup(2, 2, 0, 1, 3), groupName: 'A' },
      { ...finishedGroup(3, 3, 0, 1, 4), groupName: 'A' }, { ...finishedGroup(4, 1, 0, 2, 3), groupName: 'A' },
      { ...finishedGroup(5, 2, 0, 2, 4), groupName: 'A' }, { ...finishedGroup(6, 1, 0, 3, 4), groupName: 'A' },
      // Group B: third (id 7) also ends on 3 points but with the better GD.
      { ...finishedGroup(7, 1, 0, 5, 6), groupName: 'B' }, { ...finishedGroup(8, 2, 0, 5, 7), groupName: 'B' },
      { ...finishedGroup(9, 3, 0, 5, 8), groupName: 'B' }, { ...finishedGroup(10, 1, 0, 6, 7), groupName: 'B' },
      { ...finishedGroup(11, 2, 0, 6, 8), groupName: 'B' }, { ...finishedGroup(12, 4, 0, 7, 8), groupName: 'B' },
    ];
    const standings = computeGroupStandings(fixtures, teams);
    const thirds = rankThirdPlaces(standings);
    expect(thirds.map((t) => t.teamId)).toEqual([7, 3]);
  });
});

describe('fifaMatchNumber', () => {
  const f = (homeLabel: string, awayLabel: string) =>
    makeFixture({ id: 1, stage: 'R32', homeLabel, awayLabel });
  it('numbers R32 fixtures from their qualifier labels', () => {
    expect(fifaMatchNumber(f('Group A — 2nd', 'Group B — 2nd'))).toBe(73);
    expect(fifaMatchNumber(f('Group E — 1st', '3rd: A/B/C/D/F'))).toBe(74);
    expect(fifaMatchNumber(f('Group K — 1st', '3rd: D/E/I/J/L'))).toBe(87);
  });
  it('numbers later rounds from their winner/loser labels', () => {
    expect(fifaMatchNumber(f('Winner M74', 'Winner M77'))).toBe(89);
    expect(fifaMatchNumber(f('Winner M73', 'Winner M75'))).toBe(90);
    expect(fifaMatchNumber(f('Winner M97', 'Winner M98'))).toBe(101);
    expect(fifaMatchNumber(f('Loser M101', 'Loser M102'))).toBe(103);
    expect(fifaMatchNumber(f('Winner M101', 'Winner M102'))).toBe(104);
  });
  it('returns null for fixtures without bracket labels', () => {
    expect(fifaMatchNumber(makeFixture({ id: 1, stage: 'GROUP' }))).toBeNull();
  });
});

describe('planBracketUpdate', () => {
  it('fills group seeds once the group is complete, and not before', () => {
    const teams = [
      makeTeam({ id: 1, name: 'W', groupName: 'A' }), makeTeam({ id: 2, name: 'X', groupName: 'A' }),
      makeTeam({ id: 3, name: 'Y', groupName: 'A' }), makeTeam({ id: 4, name: 'Z', groupName: 'A' }),
    ];
    const group = [
      { ...finishedGroup(1, 1, 0, 1, 2), groupName: 'A' }, { ...finishedGroup(2, 2, 0, 1, 3), groupName: 'A' },
      { ...finishedGroup(3, 3, 0, 1, 4), groupName: 'A' }, { ...finishedGroup(4, 1, 0, 2, 3), groupName: 'A' },
      { ...finishedGroup(5, 2, 0, 2, 4), groupName: 'A' },
    ];
    const lastGame = makeFixture({ id: 6, stage: 'GROUP', groupName: 'A', homeTeamId: 3, awayTeamId: 4 });
    const r32 = makeFixture({ id: 79, stage: 'R32', homeLabel: 'Group A — 1st', awayLabel: '3rd: C/E/F/H/I' });

    const before = planBracketUpdate([...group, lastGame, r32], teams);
    expect(before.fills).toEqual([]);

    const after = planBracketUpdate(
      [...group, { ...lastGame, homeScore: 1, awayScore: 0, status: 'FINISHED' }, r32],
      teams,
    );
    expect(after.fills).toEqual([
      expect.objectContaining({ fixtureId: 79, side: 'home', teamId: 1 }),
    ]);
  });

  it('propagates knockout winners and losers via FIFA match numbers', () => {
    const teams = [makeTeam({ id: 1, name: 'W' }), makeTeam({ id: 2, name: 'X' }), makeTeam({ id: 3, name: 'Y' }), makeTeam({ id: 4, name: 'Z' })];
    const sf1 = makeFixture({
      id: 201, stage: 'SF', homeLabel: 'Winner M97', awayLabel: 'Winner M98',
      homeTeamId: 1, awayTeamId: 2, homeScore: 2, awayScore: 1, status: 'FINISHED',
    });
    const sf2 = makeFixture({
      id: 202, stage: 'SF', homeLabel: 'Winner M99', awayLabel: 'Winner M100',
      homeTeamId: 3, awayTeamId: 4, homeScore: 0, awayScore: 0, homePens: 3, awayPens: 4, status: 'FINISHED',
    });
    const third = makeFixture({ id: 203, stage: '3RD', homeLabel: 'Loser M101', awayLabel: 'Loser M102' });
    const final = makeFixture({ id: 204, stage: 'FINAL', homeLabel: 'Winner M101', awayLabel: 'Winner M102' });

    const { fills } = planBracketUpdate([sf1, sf2, third, final], teams);
    expect(fills).toContainEqual(expect.objectContaining({ fixtureId: 203, side: 'home', teamId: 2 }));
    expect(fills).toContainEqual(expect.objectContaining({ fixtureId: 203, side: 'away', teamId: 3 }));
    expect(fills).toContainEqual(expect.objectContaining({ fixtureId: 204, side: 'home', teamId: 1 }));
    expect(fills).toContainEqual(expect.objectContaining({ fixtureId: 204, side: 'away', teamId: 4 }));
  });

  it('does not touch slots that already have a team', () => {
    const teams = [makeTeam({ id: 1, name: 'W' }), makeTeam({ id: 2, name: 'X' })];
    const sf = makeFixture({
      id: 201, stage: 'SF', homeLabel: 'Winner M97', awayLabel: 'Winner M98',
      homeTeamId: 1, awayTeamId: 2, homeScore: 2, awayScore: 1, status: 'FINISHED',
    });
    const final = makeFixture({ id: 204, stage: 'FINAL', homeLabel: 'Winner M101', awayLabel: 'Winner M102', homeTeamId: 2 });
    const { fills } = planBracketUpdate([sf, final], teams);
    expect(fills.filter((f) => f.fixtureId === 204 && f.side === 'home')).toEqual([]);
  });
});

describe('full tournament walk over the real fixture data', () => {
  // Deterministic PRNG so the walk is reproducible.
  function mulberry32(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it('resolves every knockout slot from group results through to a champion', () => {
    const fixturesCsv = readFileSync(resolve(__dirname, '../scripts/data/fixtures.csv'), 'utf8');
    const rankingsCsv = readFileSync(resolve(__dirname, '../scripts/data/rankings.csv'), 'utf8');
    const parsed = parseFixtures(fixturesCsv);
    const seeds = buildTeamSeeds(parseRankings(rankingsCsv), parsed);

    const teams: Team[] = seeds.map((t, i) =>
      makeTeam({ id: i + 1, name: t.name, code: t.code, groupName: t.groupName, fifaRank: t.fifaRank }),
    );
    const idByCode = new Map(teams.map((t) => [t.code, t.id] as const));

    const fixtures: Fixture[] = parsed.map((f, i) =>
      makeFixture({
        id: i + 1,
        stage: f.stage,
        groupName: f.groupName ?? null,
        kickoff: f.kickoff,
        homeTeamId: f.homeCode ? idByCode.get(f.homeCode)! : null,
        awayTeamId: f.awayCode ? idByCode.get(f.awayCode)! : null,
        homeLabel: f.homeCode ? null : formatBracketLabel(f.homeRaw),
        awayLabel: f.awayCode ? null : formatBracketLabel(f.awayRaw),
      }),
    );

    const rng = mulberry32(2026);
    const playKoMatch = (f: Fixture) => {
      f.homeScore = Math.floor(rng() * 4);
      f.awayScore = Math.floor(rng() * 4);
      if (f.homeScore === f.awayScore) {
        f.homePens = 3;
        f.awayPens = rng() < 0.5 ? 4 : 2;
      }
      f.status = 'FINISHED';
    };

    // Play the whole group stage.
    for (const f of fixtures.filter((x) => x.stage === 'GROUP')) {
      f.homeScore = Math.floor(rng() * 5);
      f.awayScore = Math.floor(rng() * 5);
      f.status = 'FINISHED';
    }

    // Walk each KO round: plan, apply fills (and first-candidate choices for
    // ambiguous third-place slots), assert the round is fully populated, play it.
    for (const stage of ['R32', 'R16', 'QF', 'SF', '3RD', 'FINAL'] as const) {
      // 3RD resolves alongside FINAL after the semis; plan handles both.
      const plan = planBracketUpdate(fixtures, teams);
      const byId = new Map(fixtures.map((f) => [f.id, f] as const));
      for (const fill of plan.fills) {
        const f = byId.get(fill.fixtureId)!;
        if (fill.side === 'home') f.homeTeamId = fill.teamId;
        else f.awayTeamId = fill.teamId;
      }
      for (const choice of plan.choices) {
        const f = byId.get(choice.fixtureId)!;
        expect(choice.candidateTeamIds.length).toBeGreaterThan(0);
        // Mimic a careful admin: don't pick a third already placed elsewhere.
        const taken = new Set(
          fixtures.filter((x) => x.stage === stage).flatMap((x) => [x.homeTeamId, x.awayTeamId]).filter(Boolean),
        );
        const pick = choice.candidateTeamIds.find((id) => !taken.has(id));
        expect(pick, `no unused candidate for fixture ${choice.fixtureId} ${choice.side}`).toBeDefined();
        if (choice.side === 'home') f.homeTeamId = pick!;
        else f.awayTeamId = pick!;
      }

      const round = fixtures.filter((f) => f.stage === stage);
      const seen = new Set<number>();
      for (const f of round) {
        expect(f.homeTeamId, `${stage} fixture ${f.id} home (${f.homeLabel})`).not.toBeNull();
        expect(f.awayTeamId, `${stage} fixture ${f.id} away (${f.awayLabel})`).not.toBeNull();
        expect(seen.has(f.homeTeamId!)).toBe(false);
        expect(seen.has(f.awayTeamId!)).toBe(false);
        seen.add(f.homeTeamId!);
        seen.add(f.awayTeamId!);
        playKoMatch(f);
      }
    }

    // A champion exists and also won their semi-final.
    const final = fixtures.find((f) => f.stage === 'FINAL')!;
    expect(final.status).toBe('FINISHED');
    const champ = (final.homeScore! > final.awayScore! || (final.homePens ?? 0) > (final.awayPens ?? 0))
      ? final.homeTeamId
      : final.awayTeamId;
    const semis = fixtures.filter((f) => f.stage === 'SF');
    expect(semis.some((f) => f.homeTeamId === champ || f.awayTeamId === champ)).toBe(true);
  });
});
