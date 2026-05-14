/**
 * Pure helpers for the konami-code Flappy Bird easter egg leaderboard.
 *
 * Each crash inserts a row into `flappy_scores` with the user, survival
 * milliseconds, and pipes cleared. The leaderboard shows one row per user
 * (their personal best), sorted by survival time descending.
 */

import type { Nameable } from './display-name';

/** Format an integer ms duration as a 2dp seconds string ("5.42s"). */
export function formatSurvivedMs(ms: number): string {
  const safe = Number.isFinite(ms) && ms >= 0 ? ms : 0;
  return `${(safe / 1000).toFixed(2)}s`;
}

export type FlappyScoreRow = {
  userId: number;
  survivedMs: number;
  pipesCleared: number;
  createdAt: Date;
  user: Nameable & { id: number; email?: string | null; avatarUrl?: string | null };
};

export type FlappyBoardRow = {
  userId: number;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  bestMs: number;
  pipesCleared: number;
  /** When this personal-best run was set. */
  when: Date;
};

/**
 * Dedupe to one row per user (their best run), sort by survival ms desc,
 * tiebreak by pipesCleared desc then earliest run.
 */
export function rankPersonalBests(rows: FlappyScoreRow[]): FlappyBoardRow[] {
  const bestByUser = new Map<number, FlappyScoreRow>();
  for (const r of rows) {
    const current = bestByUser.get(r.userId);
    if (!current) {
      bestByUser.set(r.userId, r);
      continue;
    }
    if (isBetter(r, current)) bestByUser.set(r.userId, r);
  }
  const out: FlappyBoardRow[] = [];
  for (const r of bestByUser.values()) {
    out.push({
      userId: r.userId,
      displayName: r.user.name + (r.user.nickname ? ` "${r.user.nickname}"` : ''),
      email: r.user.email ?? '',
      avatarUrl: r.user.avatarUrl ?? null,
      bestMs: r.survivedMs,
      pipesCleared: r.pipesCleared,
      when: r.createdAt,
    });
  }
  out.sort(
    (a, b) =>
      b.bestMs - a.bestMs ||
      b.pipesCleared - a.pipesCleared ||
      a.when.getTime() - b.when.getTime(),
  );
  return out;
}

function isBetter(a: FlappyScoreRow, b: FlappyScoreRow): boolean {
  if (a.survivedMs !== b.survivedMs) return a.survivedMs > b.survivedMs;
  if (a.pipesCleared !== b.pipesCleared) return a.pipesCleared > b.pipesCleared;
  return a.createdAt.getTime() < b.createdAt.getTime();
}
