import { db, schema } from '@/db/client';
import { asc } from 'drizzle-orm';
import { prizePotShare, totalAllocatedPct, splitPrizePayout, computeSlushFund } from '@/lib/prizes';
import { computePot, topBuyIn } from '@/lib/buy-in';

export const dynamic = 'force-dynamic';

const CATEGORY_LABEL: Record<string, string> = {
  GRAND: 'The Grand Prize',
  BOARD: 'Themed leaderboards',
  SPECIAL: 'Special prizes',
  INSWAP: 'InSwap League',
};

const CATEGORY_ORDER = ['GRAND', 'BOARD', 'SPECIAL', 'INSWAP'];

export default async function PrizesPage() {
  const prizes = await db.select().from(schema.prizes).orderBy(asc(schema.prizes.sortOrder));
  const players = await db
    .select({ id: schema.users.id, buyIn: schema.users.buyIn })
    .from(schema.users);
  const playerCount = players.length;
  const pot = computePot(players);
  const avgBuyIn = playerCount > 0 ? Math.round(pot / playerCount) : 0;
  const topBuy = topBuyIn(players);
  const buyInById = new Map(players.map((p) => [p.id, Number(p.buyIn)]));

  const decoratedPrizes = prizes.map((p) => {
    const pctNum = Number(p.pctOfPot);
    const gross = prizePotShare(pctNum, pot);
    // Once a prize is awarded we know the winner, so we can apply their cap and
    // see how much (if any) overflows into the slush fund.
    const winnerBuyIn = p.awardedUserId != null ? buyInById.get(p.awardedUserId) ?? 0 : null;
    const split =
      winnerBuyIn != null ? splitPrizePayout(gross, winnerBuyIn, topBuy) : null;
    return { ...p, pctNum, gross, winnerBuyIn, split };
  });
  const allocatedPct = totalAllocatedPct(decoratedPrizes.map((p) => ({ pctOfPot: p.pctNum })));

  const slushFund = computeSlushFund(
    decoratedPrizes
      .filter((p) => p.winnerBuyIn != null)
      .map((p) => ({ gross: p.gross, winnerBuyIn: p.winnerBuyIn as number })),
    topBuy,
  );

  const grouped = new Map<string, typeof decoratedPrizes>();
  for (const p of decoratedPrizes) {
    const arr = grouped.get(p.category) ?? [];
    arr.push(p);
    grouped.set(p.category, arr);
  }

  return (
    <div className="space-y-6">
      <div className="brutal-card">
        <h1 className="brutal-h1 brutal-heading-cyan">Prizes</h1>
        <p className="text-sm opacity-100 mt-2">
          {playerCount} player{playerCount === 1 ? '' : 's'} · avg ${avgBuyIn} buy-in ·{' '}
          <strong>${pot} pot</strong>. Each player picks their own pledge ($20–$500); prize amounts are percentages of the pot.
        </p>
        <p className="text-sm opacity-100 mt-3 border-[3px] border-current p-3">
          <strong>Proportional winnings cap:</strong> the biggest pledge in the crew (currently{' '}
          <strong>${topBuy}</strong>) collects prizes in full. Pledge less than that and your
          winnings are capped to your share — pledge half, win half. Whatever your stinginess
          leaves on the table rolls into the <strong>slush fund</strong> below.
        </p>
        {Math.abs(allocatedPct - 100) > 0.01 && (
          <p className="brutal-error mt-3">
            Heads up: prize percentages currently sum to {allocatedPct.toFixed(1)}%, not 100%.
          </p>
        )}
      </div>

      {CATEGORY_ORDER.map((cat) => {
        const list = grouped.get(cat);
        if (!list || list.length === 0) return null;
        return (
          <section key={cat} className="brutal-card">
            <h2 className="brutal-h2">{CATEGORY_LABEL[cat] ?? cat}</h2>
            <ul className="mt-3 space-y-2">
              {list.map((p) => {
                const capped = p.split != null && p.split.slush > 0;
                return (
                  <li key={p.id} className="flex items-start gap-3 border-[3px] border-current p-3">
                    <div className="min-w-[5rem] text-center">
                      <div className="text-2xl font-bold tabular-nums">{p.pctNum.toFixed(p.pctNum % 1 === 0 ? 0 : 1)}%</div>
                      <div className="text-xs opacity-100">= ${p.gross}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold uppercase">{p.name}</div>
                      <div className="text-sm opacity-100">{p.description}</div>
                      {p.awardedUserId && <div className="mt-1 text-xs font-bold uppercase">Awarded</div>}
                      {capped && (
                        <div className="mt-1 text-xs opacity-100">
                          Winner only pledged ${p.winnerBuyIn} of ${topBuy} — pays out{' '}
                          <strong>${p.split!.paid}</strong>, with <strong>${p.split!.slush}</strong>{' '}
                          to the slush fund.
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <section className="brutal-card">
        <h2 className="brutal-h2">Slush fund — beers for the lads cos you are a cheap cunt</h2>
        <ul className="mt-3 space-y-2">
          <li className="flex items-start gap-3 border-[3px] border-current p-3">
            <div className="min-w-[5rem] text-center">
              <div className="text-2xl font-bold tabular-nums">${slushFund}</div>
              <div className="text-xs opacity-100">so far</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold uppercase">Beers for the lads</div>
              <div className="text-sm opacity-100">
                Holds the remainder. Every dollar a tight-arse leaves on the table by pledging
                under the ${topBuy} top buy-in lands here and gets spent on beers for everyone.
                Pledge the max and none of your winnings ever end up in this pot.
              </div>
            </div>
          </li>
        </ul>
      </section>
    </div>
  );
}
