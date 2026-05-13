import Link from 'next/link';
import { db, schema } from '@/db/client';
import { sql } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { buildLeaderboard } from '@/lib/leaderboards';
import PolymarketWidget from './_polymarket-widget';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await getSession();
  const [fixtureCount, teamCount, userCount] = await Promise.all([
    db.execute(sql`select count(*)::int as c from ${schema.fixtures}`),
    db.execute(sql`select count(*)::int as c from ${schema.teams}`),
    db.execute(sql`select count(*)::int as c from ${schema.users}`),
  ]);

  const upcoming = await db.execute(sql`
    select f.id, f.kickoff, f.stage, f.group_name,
           ht.name as home_name, ht.flag as home_flag,
           at.name as away_name, at.flag as away_flag,
           f.home_label, f.away_label
    from fixtures f
    left join teams ht on ht.id = f.home_team_id
    left join teams at on at.id = f.away_team_id
    where f.status <> 'FINISHED'
    order by f.kickoff asc
    limit 5
  `);

  const top = await buildLeaderboard('overall');

  return (
    <div className="space-y-6">
      <section className="brutal-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="brutal-h1">Get Fooked ⚽</h1>
            <p className="opacity-80 mt-2">
              2026 World Cup tipping for cunts. {(fixtureCount.rows[0] as { c: number }).c} fixtures loaded.{' '}
              {(teamCount.rows[0] as { c: number }).c} teams to win.
            </p>
          </div>
          <div className="flex gap-2">
            {!session.userId && (
              <Link href="/login" className="brutal-btn-primary">Sign in</Link>
            )}
            <Link href="/help" className="brutal-btn-ghost text-sm">How it works →</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="brutal-card">
          <h2 className="mb-3 text-lg font-semibold">Next fixtures</h2>
          <ul className="space-y-2">
            {upcoming.rows.length === 0 && <li className="opacity-60">No fixtures yet — run the seed script.</li>}
            {upcoming.rows.map((row, i) => {
              const r = row as Record<string, unknown>;
              const date = new Date(r.kickoff as string);
              const home = (r.home_flag ? `${r.home_flag} ${r.home_name}` : r.home_label) as string;
              const away = (r.away_flag ? `${r.away_flag} ${r.away_name}` : r.away_label) as string;
              return (
                <Link key={i} href={`/match/${r.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-black/5 px-3 py-2 hover:border-current">
                  <span className="text-xs uppercase opacity-60">
                    {r.stage as string}
                    {r.group_name ? ` · ${r.group_name}` : ''}
                  </span>
                  <span className="flex-1 truncate font-medium">{home} <span className="opacity-60">vs</span> {away}</span>
                  <span className="text-xs tabular-nums opacity-70">{date.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </Link>
              );
            })}
          </ul>
          <Link href="/fixtures" className="mt-3 inline-block text-sm brutal-link hover:underline">All fixtures →</Link>
        </div>

        <div className="brutal-card">
          <h2 className="mb-3 text-lg font-semibold">Leaderboard — Overall</h2>
          {top.length === 0 ? (
            <p className="opacity-60">Once the draw is done and matches start, scores show up here.</p>
          ) : (
            <ol className="space-y-2">
              {top.slice(0, 5).map((row, i) => (
                <li key={row.userId} className="flex items-center justify-between rounded-lg border border-black/5 px-3 py-2">
                  <span className="font-semibold tabular-nums">{i + 1}.</span>
                  <span className="flex-1 px-2">{row.name}</span>
                  <span className="tabular-nums">{row.points} pts</span>
                </li>
              ))}
            </ol>
          )}
          <Link href="/leaderboards" className="mt-3 inline-block text-sm brutal-link hover:underline">All boards →</Link>
        </div>

        <PolymarketWidget />
      </section>
    </div>
  );
}
