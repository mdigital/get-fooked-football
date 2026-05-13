import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { fetchEvent } from '@/lib/polymarket';
import { matchPolymarketName } from '@/lib/polymarket-match';
import { planPreferenceDraw, type DrawPlayer, type DrawTeam } from '@/lib/preference-draw';
import { mulberry32 } from '@/lib/draw';

/**
 * DB-aware wrapper around planPreferenceDraw. Loads players + preferences +
 * teams, runs the pure planner, then writes assignments.
 *
 * Replaces any existing draw — same semantics as the old runRandomDraw.
 */
export async function runPreferenceDraw(seed?: number): Promise<ReturnType<typeof planPreferenceDraw>> {
  const [users, teams, prefs] = await Promise.all([
    db.select().from(schema.users),
    db.select().from(schema.teams),
    db.select().from(schema.teamPreferences),
  ]);

  const prefsByUser = new Map<number, number[]>();
  for (const p of prefs) {
    const arr = prefsByUser.get(p.userId) ?? [];
    arr[p.rank - 1] = p.teamId;
    prefsByUser.set(p.userId, arr);
  }

  const players: DrawPlayer[] = users.map((u) => ({
    id: u.id,
    preferences: (prefsByUser.get(u.id) ?? []).filter((x): x is number => typeof x === 'number'),
  }));
  const drawTeams: DrawTeam[] = teams.map((t) => ({ id: t.id, polymarketPrice: t.polymarketPrice }));

  const rng = seed != null ? mulberry32(seed) : Math.random;
  const result = planPreferenceDraw({ teams: drawTeams, players, rng });

  await db.transaction(async (tx) => {
    await tx.delete(schema.teamAssignments);
    if (result.assignments.length > 0) {
      await tx.insert(schema.teamAssignments).values(
        result.assignments.map((a) => ({
          teamId: a.teamId,
          userId: a.userId,
          isLeftover: a.isLeftover,
        })),
      );
    }
  });

  return result;
}

/**
 * Hit Polymarket's Gamma API for the World Cup event, then write each
 * sub-market's "yes" price onto the matching team row.
 *
 * Returns a summary of matched/unmatched names so the admin UI can flag any
 * teams that didn't get a price (usually means a name typo or Polymarket has
 * dropped the team from the event).
 */
export async function syncPolymarketPrices() {
  const [event, dbTeams] = await Promise.all([
    fetchEvent(true),
    db.select().from(schema.teams),
  ]);

  const matched: { teamId: number; teamName: string; polyName: string; price: number }[] = [];
  const unmatched: string[] = [];

  for (const o of event.outcomes) {
    const team = matchPolymarketName(o.name, dbTeams);
    if (!team) {
      unmatched.push(o.name);
      continue;
    }
    matched.push({ teamId: team.id, teamName: team.name, polyName: o.name, price: o.yesPrice });
  }

  // Zero out anything that didn't get a price, so a removed team can't keep an
  // outdated value and sway the next draw.
  await db.transaction(async (tx) => {
    const matchedIds = new Set(matched.map((m) => m.teamId));
    for (const t of dbTeams) {
      if (matchedIds.has(t.id)) continue;
      if (Number(t.polymarketPrice) === 0) continue;
      await tx.update(schema.teams).set({ polymarketPrice: '0' }).where(eq(schema.teams.id, t.id));
    }
    for (const m of matched) {
      await tx.update(schema.teams).set({ polymarketPrice: m.price.toFixed(4) }).where(eq(schema.teams.id, m.teamId));
    }
  });

  return { matched, unmatched, totalTeams: dbTeams.length };
}
