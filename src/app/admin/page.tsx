import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db, schema } from '@/db/client';
import { asc, desc, eq } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { generateInviteToken } from '@/lib/auth';
import { runRandomDraw } from '@/lib/draw';
import { submitScoreEdit } from '@/lib/score-edits';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const s = await getSession();
  if (!s.userId || !s.isAdmin) redirect('/login?error=admin');
  return s;
}

async function createInvite(formData: FormData) {
  'use server';
  const s = await requireAdmin();
  const note = String(formData.get('note') ?? '').trim() || null;
  await db.insert(schema.invites).values({
    token: generateInviteToken(),
    note,
    createdByUserId: s.userId!,
  });
  redirect('/admin#invites');
}

async function deleteInvite(formData: FormData) {
  'use server';
  await requireAdmin();
  const token = String(formData.get('token') ?? '');
  if (!token) return;
  await db.delete(schema.invites).where(eq(schema.invites.token, token));
  redirect('/admin#invites');
}

async function doDraw(formData: FormData) {
  'use server';
  await requireAdmin();
  const seedRaw = String(formData.get('seed') ?? '').trim();
  const seed = seedRaw ? Number.parseInt(seedRaw, 10) : undefined;
  await runRandomDraw(Number.isFinite(seed) ? seed : undefined);
  redirect('/admin#draw');
}

