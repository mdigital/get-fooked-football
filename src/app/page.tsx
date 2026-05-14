import Link from 'next/link';
import { db, schema } from '@/db/client';
import { sql } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { buildLeaderboard } from '@/lib/leaderboards';
import { fmtNzDateTime, nzZoneAbbr } from '@/lib/format';
import { tagClassForGroup } from '@/lib/group-color';
import { getCommentCounts } from '@/lib/match-chat-counts';
import { MAX_BURN_LEN } from '@/lib/burns';
import { postBurnAction } from './_burn-actions';
import PolymarketWidget from './_polymarket-widget';
import LeaderboardWidget from './_leaderboard-widget';
import { ChatBadge } from './_chat-badge';
import { ActivityFeed } from './_activity-feed';

export const dynamic = 'force-dynamic';

const FIXTURE_LIMIT = 10;

export default async function HomePage() {
  const session = await getSession();
  const [fixtureCount, teamCount] = await Promise.all([
    db.execute(sql`select count(*)::int as c from ${schema.fixtures}`),
    db.execute(sql`select count(*)::int as c from ${schema.teams}`),
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
    limit ${FIXTURE_LIMIT}
  `);

  const top = await buildLeaderboard('overall');
  const upcomingIds = upcoming.rows.map((row) => Number((row as Record<string, unknown>).id));
  const commentCounts = await getCommentCounts(upcomingIds);

  return (
    <div className="space-y-6">
      <section className="brutal-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="brutal-h1 brutal-heading-magenta">Get Fooked ⚽</h1>
            <p className="opacity-100 mt-2">
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

      {session.userId && (
        <section className="brutal-card">
          <h2 className="brutal-h2">Drop a burn</h2>
          <p className="text-sm mt-1 opacity-100">
            Posts as a sitewide banner for 24h. No rate limit — chaos rules.
          </p>
          <form action={postBurnAction} className="mt-3 flex flex-wrap items-stretch gap-2">
            <input
              type="text"
              name="body"
              required
              maxLength={MAX_BURN_LEN}
              placeholder="Tell the whole crew, all at once."
              className="brutal-input flex-1 min-w-[16rem]"
            />
            <button type="submit" className="brutal-btn-pink">Burn it</button>
          </form>
        </section>
      )}

      {/* Next fixtures — full width. Two columns on wider screens so the list
          doesn't span a kilometre across the card. */}
      <section className="brutal-card">
        <div className="flex items-center justify-between">
          <h2 className="brutal-h2">Next fixtures</h2>
          <Link href="/fixtures" className="text-sm brutal-link">All fixtures →</Link>
        </div>
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {upcoming.rows.length === 0 && (
            <li className="opacity-100">No fixtures yet — run the seed script.</li>
          )}
          {upcoming.rows.map((row, i) => {
            const r = row as Record<string, unknown>;
            const date = new Date(r.kickoff as string);
            const home = (r.home_flag ? `${r.home_flag} ${r.home_name}` : r.home_label) as string;
            const away = (r.away_flag ? `${r.away_flag} ${r.away_name}` : r.away_label) as string;
            const stage = r.stage as string;
            const group = r.group_name as string | null;
            return (
              <Link
                key={i}
                href={`/match/${r.id}`}
                className="block border-[2px] border-current px-3 py-2 hover:bg-cga-cyan hover:text-cga-black"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-base font-bold">
                    {home} <span>vs</span> {away}
                  </span>
                  <ChatBadge count={commentCounts.get(Number(r.id)) ?? 0} className="shrink-0" />
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="tabular-nums font-bold">
                    {fmtNzDateTime(date)} {nzZoneAbbr(date)}
                  </span>
                  {group ? (
                    <span className={`hidden sm:inline-flex ${tagClassForGroup(group)} text-[10px] leading-none`}>
                      Group {group}
                    </span>
                  ) : (
                    <span className="hidden sm:inline-block border-[2px] border-current px-1.5 py-0 uppercase font-bold">
                      {stage}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </ul>
      </section>

      {/* Leaderboard + Polymarket — 50/50 below. */}
      <section className="grid gap-4 md:grid-cols-2">
        <LeaderboardWidget initialBoard="overall" initialRows={top} />
        <PolymarketWidget />
      </section>

      {/* Latest cunting — recent activity feed. */}
      <section className="brutal-card">
        <div className="flex items-center justify-between">
          <h2 className="brutal-h2">Latest cunting</h2>
        </div>
        <div className="mt-3">
          <ActivityFeed limit={8} />
        </div>
      </section>
    </div>
  );
}
