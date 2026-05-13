/**
 * Small data-factories so individual tests don't drown in setup boilerplate.
 * Everything here returns plain objects matching the Drizzle schema types,
 * which is enough for the *pure* logic tests (scoring, leaderboards, draw).
 */
import type { Fixture, Team, User } from '@/db/schema';

export function makeTeam(over: Partial<Team> & { id: number; name: string }): Team {
  return {
    id: over.id,
    code: over.code ?? over.name.slice(0, 3).toUpperCase(),
    name: over.name,
    flag: over.flag ?? '🏳️',
    groupName: over.groupName ?? 'A',
    fifaRank: over.fifaRank ?? 50,
    population: over.population ?? 10_000_000,
    sheep: over.sheep ?? 0,
    polymarketPrice: over.polymarketPrice ?? '0',
    stats: (over.stats ?? {}) as Team['stats'],
  };
}

export function makeUser(over: Partial<User> & { id: number; name: string }): User {
  return {
    id: over.id,
    email: over.email ?? `${over.name.toLowerCase()}@example.com`,
    name: over.name,
    passwordHash: over.passwordHash ?? 'fake-hash',
    isAdmin: over.isAdmin ?? false,
    paid: over.paid ?? false,
    createdAt: over.createdAt ?? new Date('2026-05-01T00:00:00Z'),
  };
}

export function makeFixture(over: Partial<Fixture> & { id: number; stage: string }): Fixture {
  return {
    id: over.id,
    kickoff: over.kickoff ?? new Date('2026-06-11T18:00:00Z'),
    stage: over.stage,
    groupName: over.groupName ?? null,
    venue: over.venue ?? null,
    homeTeamId: over.homeTeamId ?? null,
    awayTeamId: over.awayTeamId ?? null,
    homeLabel: over.homeLabel ?? null,
    awayLabel: over.awayLabel ?? null,
    homeScore: over.homeScore ?? null,
    awayScore: over.awayScore ?? null,
    homeScoreEt: over.homeScoreEt ?? null,
    awayScoreEt: over.awayScoreEt ?? null,
    homePens: over.homePens ?? null,
    awayPens: over.awayPens ?? null,
    status: over.status ?? 'SCHEDULED',
  };
}

export function finishedGroup(id: number, h: number, a: number, homeTeamId: number, awayTeamId: number): Fixture {
  return makeFixture({ id, stage: 'GROUP', homeTeamId, awayTeamId, homeScore: h, awayScore: a, status: 'FINISHED' });
}
