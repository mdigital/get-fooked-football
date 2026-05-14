import Link from 'next/link';
import { db, schema } from '@/db/client';
import { asc } from 'drizzle-orm';
import { fmtNzDay, fmtNzTime, nzZoneAbbr } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STAGE_LABEL: Record<string, string> = {
  GROUP: 'Group',
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-final',
  SF: 'Semi-final',
  '3RD': '3rd-place playoff',
  FINAL: 'Final',
};

export default async function FixturesPage() {
  const fixtures = await db.select().from(schema.fixtures).orderBy(asc(schema.fixtures.kickoff));
  const teams = await db.select().from(schema.teams);
  const teamById = new Map(teams.map((t) => [t.id, t] as const));

  const byDay = new Map<string, typeof fixtures>();
  for (const f of fixtures) {
    const day = fmtNzDay(f.kickoff);
    const arr = byDay.get(day) ?? [];
    arr.push(f);
    byDay.set(day, arr);
  }

  return (
    <div className="space-y-6">
      <div className="brutal-card">
        <h1 className="brutal-h1">Fixture Calendar</h1>
        <p className="text-sm mt-2">All 104 matches of the 2026 World Cup. Times shown in NZ time.</p>
      </div>

      {[...byDay.entries()].map(([day, list]) => (
        <section key={day} className="brutal-card">
          <h2 className="brutal-h2 mb-3">{day}</h2>
          <ul className="space-y-1">
            {list.map((f) => {
              const home = f.homeTeamId ? teamById.get(f.homeTeamId) : undefined;
              const away = f.awayTeamId ? teamById.get(f.awayTeamId) : undefined;
              const time = fmtNzTime(f.kickoff);
              const zone = nzZoneAbbr(f.kickoff);
              const stageLabel = STAGE_LABEL[f.stage] ?? f.stage;
              const stageSuffix = f.groupName ? ` ${f.groupName}` : '';
              return (
                <Link
                  key={f.id}
                  href={`/match/${f.id}`}
                  className="block border-[2px] border-current px-3 py-2 hover:bg-cga-cyan hover:text-cga-black"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-base font-bold">
                      {home ? `${home.flag} ${home.name}` : (f.homeLabel ?? 'TBD')}
                      <span className="px-2">vs</span>
                      {away ? `${away.flag} ${away.name}` : (f.awayLabel ?? 'TBD')}
                    </span>
                    <span className="whitespace-nowrap text-sm tabular-nums">
                      {f.status === 'FINISHED' ? (
                        <strong>
                          {f.homeScore} – {f.awayScore}
                        </strong>
                      ) : (
                        <span>—</span>
                      )}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className="tabular-nums font-bold">
                      {time} {zone}
                    </span>
                    <span className="hidden sm:inline-block border-[2px] border-current px-1.5 py-0 uppercase font-bold">
                      {stageLabel}{stageSuffix}
                    </span>
                  </div>
                </Link>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
