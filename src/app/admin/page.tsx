import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db, schema } from '@/db/client';
import { asc, desc, eq } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { runRandomDraw } from '@/lib/draw';
import { runPreferenceDraw, syncPolymarketPrices } from '@/lib/preference-draw-db';
import { submitScoreEdit } from '@/lib/score-edits';
import { fmtNzDateTime, nzZoneAbbr } from '@/lib/format';
import { getCurrentGroupInvite, rollGroupInvite } from '@/lib/group-invite-db';
import { formatTimeRemaining, validateInvite } from '@/lib/group-invite';
import { logAudit } from '@/lib/audit';
import { planBracketUpdate } from '@/lib/bracket';
import { runResultsSync } from '@/lib/results-sync-db';
import { OnboardingTab } from './_onboarding-tab';
import { AuditTab } from './_audit-tab';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const s = await getSession();
  if (!s.userId || !s.isAdmin) redirect('/login?error=admin');
  return s;
}

async function rollInviteAction() {
  'use server';
  const s = await requireAdmin();
  await rollGroupInvite(s.userId!);
  redirect('/admin?tab=invite');
}

async function doDraw(formData: FormData) {
  'use server';
  const s = await requireAdmin();
  const seedRaw = String(formData.get('seed') ?? '').trim();
  const seed = seedRaw ? Number.parseInt(seedRaw, 10) : undefined;
  const mode = String(formData.get('mode') ?? 'preference');
  if (mode === 'random') {
    await runRandomDraw(Number.isFinite(seed) ? seed : undefined);
  } else {
    await runPreferenceDraw(Number.isFinite(seed) ? seed : undefined);
  }
  await logAudit({
    userId: s.userId!,
    kind: 'draw.run',
    detail: `mode=${mode}${seedRaw ? ` seed=${seedRaw}` : ''}`,
  });
  redirect('/admin?tab=draw');
}

