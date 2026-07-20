import Link from 'next/link';
import { Suspense } from 'react';
import { db, schema } from '@/db/client';
import { sql } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { buildLeaderboard } from '@/lib/leaderboards';
import { fmtNzDateTime, nzZoneAbbr } from '@/lib/format';
import { tagClassForGroup } from '@/lib/group-color';
import { getCommentCounts } from '@/lib/match-chat-counts';
import { fifaMatchNumber } from '@/lib/bracket';
import { MAX_BURN_LEN } from '@/lib/burns';
import { postBurnAction } from './_burn-actions';
import PolymarketWidget from './_polymarket-widget';
import WrapUpWidget from './_wrapup-widget';
import LeaderboardWidget from './_leaderboard-widget';
import NewsWidget from './_news-widget';
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
           f.home_team_id, f.away_team_id,
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

  // Who drew each team, so each fixture shows whose match it is.
  const [assignments, players] = await Promise.all([
    db.select().from(schema.teamAssignments),
    db.select().from(schema.users),
  ]);
  const playerById = new Map(players.map((u) => [u.id, u] as const));
  const ownerByTeamId = new Map<number, string>();
  for (const a of assignments) {
    if (a.userId == null || a.isLeftover) continue;
    const owner = playerById.get(a.userId);
    if (owner) ownerByTeamId.set(a.teamId, owner.name);
  }

  return (
    <div className="space-y-6">
      {/* Tournament wrap-up — appears once the final is FINISHED. */}
      <WrapUpWidget />

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
        <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {upcoming.rows.length === 0 && (
            <li className="opacity-100">
              {(fixtureCount.rows[0] as { c: number }).c > 0
                ? 'That’s the lot — every match has been played. Se acabó.'
                : 'No fixtures yet — run the seed script.'}
            </li>
          )}
          {upcoming.rows.map((row, i) => {
            const r = row as Record<string, unknown>;
            const date = new Date(r.kickoff as string);
            const home = (r.home_flag ? `${r.home_flag} ${r.home_name}` : r.home_label) as string;
            const away = (r.away_flag ? `${r.away_flag} ${r.away_name}` : r.away_label) as string;
            const stage = r.stage as string;
            const group = r.group_name as string | null;
            const homeOwner = r.home_team_id ? ownerByTeamId.get(Number(r.home_team_id)) : undefined;
            const awayOwner = r.away_team_id ? ownerByTeamId.get(Number(r.away_team_id)) : undefined;
            const TeamRow = ({ team, owner }: { team: string; owner?: string }) => (
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-base font-bold">{team}</span>
                {owner && (
                  <span className="shrink-0 whitespace-nowrap text-xs">
                    <span className="ansi-cyan">▒</span> {owner}
                  </span>
                )}
              </div>
            );
            return (
              <Link
                key={i}
                href={`/match/${r.id}`}
                className="block border-[2px] border-current px-3 py-2 hover:bg-cga-cyan hover:text-cga-black"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <TeamRow team={home} owner={homeOwner} />
                    <TeamRow team={away} owner={awayOwner} />
                  </div>
                  <ChatBadge count={commentCounts.get(Number(r.id)) ?? 0} className="mt-0.5 shrink-0" />
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-xs">
                  <span className="whitespace-nowrap tabular-nums font-bold">
                    {fmtNzDateTime(date)} {nzZoneAbbr(date)}
                  </span>
                  {group ? (
                    <span className={`inline-flex ${tagClassForGroup(group)} text-[10px] leading-none`}>
                      Group {group}
                    </span>
                  ) : (
                    <span className="inline-block whitespace-nowrap border-[2px] border-current px-1.5 py-0 uppercase font-bold">
                      {stage}
                      {(() => {
                        const n = fifaMatchNumber({ homeLabel: r.home_label as string | null, awayLabel: r.away_label as string | null });
                        return n != null ? ` · M${n}` : '';
                      })()}
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

      {/* World Cup news — streamed so a slow feed never blocks the page. */}
      <Suspense fallback={null}>
        <NewsWidget />
      </Suspense>

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
