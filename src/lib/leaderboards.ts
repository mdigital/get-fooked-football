import { db, schema } from '@/db/client';
import { desc, eq } from 'drizzle-orm';
import { computeTeamScores } from './scoring';
import { avatarFor } from './avatar';
import { displayName } from './display-name';
import { computeSchadenfreude, type CurseInput } from './schadenfreude';
import { formatSurvivedMs, rankPersonalBests, type FlappyScoreRow } from './flappy';
import { oilBarrelsForCode } from './oil';
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
  users: Pick<User, 'id' | 'name' | 'nickname' | 'email' | 'avatarUrl'>[],
  teams: Pick<Team, 'id' | 'code' | 'population' | 'sheep' | 'fifaRank'>[],
  assignments: AssignmentInput[],
  fixtures: Fixture[],
  curses: ReadonlyArray<CurseInput> = [],
  flappyRows: ReadonlyArray<FlappyScoreRow> = [],
): BoardRow[] {
  // Schadenfreude is a parallel scoring path that doesn't share the
  // team-assignment + per-team-points pipeline. Handle it up front.
  if (kind === 'schadenfreude') {
    const points = computeSchadenfreude(fixtures, curses);
    const rows = users.map<BoardRow>((u) => ({
      userId: u.id,
      name: displayName({ name: u.name, nickname: u.nickname }),
      avatarSrc: avatarFor({ email: u.email, avatarUrl: u.avatarUrl ?? null }, 48),
      teamCount: 0,
      points: points.get(u.id) ?? 0,
      weight: 0,
      weightedPoints: points.get(u.id) ?? 0,
    }));
    rows.sort(
      (a, b) => b.weightedPoints - a.weightedPoints || a.name.localeCompare(b.name),
    );
    return rows;
  }

  // Flappy survives in its own table (flappy_scores) — personal-bests only.
  if (kind === 'flappy') {
    const best = rankPersonalBests([...flappyRows]);
    const byUser = new Map(best.map((b) => [b.userId, b] as const));
    const rows = users.map<BoardRow>((u) => {
      const b = byUser.get(u.id);
      const ms = b?.bestMs ?? 0;
      return {
        userId: u.id,
        name: displayName({ name: u.name, nickname: u.nickname }),
        avatarSrc: avatarFor({ email: u.email, avatarUrl: u.avatarUrl ?? null }, 48),
        teamCount: 0,
        points: ms,
        weight: b?.pipesCleared ?? 0,
        weightedPoints: ms,
        displayValue: ms > 0 ? formatSurvivedMs(ms) : '—',
      };
    });
    rows.sort(
      (a, b) =>
        b.weightedPoints - a.weightedPoints ||
        b.weight - a.weight ||
        a.name.localeCompare(b.name),
    );
    return rows;
  }

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
      name: displayName({ name: u.name, nickname: u.nickname }),
      avatarSrc: avatarFor({ email: u.email, avatarUrl: u.avatarUrl ?? null }, 48),
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
    row.teamCount += 1;
    if (kind === 'oil') {
      // Petrostate Cup runs on goals scored, not match points.
      row.points += ts?.gf ?? 0;
      row.weight += oilBarrelsForCode(team.code);
    } else {
      row.points += ts?.points ?? 0;
      if (kind === 'population') row.weight += team.population;
      else if (kind === 'sheep') row.weight += team.sheep;
      else if (kind === 'fifa_underdog') row.weight += team.fifaRank;
    }
  }
  for (const r of rows.values()) {
    if (kind === 'population' || kind === 'sheep' || kind === 'oil') {
      // points × weight, scaled to millions (population, sheep, or barrels).
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
  const [users, teams, assignments, fixtures, curses, flappy] = await Promise.all([
    db.select().from(schema.users),
    db.select().from(schema.teams),
    db.select().from(schema.teamAssignments),
    db.select().from(schema.fixtures),
    // All rows, lifted included — computeSchadenfreude scores each curse only
    // for matches that kicked off while it was active.
    db
      .select({
        userId: schema.teamCurses.userId,
        teamId: schema.teamCurses.teamId,
        scoresFrom: schema.teamCurses.scoresFrom,
        liftedAt: schema.teamCurses.liftedAt,
      })
      .from(schema.teamCurses),
    // Only the flappy board needs these — skip the join cost otherwise.
    kind === 'flappy'
      ? db
          .select({
            userId: schema.flappyScores.userId,
            survivedMs: schema.flappyScores.survivedMs,
            pipesCleared: schema.flappyScores.pipesCleared,
            createdAt: schema.flappyScores.createdAt,
            uid: schema.users.id,
            uname: schema.users.name,
            unick: schema.users.nickname,
            uemail: schema.users.email,
            uavatar: schema.users.avatarUrl,
          })
          .from(schema.flappyScores)
          .leftJoin(schema.users, eq(schema.users.id, schema.flappyScores.userId))
          .orderBy(desc(schema.flappyScores.survivedMs))
          .limit(500)
      : Promise.resolve([] as Array<{
          userId: number;
          survivedMs: number;
          pipesCleared: number;
          createdAt: Date;
          uid: number | null;
          uname: string | null;
          unick: string | null;
          uemail: string | null;
          uavatar: string | null;
        }>),
  ]);
  const flappyRows: FlappyScoreRow[] = flappy
    .filter((r) => r.uname != null)
    .map((r) => ({
      userId: r.userId,
      survivedMs: r.survivedMs,
      pipesCleared: r.pipesCleared,
      createdAt: r.createdAt,
      user: {
        id: r.uid!,
        name: r.uname!,
        nickname: r.unick,
        email: r.uemail,
        avatarUrl: r.uavatar,
      },
    }));
  return computeLeaderboard(kind, users, teams, assignments, fixtures, curses, flappyRows);
}