async function setFixtureResult(formData: FormData) {
  'use server';
  const session = await requireAdmin();
  const id = Number(formData.get('id'));
  const stage = String(formData.get('stage') ?? 'GROUP');
  try {
    await submitScoreEdit({
      fixtureId: id,
      userId: session.userId!,
      stage,
      status: String(formData.get('status') ?? 'FINISHED'),
      homeScore: parseIntOrNull(formData.get('home')),
      awayScore: parseIntOrNull(formData.get('away')),
      homePens: parseIntOrNull(formData.get('home_pens')),
      awayPens: parseIntOrNull(formData.get('away_pens')),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed';
    redirect(`/admin?err=${encodeURIComponent(msg)}#results`);
  }
  redirect('/admin#results');
}

async function setFixtureTeams(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = Number(formData.get('id'));
  const home = parseIntOrNull(formData.get('home_team_id'));
  const away = parseIntOrNull(formData.get('away_team_id'));
  await db.update(schema.fixtures).set({ homeTeamId: home, awayTeamId: away }).where(eq(schema.fixtures.id, id));
  redirect('/admin#results');
}

async function awardPrize(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = Number(formData.get('prize_id'));
  const winner = parseIntOrNull(formData.get('user_id'));
  await db
    .update(schema.prizes)
    .set({ awardedUserId: winner, awardedAt: winner ? new Date() : null })
    .where(eq(schema.prizes.id, id));
  redirect('/admin#prizes');
}

async function togglePaid(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = Number(formData.get('user_id'));
  const paid = formData.get('paid') === 'on';
  await db.update(schema.users).set({ paid }).where(eq(schema.users.id, id));
  redirect('/admin#players');
}

function parseIntOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

export default async function AdminPage() {
  await requireAdmin();
  const [users, invites, teams, fixtures, prizes, assignments] = await Promise.all([
    db.select().from(schema.users).orderBy(asc(schema.users.name)),
    db.select().from(schema.invites).orderBy(desc(schema.invites.createdAt)),
    db.select().from(schema.teams).orderBy(asc(schema.teams.groupName)),
    db.select().from(schema.fixtures).orderBy(asc(schema.fixtures.kickoff)),
    db.select().from(schema.prizes).orderBy(asc(schema.prizes.sortOrder)),
    db.select().from(schema.teamAssignments),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const assignmentsByUser = new Map<number, number>();
  for (const a of assignments) {
    if (a.userId == null) continue;
    assignmentsByUser.set(a.userId, (assignmentsByUser.get(a.userId) ?? 0) + 1);
  }
  const leftoverCount = assignments.filter((a) => a.isLeftover).length;

  return (
    <div className="space-y-8">
      <div className="brutal-card">
        <h1 className="text-xl font-bold">Admin</h1>
        <p className="text-sm opacity-70">
          Invite players, run the draw, enter results, award prizes. Take it easy with the “run draw” button —
          it replaces everyone’s existing teams.
        </p>
      </div>

      {/* Players ---------------------------------------------------------- */}
      <section id="players" className="brutal-card">
        <h2 className="mb-3 text-lg font-semibold">Players ({users.length})</h2>
        <table className="w-full text-left text-sm table-row-hover">
          <thead className="text-xs uppercase opacity-60">
            <tr>
              <th className="py-2">Name</th>
              <th>Email</th>
              <th className="text-right">Teams</th>
              <th className="text-right">Paid?</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-black/5">
                <td className="py-2 font-medium">{u.name} {u.isAdmin && <span className="ml-1 rounded bg-neon-lime px-1.5 py-0.5 text-xs text-white">admin</span>}</td>
                <td className="opacity-70">{u.email}</td>
                <td className="text-right tabular-nums">{assignmentsByUser.get(u.id) ?? 0}</td>
                <td className="text-right">
                  <form action={togglePaid} className="inline-flex items-center gap-1">
                    <input type="hidden" name="user_id" value={u.id} />
                    <input type="checkbox" name="paid" defaultChecked={u.paid} id={`paid-${u.id}`} />
                    <button className="brutal-btn-ghost text-xs" type="submit" aria-label="save">save</button>
                  </form>
                </td>
                <td className="text-xs opacity-60">{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Invites ---------------------------------------------------------- */}
      <section id="invites" className="brutal-card">
        <h2 className="mb-3 text-lg font-semibold">Invites</h2>
        <form action={createInvite} className="mb-4 flex flex-wrap items-center gap-2">
          <input className="brutal-input flex-1" name="note" placeholder="Optional note (who's this for?)" />
          <button className="brutal-btn-primary" type="submit">Generate invite token</button>
        </form>
        <ul className="space-y-1">
          {invites.length === 0 && <li className="opacity-60">No invites yet.</li>}
          {invites.map((inv) => {
            const base = '';
            const link = `${base}/register?token=${encodeURIComponent(inv.token)}`;
            return (
              <li key={inv.token} className="flex flex-wrap items-center gap-2 rounded-lg border border-black/5 px-3 py-2">
                <code className="break-all text-xs">{inv.token}</code>
                <span className="text-xs opacity-60">{inv.note ?? '—'}</span>
                {inv.usedByUserId ? (
                  <span className="rounded bg-black/5 px-2 py-0.5 text-xs">used by {userById.get(inv.usedByUserId)?.name ?? '?'}</span>
                ) : (
                  <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700">unused</span>
                )}
                <span className="flex-1" />
                <Link className="text-xs brutal-link hover:underline" href={link} target="_blank">
                  link
                </Link>
                {!inv.usedByUserId && (
                  <form action={deleteInvite}>
                    <input type="hidden" name="token" value={inv.token} />
                    <button className="brutal-btn-ghost text-xs" type="submit">delete</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Draw ------------------------------------------------------------- */}
      <section id="draw" className="brutal-card">
        <h2 className="mb-3 text-lg font-semibold">Run the draw</h2>
        <p className="mb-3 text-sm opacity-70">
          Randomly distributes the {teams.length} teams across the {users.length} players. Currently each player would get{' '}
          <strong>{users.length > 0 ? Math.floor(teams.length / users.length) : '—'}</strong> teams, with{' '}
          <strong>{users.length > 0 ? teams.length - Math.floor(teams.length / users.length) * users.length : '—'}</strong> teams left over.
        </p>
        <p className="mb-3 text-sm opacity-70">
          {leftoverCount > 0 || assignments.length > 0
            ? `A draw has already been run — re-running will replace everyone's teams.`
            : 'No draw has been run yet.'}
        </p>
        <form action={doDraw} className="flex flex-wrap items-center gap-2">
          <input
            className="brutal-input w-40"
            name="seed"
            placeholder="Optional seed (e.g. 42)"
            inputMode="numeric"
          />
          <button className="brutal-btn-primary" type="submit">Run / re-run draw</button>
        </form>
      </section>

      {/* Results ---------------------------------------------------------- */}
      <section id="results" className="brutal-card">
        <h2 className="mb-3 text-lg font-semibold">Results</h2>
        <p className="mb-3 text-sm opacity-70">Enter scores as matches finish. For KO ties, fill in penalty scores too.</p>
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase opacity-60">
              <tr>
                <th className="py-2">When</th>
                <th>Match</th>
                <th>Home</th>
                <th>Away</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fixtures.map((f) => {
                const home = f.homeTeamId ? teamById.get(f.homeTeamId) : undefined;
                const away = f.awayTeamId ? teamById.get(f.awayTeamId) : undefined;
                const knockout = f.stage !== 'GROUP';
                const needsTeamPick = !home || !away;
                return (
                  <tr key={f.id} className="border-t border-black/5 align-top">
                    <td className="py-2 text-xs whitespace-nowrap opacity-70">
                      {new Date(f.kickoff).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="text-xs">
                      <div className="opacity-60">{f.stage}{f.groupName ? ` ${f.groupName}` : ''}</div>
                      <div>
                        {home ? `${home.flag} ${home.name}` : (f.homeLabel ?? 'TBD')}
                        <span className="px-1 opacity-50">vs</span>
                        {away ? `${away.flag} ${away.name}` : (f.awayLabel ?? 'TBD')}
                      </div>
                      {needsTeamPick && (
                        <form action={setFixtureTeams} className="mt-1 flex gap-1">
                          <input type="hidden" name="id" value={f.id} />
                          <select name="home_team_id" defaultValue={f.homeTeamId ?? ''} className="brutal-input text-xs">
                            <option value="">— home —</option>
                            {teams.map((t) => (
                              <option key={t.id} value={t.id}>{t.flag} {t.name}</option>
                            ))}
                          </select>
                          <select name="away_team_id" defaultValue={f.awayTeamId ?? ''} className="brutal-input text-xs">
                            <option value="">— away —</option>
                            {teams.map((t) => (
                              <option key={t.id} value={t.id}>{t.flag} {t.name}</option>
                            ))}
                          </select>
                          <button className="brutal-btn-ghost text-xs" type="submit">save teams</button>
                        </form>
                      )}
                    </td>
                    <td>
                      <form action={setFixtureResult} className="flex flex-wrap items-center gap-1">
                        <input type="hidden" name="id" value={f.id} />
                        <input type="hidden" name="stage" value={f.stage} />
                        <input className="brutal-input w-14 text-center" name="home" defaultValue={f.homeScore ?? ''} placeholder="-" inputMode="numeric" />
                        <span className="opacity-50">–</span>
                        <input className="brutal-input w-14 text-center" name="away" defaultValue={f.awayScore ?? ''} placeholder="-" inputMode="numeric" />
                        {knockout && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs opacity-70">
                            pens
                            <input className="brutal-input w-10 text-center" name="home_pens" defaultValue={f.homePens ?? ''} placeholder="-" inputMode="numeric" />
                            <span className="opacity-50">–</span>
                            <input className="brutal-input w-10 text-center" name="away_pens" defaultValue={f.awayPens ?? ''} placeholder="-" inputMode="numeric" />
                          </span>
                        )}
                        <select className="brutal-input w-32 text-xs" name="status" defaultValue={f.status}>
                          <option value="SCHEDULED">Scheduled</option>
                          <option value="LIVE">Live</option>
                          <option value="FINISHED">Finished</option>
                        </select>
                        <button className="brutal-btn-primary text-xs" type="submit">save</button>
                      </form>
                    </td>
                    <td />
                    <td />
                    <td />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Prizes ----------------------------------------------------------- */}
      <section id="prizes" className="brutal-card">
        <h2 className="mb-3 text-lg font-semibold">Award prizes</h2>
        <ul className="space-y-2">
          {prizes.map((p) => (
            <li key={p.id} className="rounded-lg border border-black/5 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="brutal-pill text-xs tabular-nums">{Number(p.pctOfPot).toFixed(0)}%</span>
                <strong>{p.name}</strong>
                <span className="text-xs opacity-60">{p.description}</span>
              </div>
              <form action={awardPrize} className="mt-2 flex flex-wrap items-center gap-2">
                <input type="hidden" name="prize_id" value={p.id} />
                <select name="user_id" defaultValue={p.awardedUserId ?? ''} className="brutal-input w-64">
                  <option value="">— not awarded —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <button className="brutal-btn-primary text-xs" type="submit">save</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
