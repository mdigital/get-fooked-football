import { db, schema } from '@/db/client';
import { computeTeamScores } from './scoring';
import type { Fixture, Team, User } from '@/db/schema';

export { BOARD_META } from './leaderboards-types';
export type { BoardKey, BoardRow } from './leaderboards-types';
import type { BoardKey, BoardRow } from './leaderboards-types';

export type AssignmentInput = { teamId: number; userId: number | null; isLeftover: boolean };

/**
 * Pure leaderboard computation. No DB. Easy to unit-test.
 */
export function computeLeaderboard(
  kind: BoardKey,
  users: Pick<User, 'id' | 'name' | 'email' | 'avatarUrl'>[],
  teams: Pick<Team, 'id' | 'population' | 'sheep' | 'fifaRank'>[],
  assignments: AssignmentInput[],
  fixtures: Fixture[],
): BoardRow[] {
  const filteredFixtures =
    kind === 'group_only'
      ? fixtures.filter((f) => f.stage === 'GROUP')
      : kind === 'ko_only'
        ? fixtures.filter((f) => f.stage !== 'GROUP')
        : fixtures;

  const teamScores = computeTeamScores(filteredFixtures, teams as Team[]);
  const teamById = new Map(teams.map((t) => [t.id, t] as const));
  const userById = new Map(users.map((u) => [u.id, u] as const));

  const rows = new Map<number, BoardRow>();
  for (const u of users) {
    rows.set(u.id, {
      userId: u.id,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatarUrl ?? null,
      teamCount: 0,
      points: 0,
      weight: 0,
      weightedPoints: 0,
    });
  }
  for (const a of assignments) {
    if (a.userId == null || a.isLeftover) continue;
    const team = teamById.get(a.teamId);
    if (!team) continue;
    const row = rows.get(a.userId);
    if (!row) continue;
    const ts = teamScores.get(a.teamId);
    row.points += ts?.points ?? 0;
    row.teamCount += 1;
    if (kind === 'population') row.weight += team.population;
    else if (kind === 'sheep') row.weight += team.sheep;
    else if (kind === 'fifa_underdog') row.weight += team.fifaRank;
  }
  for (const r of rows.values()) {
    if (kind === 'population' || kind === 'sheep') {
      r.weightedPoints = Math.round((r.points * r.weight) / 1_000_000);
    } else if (kind === 'fifa_underdog') {
      const avg = r.teamCount > 0 ? r.weight / r.teamCount : 0;
      r.weightedPoints = Math.round(r.points * avg);
    } else {
      r.weightedPoints = r.points;
    }
  }
  const arr = Array.from(rows.values()).filter((r) => userById.get(r.userId));
  arr.sort((a, b) => b.weightedPoints - a.weightedPoints || b.points - a.points || a.name.localeCompare(b.name));
  return arr;
}

export async function buildLeaderboard(kind: BoardKey): Promise<BoardRow[]> {
  const [users, teams, assignments, fixtures] = await Promise.all([
    db.select().from(schema.users),
    db.select().from(schema.teams),
    db.select().from(schema.teamAssignments),
    db.select().from(schema.fixtures),
  ]);
  return computeLeaderboard(kind, users, teams, assignments, fixtures);
}
