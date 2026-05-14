import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db, schema } from '@/db/client';
import { and, asc, eq } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { buildTeamTiers } from '@/lib/team-tiers';

export const dynamic = 'force-dynamic';

async function savePrefs(formData: FormData) {
  'use server';
  const s = await getSession();
  if (!s.userId) redirect('/login');
  const userId = s.userId;
  const parsed = [1, 2, 3].map((rank) => {
    const raw = String(formData.get(`pref-${rank}`) ?? '').trim();
    const id = Number.parseInt(raw, 10);
    return { rank, teamId: Number.isFinite(id) && id > 0 ? id : null };
  });

  // Disallow duplicates — three different teams.
  const ids = parsed.map((p) => p.teamId).filter((x): x is number => x != null);
  if (new Set(ids).size !== ids.length) {
    redirect('/preferences?err=duplicate');
  }

  await db.transaction(async (tx) => {
    await tx.delete(schema.teamPreferences).where(eq(schema.teamPreferences.userId, userId));
    for (const p of parsed) {
      if (p.teamId == null) continue;
      await tx.insert(schema.teamPreferences).values({ userId, rank: p.rank, teamId: p.teamId });
    }
  });
  redirect('/preferences?saved=1');
}

export default async function PreferencesPage({ searchParams }: { searchParams: Promise<{ err?: string; saved?: string }> }) {
  const session = await getSession();
  if (!session.userId) {
    return (
      <div className="brutal-card">
        <p>
          <Link className="brutal-link" href="/login">Sign in</Link> to set your team preferences.
        </p>
      </div>
    );
  }
  const { err, saved } = await searchParams;

  const teams = await db.select().from(schema.teams).orderBy(asc(schema.teams.groupName), asc(schema.teams.name));
  const prefs = await db
    .select()
    .from(schema.teamPreferences)
    .where(eq(schema.teamPreferences.userId, session.userId))
    .orderBy(asc(schema.teamPreferences.rank));

  const byRank: (number | undefined)[] = [];
  for (const p of prefs) byRank[p.rank - 1] = p.teamId;

  // Bucket teams into favourites / mid-table / underdogs. Polymarket price
  // wins when synced; otherwise we fall back to FIFA rank so the dropdown
  // isn't a meaningless alphabetical-by-group dump.
  const { favourites, midtable, underdogs, havePrices } = buildTeamTiers(teams);

  return (
    <div className="space-y-6">
      <div className="brutal-card">
        <h1 className="brutal-h1 brutal-heading-magenta">Team preferences</h1>
        <p className="text-sm mt-2">
          Pick your three top teams in order of preference. When the draw runs, we'll do our best to give you one of them —
          but everyone is guaranteed one team from the top tier (no one gets stuck with five rubbish countries), and the rest
          balance across players by Polymarket odds.
        </p>
        {err === 'duplicate' && <p className="brutal-error mt-3">Pick three different teams.</p>}
        {saved && <p className="mt-3 brutal-pill bg-cga-cyan text-cga-black">Saved.</p>}
      </div>

      <form action={savePrefs} className="brutal-card space-y-4">
        <h2 className="brutal-h2">Your picks</h2>
        {[1, 2, 3].map((rank) => (
          <label key={rank} className="block">
            <span className="text-sm font-bold uppercase">{ordinal(rank)} choice</span>
            <select className="brutal-input mt-1" name={`pref-${rank}`} defaultValue={byRank[rank - 1] ?? ''}>
              <option value="">— pick a team —</option>
              <optgroup label={`★ Favourites (top 8 ${havePrices ? 'by Polymarket' : 'by FIFA rank'})`}>
                {favourites.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.flag} {t.name} (Grp {t.groupName}){havePrices ? ` — ${(Number(t.polymarketPrice) * 100).toFixed(1)}%` : ''}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Mid-table">
                {midtable.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.flag} {t.name} (Grp {t.groupName}){havePrices ? ` — ${(Number(t.polymarketPrice) * 100).toFixed(1)}%` : ''}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Underdogs">
                {underdogs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.flag} {t.name} (Grp {t.groupName}){havePrices ? ` — ${(Number(t.polymarketPrice) * 100).toFixed(1)}%` : ''}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
        ))}
        <button className="brutal-btn-primary" type="submit">Save preferences</button>
      </form>

      <div className="brutal-card">
        <h2 className="brutal-h2">How preferences are honoured</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
          <li>Top-seed pass: for each player, we try to give them their highest-ranked preference that falls in the favourites tier (top {favourites.length}).</li>
          <li>Random top-seed fill: anyone who didn't grab a favourite by preference gets one at random — so everyone has exactly one.</li>
          <li>Non-top preferences: we then try to give each player their other preferred teams if they're still available.</li>
          <li>Balanced fill: the remaining slots get filled to even out total Polymarket odds across players.</li>
          <li>Leftovers: anything that doesn't fit goes to the leftover pool (Wooden Spoon, Cinderella Cup, etc.).</li>
        </ol>
      </div>
    </div>
  );
}

function ordinal(n: number) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : '3rd';
}
