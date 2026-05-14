import { db, schema } from '@/db/client';
import { asc } from 'drizzle-orm';
import { prizePotShare, totalAllocatedPct } from '@/lib/prizes';
import { computePot } from '@/lib/buy-in';

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
  const players = await db.select({ id: schema.users.id, buyIn: schema.users.buyIn }).from(schema.users);
  const playerCount = players.length;
  const pot = computePot(players);
  const avgBuyIn = playerCount > 0 ? Math.round(pot / playerCount) : 0;

  const decoratedPrizes = prizes.map((p) => ({ ...p, pctNum: Number(p.pctOfPot) }));
  const allocatedPct = totalAllocatedPct(decoratedPrizes.map((p) => ({ pctOfPot: p.pctNum })));

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
                const amount = prizePotShare(p.pctNum, pot);
                return (
                  <li key={p.id} className="flex items-start gap-3 border-[3px] border-current p-3">
                    <div className="min-w-[5rem] text-center">
                      <div className="text-2xl font-bold tabular-nums">{p.pctNum.toFixed(p.pctNum % 1 === 0 ? 0 : 1)}%</div>
                      <div className="text-xs opacity-100">= ${amount}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold uppercase">{p.name}</div>
                      <div className="text-sm opacity-100">{p.description}</div>
                      {p.awardedUserId && <div className="mt-1 text-xs font-bold uppercase">Awarded</div>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
