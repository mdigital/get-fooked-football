import { db, schema } from '@/db/client';
import { asc } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { computeTeamScores } from '@/lib/scoring';
import { tagClassForGroup } from '@/lib/group-color';
import { avatarFor } from '@/lib/avatar';
import { Avatar } from '../_avatar';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function MyTeamsPage() {
  const session = await getSession();
  if (!session.userId) {
    return (
      <div className="brutal-card">
        <p>
          You need to <Link className="brutal-link" href="/login">sign in</Link> to see your assigned teams.
        </p>
      </div>
    );
  }

  const [teams, assignments, fixtures, users] = await Promise.all([
    db.select().from(schema.teams).orderBy(asc(schema.teams.groupName)),
    db.select().from(schema.teamAssignments),
    db.select().from(schema.fixtures),
    db.select().from(schema.users).orderBy(asc(schema.users.name)),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t] as const));
  const scores = computeTeamScores(fixtures, teams);

  // Top-N tier by polymarket price (where N = users.length), so we can mark
  // each player's "top seed" with a star.
  const N = users.length;
  const sortedByPrice = teams.slice().sort((a, b) => Number(b.polymarketPrice) - Number(a.polymarketPrice));
  const topSeedIds = new Set(sortedByPrice.slice(0, N).map((t) => t.id));

  const myAssignments = assignments.filter((a) => a.userId === session.userId);
  const myTeams = myAssignments.map((a) => teamById.get(a.teamId)).filter(Boolean) as typeof teams;
  const leftovers = assignments.filter((a) => a.isLeftover).map((a) => teamById.get(a.teamId)).filter(Boolean) as typeof teams;
  const drawDone = assignments.length > 0;

  const myTotals = sumTotals(myTeams, scores);

  // Per-player odds totals (so the standings make sense after the draw).
  const perPlayer = users
    .map((u) => {
      const ts = assignments
        .filter((a) => a.userId === u.id)
        .map((a) => teamById.get(a.teamId))
        .filter(Boolean) as typeof teams;
      return { user: u, teams: ts, totals: sumTotals(ts, scores) };
    })
    .sort((a, b) => b.totals.odds - a.totals.odds);

  return (
    <div className="space-y-6">
      <div className="brutal-card">
        <h1 className="brutal-h1 brutal-heading-magenta">[ My Teams ]</h1>
        {!drawDone && (
          <p className="mt-2">
            The draw hasn't happened yet. Set your three preferences on the{' '}
            <Link className="brutal-link" href="/preferences">preferences</Link> page so the draw can try to honour them.
          </p>
        )}
        {drawDone && myTeams.length === 0 && (
          <p className="mt-2">You weren't assigned any teams in this draw. Talk to the admin.</p>
        )}
        {myTeams.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
            <Tile label="Teams" value={String(myTeams.length)} />
            <Tile label="Points" value={String(myTotals.points)} />
            <Tile label="Polymarket total" value={`${(myTotals.odds * 100).toFixed(1)}%`} />
            <Tile label="Population" value={fmtNumber(myTotals.population)} />
            <Tile label="Sheep" value={fmtNumber(myTotals.sheep)} />
          </div>
        )}
      </div>

      {myTeams.length > 0 && (
        <div className="brutal-card">
          <h2 className="brutal-h2">Your draw</h2>
          <TeamTable teams={myTeams} scores={scores} topSeedIds={topSeedIds} />
        </div>
      )}

      {drawDone && perPlayer.length > 1 && (
        <div className="brutal-card">
          <h2 className="brutal-h2">Players by Polymarket total</h2>
          <p className="text-sm mt-2">
            Sum of Polymarket's "yes" prices across each player's drawn teams. Useful as a sanity check that the draw was balanced.
          </p>
          <table className="mt-3 w-full text-left text-sm table-row-hover">
            <thead className="text-xs uppercase">
              <tr>
                <th className="py-2">Player</th>
                <th className="text-right">Teams</th>
                <th className="text-right">Top seed</th>
                <th className="text-right">Polymarket total</th>
              </tr>
            </thead>
            <tbody>
              {perPlayer.map(({ user, teams: pt, totals }) => {
                const top = pt.find((t) => topSeedIds.has(t.id));
                return (
                  <tr key={user.id} className="border-t border-current">
                    <td className="py-2 font-bold">
                      <span className="inline-flex items-center gap-2">
                        <Avatar src={avatarFor({ email: user.email, avatarUrl: user.avatarUrl }, 48)} name={user.name} size={24} />
                        {user.name}{user.id === session.userId ? ' (you)' : ''}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{pt.length}</td>
                    <td className="text-right">{top ? `${top.flag} ${top.code}` : '—'}</td>
                    <td className="text-right font-bold tabular-nums">{(totals.odds * 100).toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {leftovers.length > 0 && (
        <div className="brutal-card">
          <h2 className="brutal-h2">Leftover teams</h2>
          <p className="text-sm">
            Reserved for side prizes — the Wooden Spoon, the Cinderella Cup, etc.
          </p>
          <div className="mt-3">
            <TeamTable teams={leftovers} scores={scores} topSeedIds={topSeedIds} />
          </div>
        </div>
      )}
    </div>
  );
}

function sumTotals(
  teams: { population: number; sheep: number; fifaRank: number; polymarketPrice: string | number; id: number }[],
  scores: Map<number, { points: number }>,
) {
  return teams.reduce(
    (acc, t) => {
      acc.population += t.population;
      acc.sheep += t.sheep;
      acc.fifaRank += t.fifaRank;
      acc.points += scores.get(t.id)?.points ?? 0;
      acc.odds += Number(t.polymarketPrice);
      return acc;
    },
    { population: 0, sheep: 0, fifaRank: 0, points: 0, odds: 0 },
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-[3px] border-current px-3 py-2">
      <div className="text-xs uppercase font-bold">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

function fmtNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function TeamTable({
  teams,
  scores,
  topSeedIds,
}: {
  teams: { id: number; flag: string; code: string; name: string; groupName: string; fifaRank: number; population: number; sheep: number; polymarketPrice: string | number }[];
  scores: Map<number, { points: number; w: number; d: number; l: number; gf: number; ga: number }>;
  topSeedIds: Set<number>;
}) {
  return (
    <table className="mt-2 w-full text-left text-sm table-row-hover">
      <thead className="text-xs uppercase">
        <tr>
          <th className="py-2">Team</th>
          <th>Group</th>
          <th className="text-right">FIFA</th>
          <th className="text-right">Poly %</th>
          <th className="text-right">Pop</th>
          <th className="text-right">Sheep</th>
          <th className="text-right">W-D-L</th>
          <th className="text-right">Pts</th>
        </tr>
      </thead>
      <tbody>
        {teams.map((t) => {
          const s = scores.get(t.id);
          const isSeed = topSeedIds.has(t.id);
          return (
            <tr key={t.id} className="border-t border-current">
              <td className="py-2">
                {isSeed && <span title="Top seed">★ </span>}
                {t.flag} {t.name}
              </td>
              <td>
                <span className={`${tagClassForGroup(t.groupName)} text-[10px] leading-none`}>{t.groupName}</span>
              </td>
              <td className="text-right tabular-nums">{t.fifaRank}</td>
              <td className="text-right tabular-nums">{(Number(t.polymarketPrice) * 100).toFixed(1)}%</td>
              <td className="text-right tabular-nums">{fmtNumber(t.population)}</td>
              <td className="text-right tabular-nums">{fmtNumber(t.sheep)}</td>
              <td className="text-right tabular-nums">{s ? `${s.w}-${s.d}-${s.l}` : '0-0-0'}</td>
              <td className="text-right font-bold tabular-nums">{s?.points ?? 0}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
