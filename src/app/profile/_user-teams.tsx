import { db, schema } from '@/db/client';
import { and, asc, eq } from 'drizzle-orm';

/**
 * Lists the teams drawn to a player (leftover teams excluded). Shared by the
 * self profile and the /profile/[id] view. Read-only.
 */
export async function UserTeams({ userId, label }: { userId: number; label: string }) {
  const teams = await db
    .select({
      id: schema.teams.id,
      name: schema.teams.name,
      flag: schema.teams.flag,
      groupName: schema.teams.groupName,
      fifaRank: schema.teams.fifaRank,
    })
    .from(schema.teamAssignments)
    .innerJoin(schema.teams, eq(schema.teams.id, schema.teamAssignments.teamId))
    .where(
      and(eq(schema.teamAssignments.userId, userId), eq(schema.teamAssignments.isLeftover, false)),
    )
    .orderBy(asc(schema.teams.groupName), asc(schema.teams.name));

  return (
    <div className="brutal-card">
      <h2 className="brutal-h2">{label} teams</h2>
      {teams.length === 0 ? (
        <p className="mt-2 text-sm opacity-100">
          No teams yet — the draw hasn&rsquo;t handed any over.
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {teams.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-2 border-[2px] border-current px-3 py-2"
            >
              <span className="font-bold">
                {t.flag} {t.name}
              </span>
              <span className="whitespace-nowrap text-xs opacity-100">
                Grp {t.groupName} · FIFA #{t.fifaRank}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
