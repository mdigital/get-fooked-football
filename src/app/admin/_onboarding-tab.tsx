import Link from 'next/link';
import { db, schema } from '@/db/client';
import { asc } from 'drizzle-orm';
import { displayName } from '@/lib/display-name';
import { fmtNzDateTime } from '@/lib/format';

/**
 * Admin tab: every user's onboarding answers — buy-in pledge, three team
 * preferences, when they finished onboarding. Users who haven't completed
 * /onboarding yet are listed at the top with a "not yet" badge so the
 * admin can chase them.
 */
export async function OnboardingTab() {
  const [users, prefs, teams] = await Promise.all([
    db.select().from(schema.users).orderBy(asc(schema.users.name)),
    db.select().from(schema.teamPreferences).orderBy(asc(schema.teamPreferences.rank)),
    db.select().from(schema.teams),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  // Group preferences by user, ordered by rank ascending.
  const prefsByUser = new Map<number, Array<{ rank: number; teamId: number }>>();
  for (const p of prefs) {
    const arr = prefsByUser.get(p.userId) ?? [];
    arr.push({ rank: p.rank, teamId: p.teamId });
    prefsByUser.set(p.userId, arr);
  }

  // Pot summary at the top so the admin can sanity-check before the draw.
  const totalPledged = users.reduce((s, u) => s + (u.buyIn ?? 0), 0);
  const onboardedCount = users.filter((u) => u.onboardedAt != null).length;

  return (
    <section className="brutal-card">
      <h2 className="brutal-h2">Onboarding answers</h2>
      <p className="text-sm opacity-100 mt-2">
        Pledges and preferences each player submitted at /onboarding. {onboardedCount} of {users.length} players have
        finished onboarding · <strong>${totalPledged}</strong> pledged in total.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase opacity-100">
            <tr>
              <th className="py-2">Player</th>
              <th className="text-right">Pledge</th>
              <th>Onboarded</th>
              <th>1st pick</th>
              <th>2nd pick</th>
              <th>3rd pick</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const picks = prefsByUser.get(u.id) ?? [];
              const pick = (rank: number) => {
                const p = picks.find((x) => x.rank === rank);
                if (!p) return null;
                return teamById.get(p.teamId) ?? null;
              };
              const renderPick = (rank: number) => {
                const t = pick(rank);
                if (!t) return <span className="opacity-50">—</span>;
                return (
                  <span>
                    {t.flag} {t.name}
                    <span className="ml-1 text-xs opacity-100">(Grp {t.groupName})</span>
                  </span>
                );
              };
              return (
                <tr key={u.id} className="border-t border-current/10 align-top">
                  <td className="py-2 font-bold">
                    <Link
                      href={`/profile/${u.id}`}
                      className="hover:underline decoration-2 underline-offset-2"
                    >
                      {displayName(u)}
                    </Link>
                  </td>
                  <td className="text-right tabular-nums font-bold">${u.buyIn ?? 0}</td>
                  <td className="text-xs">
                    {u.onboardedAt ? (
                      fmtNzDateTime(u.onboardedAt)
                    ) : (
                      <span className="brutal-tag-magenta text-[10px] leading-none">not yet</span>
                    )}
                  </td>
                  <td>{renderPick(1)}</td>
                  <td>{renderPick(2)}</td>
                  <td>{renderPick(3)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