async function doPolymarketSync() {
  'use server';
  await requireAdmin();
  try {
    const r = await syncPolymarketPrices();
    redirect(`/admin?tab=draw&synced=${r.matched.length}&missing=${r.unmatched.length}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sync failed';
    redirect(`/admin?tab=draw&err=${encodeURIComponent(msg)}`);
  }
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
    redirect(`/admin?tab=results&err=${encodeURIComponent(msg)}`);
  }
  redirect('/admin?tab=results');
}

async function loadBracketInputs() {
  const [teams, fixtures] = await Promise.all([
    db.select().from(schema.teams),
    db.select().from(schema.fixtures),
  ]);
  return { teams, fixtures };
}

async function doResultsSync() {
  'use server';
  await requireAdmin();
  // Clanker attributes its own edits; no admin userId is recorded.
  let r: Awaited<ReturnType<typeof runResultsSync>>;
  try {
    r = await runResultsSync();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sync failed';
    redirect(`/admin?tab=results&err=${encodeURIComponent(msg)}`);
  }
  redirect(
    `/admin?tab=results&synced=${r.updated}&needsPens=${r.skipped['needs-pens']}&protectedCount=${r.skipped['human-edited']}`,
  );
}

async function applyBracketFills() {
  'use server';
  const s = await requireAdmin();
  // Recompute server-side rather than trusting anything from the form.
  const { teams, fixtures } = await loadBracketInputs();
  const { fills } = planBracketUpdate(fixtures, teams);
  for (const fill of fills) {
    await db
      .update(schema.fixtures)
      .set(fill.side === 'home' ? { homeTeamId: fill.teamId } : { awayTeamId: fill.teamId })
      .where(eq(schema.fixtures.id, fill.fixtureId));
  }
  await logAudit({
    userId: s.userId!,
    kind: 'bracket.autofill',
    detail: `${fills.length} slot${fills.length === 1 ? '' : 's'}`,
  });
  redirect('/admin?tab=results');
}

async function applyThirdChoice(formData: FormData) {
  'use server';
  const s = await requireAdmin();
  const fixtureId = Number(formData.get('fixture_id'));
  const side = String(formData.get('side')) === 'away' ? ('away' as const) : ('home' as const);
  const teamId = Number(formData.get('team_id'));
  const { teams, fixtures } = await loadBracketInputs();
  const choice = planBracketUpdate(fixtures, teams).choices.find(
    (c) => c.fixtureId === fixtureId && c.side === side,
  );
  if (!choice || !choice.candidateTeamIds.includes(teamId)) {
    redirect(`/admin?tab=results&err=${encodeURIComponent('Not a valid third-place pick for that slot')}`);
  }
  await db
    .update(schema.fixtures)
    .set(side === 'home' ? { homeTeamId: teamId } : { awayTeamId: teamId })
    .where(eq(schema.fixtures.id, fixtureId));
  await logAudit({
    userId: s.userId!,
    kind: 'bracket.third',
    detail: `fixture=${fixtureId} side=${side} team=${teamId}`,
  });
  redirect('/admin?tab=results');
}

async function setFixtureTeams(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = Number(formData.get('id'));
  const home = parseIntOrNull(formData.get('home_team_id'));
  const away = parseIntOrNull(formData.get('away_team_id'));
  await db.update(schema.fixtures).set({ homeTeamId: home, awayTeamId: away }).where(eq(schema.fixtures.id, id));
  redirect('/admin?tab=results');
}

async function awardPrize(formData: FormData) {
  'use server';
  const s = await requireAdmin();
  const id = Number(formData.get('prize_id'));
  const winner = parseIntOrNull(formData.get('user_id'));
  await db
    .update(schema.prizes)
    .set({ awardedUserId: winner, awardedAt: winner ? new Date() : null })
    .where(eq(schema.prizes.id, id));
  await logAudit({
    userId: s.userId!,
    targetUserId: winner ?? null,
    kind: winner ? 'prize.award' : 'prize.unaward',
    detail: `prize_id=${id}`,
  });
  redirect('/admin?tab=prizes');
}

async function togglePaid(formData: FormData) {
  'use server';
  const s = await requireAdmin();
  const id = Number(formData.get('user_id'));
  const paid = formData.get('paid') === 'on';
  await db.update(schema.users).set({ paid }).where(eq(schema.users.id, id));
  await logAudit({
    userId: s.userId!,
    targetUserId: id === s.userId ? null : id,
    kind: paid ? 'user.paid' : 'user.unpaid',
  });
  redirect('/admin?tab=players');
}

function parseIntOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

const TABS = [
  { id: 'players', label: 'Players' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'invite', label: 'Invite' },
  { id: 'draw', label: 'Draw' },
  { id: 'results', label: 'Results' },
  { id: 'prizes', label: 'Prizes' },
  { id: 'audit', label: 'Audit log' },
] as const;
type TabId = (typeof TABS)[number]['id'];
const TAB_IDS = new Set<string>(TABS.map((t) => t.id));

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; err?: string; synced?: string; needsPens?: string; protectedCount?: string }>;
}) {
  await requireAdmin();
  const { tab: rawTab, err, synced, needsPens, protectedCount } = await searchParams;
  const tab: TabId = (rawTab && TAB_IDS.has(rawTab) ? rawTab : 'players') as TabId;

  const [users, groupInvite, teams, fixtures, prizes, assignments] = await Promise.all([
    db.select().from(schema.users).orderBy(asc(schema.users.name)),
    getCurrentGroupInvite(),
    db.select().from(schema.teams).orderBy(asc(schema.teams.groupName)),
    db.select().from(schema.fixtures).orderBy(asc(schema.fixtures.kickoff)),
    db.select().from(schema.prizes).orderBy(asc(schema.prizes.sortOrder)),
    db.select().from(schema.teamAssignments),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const fixtureById = new Map(fixtures.map((f) => [f.id, f]));
  const bracketPlan = planBracketUpdate(fixtures, teams);

  // Build the share URL from the incoming request so it matches whatever
  // domain Railway is currently serving from. Falls back to the path-only
  // form if proxy headers aren't present.
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const baseUrl = host ? `${proto}://${host}` : '';
  const inviteState = validateInvite(groupInvite ?? null, new Date());
  const inviteLink = groupInvite ? `${baseUrl}/join/${encodeURIComponent(groupInvite.token)}` : null;
  const assignmentsByUser = new Map<number, number>();
  for (const a of assignments) {
    if (a.userId == null) continue;
    assignmentsByUser.set(a.userId, (assignmentsByUser.get(a.userId) ?? 0) + 1);
  }
  const leftoverCount = assignments.filter((a) => a.isLeftover).length;

  return (
    <div className="space-y-8">
      <div className="brutal-card">
        <h1 className="brutal-h1 brutal-heading-magenta">Admin</h1>
        <p className="text-sm opacity-100 mt-2">
          Invite players, run the draw, enter results, award prizes. Take it easy with the &ldquo;run draw&rdquo; button —
          it replaces everyone&rsquo;s existing teams.
        </p>
        <nav className="mt-4 flex flex-wrap gap-1">
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <Link
                key={t.id}
                href={`/admin?tab=${t.id}`}
                className={
                  active
                    ? 'brutal-tag-cyan text-xs whitespace-nowrap'
                    : 'border-[2px] border-current px-2 py-0.5 text-xs font-bold uppercase tracking-wide whitespace-nowrap hover:bg-cga-cyan hover:text-cga-black'
                }
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Players ---------------------------------------------------------- */}
      {tab === 'players' && (
      <section className="brutal-card">
        <h2 className="mb-3 text-lg font-semibold">Players ({users.length})</h2>
        <table className="w-full text-left text-sm table-row-hover">
          <thead className="text-xs uppercase opacity-100">
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
                <td className="py-2 font-medium">
                  <Link href={`/profile/${u.id}`} className="hover:underline decoration-2 underline-offset-2">
                    {u.name}
                  </Link>
                  {u.isAdmin && <span className="ml-1 rounded bg-neon-lime px-1.5 py-0.5 text-xs text-white">admin</span>}
                </td>
                <td className="opacity-100">{u.email}</td>
                <td className="text-right tabular-nums">{assignmentsByUser.get(u.id) ?? 0}</td>
                <td className="text-right">
                  <form action={togglePaid} className="inline-flex items-center gap-1">
                    <input type="hidden" name="user_id" value={u.id} />
                    <input type="checkbox" name="paid" defaultChecked={u.paid} id={`paid-${u.id}`} />
                    <button className="brutal-btn-ghost text-xs" type="submit" aria-label="save">save</button>
                  </form>
                </td>
                <td className="text-xs opacity-100">{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      )}

      {/* Onboarding ------------------------------------------------------- */}
      {tab === 'onboarding' && <OnboardingTab />}

      {/* Group invite ----------------------------------------------------- */}
      {tab === 'invite' && (
      <section className="brutal-card">
        <h2 className="brutal-h2">Group invite link</h2>
        <p className="text-sm opacity-100 mt-2">
          One rolling link the whole crew shares. Valid for 24h. Re-roll any time — old links stop working immediately.
        </p>
        {groupInvite && inviteState.ok ? (
          <div className="mt-4 border-[3px] border-current p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="brutal-tag-cyan text-xs">{formatTimeRemaining(groupInvite.expiresAt, new Date())}</span>
              <span className="text-xs opacity-100">created {fmtNzDateTime(groupInvite.createdAt)}</span>
            </div>
            <div className="mt-2">
              <code className="break-all text-xs">{inviteLink}</code>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link className="brutal-btn-cyan text-xs" href={`/join/${encodeURIComponent(groupInvite.token)}`} target="_blank">
                Open link →
              </Link>
              <form action={rollInviteAction}>
                <button className="brutal-btn-pink text-xs" type="submit">Re-roll (invalidates current link)</button>
              </form>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            {groupInvite && !inviteState.ok && (
              <p className="brutal-error mb-3 text-sm">
                Current link has {inviteState.reason === 'expired' ? 'expired' : 'a problem'}. Roll a new one.
              </p>
            )}
            <form action={rollInviteAction}>
              <button className="brutal-btn-primary" type="submit">Generate group invite link</button>
            </form>
          </div>
        )}
      </section>
      )}

      {/* Draw ------------------------------------------------------------- */}
      {tab === 'draw' && (
      <section className="brutal-card">
        <h2 className="brutal-h2">Run the draw</h2>
        <p className="mt-3 text-sm">
          Each player will get{' '}
          <strong>{users.length > 0 ? Math.floor(teams.length / users.length) : '—'}</strong> teams, with{' '}
          <strong>{users.length > 0 ? teams.length - Math.floor(teams.length / users.length) * users.length : '—'}</strong> teams left over.
        </p>
        <p className="mt-1 text-sm">
          {leftoverCount > 0 || assignments.length > 0
            ? `A draw has already been run — re-running will replace everyone's teams.`
            : 'No draw has been run yet.'}
        </p>

        <div className="mt-4 border-[3px] border-current p-3">
          <h3 className="text-sm font-bold uppercase">1. Sync Polymarket odds</h3>
          <p className="text-xs mt-1">
            Pulls current "yes" prices from Polymarket and stores them on each team. The preference draw uses these for the
            top-seed tiering + odds balancing.
          </p>
          <form action={doPolymarketSync} className="mt-2">
            <button className="brutal-btn-ghost text-xs" type="submit">Sync Polymarket odds</button>
          </form>
        </div>

        <div className="mt-3 border-[3px] border-current p-3">
          <h3 className="text-sm font-bold uppercase">2. Run draw</h3>
          <form action={doDraw} className="mt-2 flex flex-wrap items-center gap-2">
            <select className="brutal-input w-auto" name="mode" defaultValue="preference">
              <option value="preference">Preference-aware (top seed + balanced odds)</option>
              <option value="random">Pure random (legacy)</option>
            </select>
            <input
              className="brutal-input w-40"
              name="seed"
              placeholder="Optional seed (e.g. 42)"
              inputMode="numeric"
            />
            <button className="brutal-btn-primary" type="submit">Run / re-run draw</button>
          </form>
        </div>
      </section>
      )}

      {/* Results ---------------------------------------------------------- */}
      {tab === 'results' && (
      <section className="brutal-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Results</h2>
          <form action={doResultsSync}>
            <button className="brutal-btn-cyan text-xs" type="submit" title="Auto-update finished games from TheSportsDB. Skips anything a human has edited.">
              🤖 Sync results (clanker)
            </button>
          </form>
        </div>
        {err && <p className="brutal-error mb-3">{err}</p>}
        {synced != null && (
          <p className="brutal-card-inner mb-3 text-sm">
            <strong>clanker</strong> updated <strong>{synced}</strong> fixture{synced === '1' ? '' : 's'}.
            {Number(needsPens) > 0 && <> {needsPens} drawn KO game{needsPens === '1' ? '' : 's'} need penalties — enter those by hand.</>}
            {Number(protectedCount) > 0 && <> {protectedCount} left untouched (human-edited).</>}
          </p>
        )}
        <p className="mb-3 text-sm opacity-100">Enter scores as matches finish. For KO ties, fill in penalty scores too.</p>
        {(bracketPlan.fills.length > 0 || bracketPlan.choices.length > 0) && (
          <div className="brutal-card-inner mb-4">
            <h3 className="brutal-h2 mb-2">
              <span className="brutal-tag-cyan">Bracket</span> slots ready to fill
            </h3>
            {bracketPlan.fills.length > 0 && (
              <>
                <ul className="mb-3 space-y-1 text-sm">
                  {bracketPlan.fills.map((fill) => {
                    const fx = fixtureById.get(fill.fixtureId);
                    const team = teamById.get(fill.teamId);
                    return (
                      <li key={`${fill.fixtureId}-${fill.side}`}>
                        <span className="font-bold">{fx?.stage}</span> {fx?.venue} · {fill.label} →{' '}
                        {team ? `${team.flag} ${team.name}` : fill.teamId}
                      </li>
                    );
                  })}
                </ul>
                <form action={applyBracketFills}>
                  <button className="brutal-btn-cyan text-xs" type="submit">
                    Apply {bracketPlan.fills.length} fill{bracketPlan.fills.length === 1 ? '' : 's'}
                  </button>
                </form>
              </>
            )}
            {bracketPlan.choices.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs opacity-100">
                  Third-place slots FIFA leaves to the published bracket — pick to match the official draw:
                </p>
                {bracketPlan.choices.map((choice) => {
                  const fx = fixtureById.get(choice.fixtureId);
                  return (
                    <form key={`${choice.fixtureId}-${choice.side}`} action={applyThirdChoice} className="flex flex-wrap items-center gap-2 text-sm">
                      <input type="hidden" name="fixture_id" value={choice.fixtureId} />
                      <input type="hidden" name="side" value={choice.side} />
                      <span>
                        <span className="font-bold">{fx?.stage}</span> {fx?.venue} · {choice.label} ({choice.side})
                      </span>
                      <select name="team_id" className="brutal-input w-auto text-xs" defaultValue="">
                        <option value="" disabled>— pick third —</option>
                        {choice.candidateTeamIds.map((id) => {
                          const t = teamById.get(id);
                          return (
                            <option key={id} value={id}>
                              {t ? `${t.flag} ${t.name} (Grp ${t.groupName})` : id}
                            </option>
                          );
                        })}
                      </select>
                      <button className="brutal-btn-ghost text-xs" type="submit">save</button>
                    </form>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase opacity-100">
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
                    <td className="py-2 text-xs whitespace-nowrap opacity-100">
                      {fmtNzDateTime(f.kickoff)} {nzZoneAbbr(f.kickoff)}
                    </td>
                    <td className="text-xs">
                      <div className="opacity-100">{f.stage}{f.groupName ? ` ${f.groupName}` : ''}</div>
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
                          <span className="ml-2 inline-flex items-center gap-1 text-xs opacity-100">
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
      )}

      {/* Prizes ----------------------------------------------------------- */}
      {tab === 'prizes' && (
      <section className="brutal-card">
        <h2 className="mb-3 text-lg font-semibold">Award prizes</h2>
        <ul className="space-y-2">
          {prizes.map((p) => (
            <li key={p.id} className="rounded-lg border border-black/5 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="brutal-pill text-xs tabular-nums">{Number(p.pctOfPot).toFixed(0)}%</span>
                <strong>{p.name}</strong>
                <span className="text-xs opacity-100">{p.description}</span>
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
      )}

      {/* Audit log -------------------------------------------------------- */}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}
