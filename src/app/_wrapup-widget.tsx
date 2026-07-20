import Link from 'next/link';
import { asc } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { getSession } from '@/lib/session';
import { computeLeaderboard } from '@/lib/leaderboards';
import { BOARD_META, type BoardKey } from '@/lib/leaderboards-types';
import { computePot, topBuyIn } from '@/lib/buy-in';
import { buildWinnersTable, totalsByWinner } from '@/lib/wrap-up';
import { tallyPayoutVotes, validatePayoutChoice } from '@/lib/payout-vote';
import { getInswapStandings, sortStandings } from '@/lib/inswap';
import { winnerSide } from '@/lib/scoring';
import { castPayoutVoteAction } from './_payout-vote-actions';

/**
 * Tournament-over celebration card. Renders nothing until the FINAL is
 * FINISHED, then takes over the top of the homepage: winners table, prize
 * money, and the anonymous "shall we pay it out" ballot.
 */
export default async function WrapUpWidget() {
  const session = await getSession();
  const [users, teams, assignments, fixtures, prizes, votes, inswap] = await Promise.all([
    db.select().from(schema.users),
    db.select().from(schema.teams),
    db.select().from(schema.teamAssignments),
    db.select().from(schema.fixtures),
    db.select().from(schema.prizes).orderBy(asc(schema.prizes.sortOrder)),
    db.select().from(schema.payoutVotes),
    getInswapStandings(),
  ]);

  const final = fixtures.find((f) => f.stage === 'FINAL');
  if (!final || final.status !== 'FINISHED' || final.homeTeamId == null || final.awayTeamId == null) {
    return null;
  }

  const teamById = new Map(teams.map((t) => [t.id, t] as const));
  const champId = winnerSide(final) === 'home' ? final.homeTeamId : final.awayTeamId;
  const champ = teamById.get(champId);
  const home = teamById.get(final.homeTeamId);
  const away = teamById.get(final.awayTeamId);

  const pot = computePot(users);
  const topBuy = topBuyIn(users);

  // Final board standings for every board a prize hangs off.
  const leaderByBoard = new Map<string, number>();
  for (const p of prizes) {
    const key = p.boardKey;
    if (!key || leaderByBoard.has(key) || !(key in BOARD_META)) continue;
    const board = computeLeaderboard(key as BoardKey, users, teams, assignments, fixtures);
    if (board.length > 0) leaderByBoard.set(key, board[0].userId);
  }
  const inswapLeader = sortStandings(inswap)[0]?.userId ?? null;

  const rows = buildWinnersTable(
    prizes.map((p) => ({
      id: p.id,
      name: p.name,
      pctOfPot: Number(p.pctOfPot),
      category: p.category,
      boardKey: p.boardKey,
      awardedUserId: p.awardedUserId,
    })),
    {
      pot,
      topBuyIn: topBuy,
      buyInByUserId: new Map(users.map((u) => [u.id, u.buyIn] as const)),
      nameByUserId: new Map(users.map((u) => [u.id, u.name] as const)),
      leaderByBoard,
      inswapLeaderUserId: inswapLeader,
    },
  );
  const totals = totalsByWinner(rows);

  const tally = tallyPayoutVotes(
    users.map((u) => u.id),
    votes.flatMap((v) => {
      const choice = validatePayoutChoice(v.choice);
      return choice ? [{ userId: v.userId, choice }] : [];
    }),
  );
  const myChoice =
    session.userId != null
      ? validatePayoutChoice(votes.find((v) => v.userId === session.userId)?.choice)
      : null;

  const pressed = 'translate-x-[2px] translate-y-[2px] shadow-none';

  return (
    <section className="brutal-card overflow-hidden p-0">
      {/* Rojigualda band — Spain's flag in CGA reds and yellows. */}
      <div aria-hidden>
        <div className="h-2 bg-[#aa0000]" />
        <div className="h-4 bg-[#ffff55]" />
        <div className="h-2 bg-[#aa0000]" />
      </div>
      <div className="border-t-[3px] border-current p-5">
        <h1 className="brutal-h1">
          <span aria-hidden>🐂 </span>
          Ay caramba! It&rsquo;s over
          <span aria-hidden> 🇪🇸</span>
        </h1>
        <p className="mt-2 text-sm">
          {home?.flag} {home?.name} {final.homeScore}–{final.awayScore} {away?.name} {away?.flag} —{' '}
          <strong>
            {champ?.name} campeones del mundo.
          </strong>{' '}
          All that&rsquo;s left is the ${pot} pot.
        </p>

        {/* Winners ------------------------------------------------------- */}
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-[3px] border-current text-left text-xs uppercase">
              <th className="py-1 pr-2">Prize</th>
              <th className="py-1 pr-2">Winner</th>
              <th className="py-1 text-right">Cut</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.prizeId} className="border-b-[2px] border-current">
                <td className="py-1.5 pr-2">{r.prizeName}</td>
                <td className="py-1.5 pr-2 font-bold">
                  {r.winnerName ? (
                    <>
                      {r.official && <span title="Officially awarded">★ </span>}
                      {r.winnerName}
                    </>
                  ) : (
                    <span className="font-normal opacity-60">TBD</span>
                  )}
                </td>
                <td className="py-1.5 text-right font-bold tabular-nums whitespace-nowrap">${r.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs">
          ★ = officially awarded. Unstarred winners are where the final boards landed; TBD prizes
          wait on the judges. Amounts already apply the buy-in cap.
        </p>

        {totals.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase">Take-home:</span>
            {totals.map((t) => (
              <span key={t.userId} className="brutal-pill text-xs">
                {t.name} ${t.total}
              </span>
            ))}
          </div>
        )}

        {/* The ballot ---------------------------------------------------- */}
        <div className="mt-5 border-t-[3px] border-current pt-4">
          <h2 className="brutal-h2">Shall we pay it out or not?</h2>
          <p className="mt-1 text-sm">
            Anonymous ballot, one vote each, change it whenever. Nobody sees who voted what — only
            the split below.
          </p>
          {session.userId ? (
            <form action={castPayoutVoteAction} className="mt-3 flex gap-2">
              <button
                type="submit"
                name="choice"
                value="PAY"
                className={`brutal-btn-cyan ${myChoice === 'PAY' ? pressed : ''}`}
              >
                {myChoice === 'PAY' ? '✓ ' : ''}Pay
              </button>
              <button
                type="submit"
                name="choice"
                value="NOT"
                className={`brutal-btn-pink ${myChoice === 'NOT' ? pressed : ''}`}
              >
                {myChoice === 'NOT' ? '✓ ' : ''}Not
              </button>
            </form>
          ) : (
            <p className="mt-3 text-sm">
              <Link href="/login" className="brutal-link">
                Sign in
              </Link>{' '}
              to have a say.
            </p>
          )}
          <div
            className="mt-4 flex h-8 w-full border-[3px] border-current"
            role="img"
            aria-label={`Pay ${tally.payPct}%, Not ${tally.notPct}%, no answer ${tally.noAnswerPct}%`}
          >
            {tally.payPct > 0 && <div className="h-full bg-cga-cyan" style={{ width: `${tally.payPct}%` }} />}
            {tally.notPct > 0 && <div className="h-full bg-cga-magenta" style={{ width: `${tally.notPct}%` }} />}
            {tally.noAnswerPct > 0 && (
              <div
                className="h-full opacity-40"
                style={{
                  width: `${tally.noAnswerPct}%`,
                  backgroundImage:
                    'repeating-linear-gradient(45deg, transparent 0 6px, currentColor 6px 8px)',
                }}
              />
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold uppercase">
            <span>
              <span className="mr-1 inline-block h-3 w-3 border-[2px] border-current bg-cga-cyan align-[-2px]" />
              Pay {tally.payPct}%
            </span>
            <span>
              <span className="mr-1 inline-block h-3 w-3 border-[2px] border-current bg-cga-magenta align-[-2px]" />
              Not {tally.notPct}%
            </span>
            <span>
              <span className="mr-1 inline-block h-3 w-3 border-[2px] border-current align-[-2px]" />
              No answer {tally.noAnswerPct}%
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
