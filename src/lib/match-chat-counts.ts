import { db, schema } from '@/db/client';
import { and, eq, isNull, sql, inArray } from 'drizzle-orm';

/**
 * Live (non-deleted) comment counts for a set of fixture IDs.
 * Returns a `Map<fixtureId, count>` — fixtures with zero comments are absent
 * from the map so a `count ?? 0` lookup is fine.
 */
export async function getCommentCounts(fixtureIds: number[]): Promise<Map<number, number>> {
  if (fixtureIds.length === 0) return new Map();
  const rows = await db
    .select({
      fixtureId: schema.matchComments.fixtureId,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.matchComments)
    .where(
      and(
        inArray(schema.matchComments.fixtureId, fixtureIds),
        isNull(schema.matchComments.deletedAt),
      ),
    )
    .groupBy(schema.matchComments.fixtureId);
  return new Map(rows.map((r) => [r.fixtureId, Number(r.count)] as const));
}
