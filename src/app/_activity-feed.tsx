import Link from 'next/link';
import { db, schema } from '@/db/client';
import { desc } from 'drizzle-orm';
import { displayName } from '@/lib/display-name';
import { fmtNzDateTime } from '@/lib/format';

type FeedItem = {
  when: Date;
  kind: string;
  detail: React.ReactNode;
};

/**
 * Server component: a chronological cross-table activity feed. Used by the
 * admin "Audit log" tab (full-size) and the homepage "Latest cunting" widget
 * (compact). Pulls newest N rows from each source table, unions, sorts by
 * timestamp desc, and renders as a list.
 *
 * Sources (newest each):
 *   audit_events    — avatar / nickname / curse-lift / draw / prize / paid
 *   score_edits     — fixture result changes
 *   profile_jabs    — wall-of-shame posts (soft-deleted included with tag)
 *   burns           — sitewide banner posts (dismissed tagged)
 *   team_curses     — curse-cast events (lifts go via audit_events)
 *   match_comments  — per-fixture chat (soft-deleted tagged)
 */
export async function ActivityFeed({ limit = 60 }: { limit?: number }) {
  // Per-source fetch limit. The widget asks for ~8 items, the admin tab for
  // 60; either way we never need more than ~60 from any single source.
  const perSource = Math.min(60, Math.max(limit, 20));

  const [audit, scoreEdits, jabs, burns, curses, comments, users, teams, fixtures] = await Promise.all([
    db.select().from(schema.auditEvents).orderBy(desc(schema.auditEvents.createdAt)).limit(perSource),
    db.select().from(schema.scoreEdits).orderBy(desc(schema.scoreEdits.createdAt)).limit(perSource),
    db.select().from(schema.profileJabs).orderBy(desc(schema.profileJabs.createdAt)).limit(perSource),
    db.select().from(schema.burns).orderBy(desc(schema.burns.createdAt)).limit(perSource),
    db.select().from(schema.teamCurses).orderBy(desc(schema.teamCurses.createdAt)).limit(perSource),
    db.select().from(schema.matchComments).orderBy(desc(schema.matchComments.createdAt)).limit(perSource),
    db.select().from(schema.users),
    db.select().from(schema.teams),
    db.select().from(schema.fixtures),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const fixtureById = new Map(fixtures.map((f) => [f.id, f]));

  const fmtUser = (id: number | null | undefined) => {
    if (id == null) return null;
    const u = userById.get(id);
    if (!u) return null;
    return (
      <Link href={`/profile/${u.id}`} className="font-bold hover:underline decoration-2 underline-offset-2">
        {displayName(u)}
      </Link>
    );
  };
  const fmtTeam = (id: number | null | undefined) => {
    if (id == null) return null;
    const t = teamById.get(id);
    return t ? <span>{t.flag} {t.name}</span> : <span className="opacity-50">team #{id}</span>;
  };
  const fmtFixture = (id: number | null | undefined) => {
    if (id == null) return null;
    const f = fixtureById.get(id);
    if (!f) return <span className="opacity-50">fixture #{id}</span>;
    const home = f.homeTeamId ? teamById.get(f.homeTeamId)?.code : null;
    const away = f.awayTeamId ? teamById.get(f.awayTeamId)?.code : null;
    return (
      <Link href={`/match/${f.id}`} className="hover:underline decoration-2 underline-offset-2">
        {home ?? f.homeLabel ?? 'TBD'} vs {away ?? f.awayLabel ?? 'TBD'}
      </Link>
    );
  };
  const truncate = (s: string | null | undefined, n = 80) => {
    if (!s) return '';
    return s.length > n ? `${s.slice(0, n)}…` : s;
  };

  const items: FeedItem[] = [];

  for (const e of audit) {
    items.push({
      when: e.createdAt,
      kind: e.kind,
      detail: (
        <span>
          {fmtUser(e.userId)} <span className="opacity-100">{labelFor(e.kind)}</span>{' '}
          {e.targetUserId != null && fmtUser(e.targetUserId)}
          {e.detail && <span className="text-xs opacity-100 ml-1">[{truncate(e.detail, 60)}]</span>}
        </span>
      ),
    });
  }

  for (const r of scoreEdits) {
    items.push({
      when: r.createdAt,
      kind: 'score.edit',
      detail: (
        <span>
          {fmtUser(r.userId)} <span className="opacity-100">edited score on</span> {fmtFixture(r.fixtureId)}{' '}
          <strong>
            {r.homeScore ?? '—'}–{r.awayScore ?? '—'}
          </strong>
          {r.homePens != null && r.awayPens != null && (
            <strong className="ml-1 text-xs">(pens {r.homePens}–{r.awayPens})</strong>
          )}
          <span className="ml-1 text-xs opacity-100">[{r.status}]</span>
          {r.note && <span className="ml-1 text-xs opacity-100">&ldquo;{truncate(r.note, 50)}&rdquo;</span>}
        </span>
      ),
    });
  }

  for (const r of jabs) {
    items.push({
      when: r.createdAt,
      kind: 'jab.post',
      detail: (
        <span>
          {fmtUser(r.authorUserId)} <span className="opacity-100">jabbed</span> {fmtUser(r.targetUserId)}:{' '}
          &ldquo;{truncate(r.body, 80)}&rdquo;
          {r.deletedAt && <span className="ml-1 text-xs opacity-50">(hidden)</span>}
        </span>
      ),
    });
  }

  for (const r of burns) {
    items.push({
      when: r.createdAt,
      kind: 'burn.post',
      detail: (
        <span>
          {fmtUser(r.userId)} <span className="opacity-100">dropped a burn:</span>{' '}
          &ldquo;{truncate(r.body, 80)}&rdquo;
          {r.dismissedAt && <span className="ml-1 text-xs opacity-50">(dismissed)</span>}
        </span>
      ),
    });
  }

  for (const r of curses) {
    items.push({
      when: r.createdAt,
      kind: 'curse.cast',
      detail: (
        <span>
          {fmtUser(r.userId)} <span className="opacity-100">cursed</span> {fmtTeam(r.teamId)}
          {r.curseText && (
            <span className="ml-1 text-xs opacity-100">&ldquo;{truncate(r.curseText, 60)}&rdquo;</span>
          )}
        </span>
      ),
    });
  }

  for (const r of comments) {
    items.push({
      when: r.createdAt,
      kind: 'comment.post',
      detail: (
        <span>
          {fmtUser(r.userId)} <span className="opacity-100">commented on</span> {fmtFixture(r.fixtureId)}:{' '}
          &ldquo;{truncate(r.body, 80)}&rdquo;
          {r.deletedAt && <span className="ml-1 text-xs opacity-50">(hidden)</span>}
        </span>
      ),
    });
  }

  items.sort((a, b) => b.when.getTime() - a.when.getTime());
  const top = items.slice(0, limit);

  if (top.length === 0) {
    return <p className="opacity-100 text-sm">Nothing happening yet.</p>;
  }

  return (
    <ul className="space-y-1">
      {top.map((it, i) => (
        <li
          key={`${it.kind}-${it.when.getTime()}-${i}`}
          className="flex items-baseline gap-3 border-t border-current/10 py-2 text-sm"
        >
          <span className="brutal-pill text-[10px] leading-none whitespace-nowrap">{it.kind}</span>
          <span className="min-w-0 flex-1">{it.detail}</span>
          <span className="text-xs opacity-100 whitespace-nowrap">{fmtNzDateTime(it.when)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Map dotted audit-event kinds onto readable verb phrases. Falls back to the
 * raw kind so a future event type still renders something.
 */
function labelFor(kind: string): string {
  switch (kind) {
    case 'avatar.set':
      return 'changed an avatar for';
    case 'avatar.clear':
      return 'cleared an avatar for';
    case 'nickname.set':
      return 'set a nickname on';
    case 'nickname.clear':
      return 'cleared a nickname on';
    case 'curse.lift':
      return 'lifted a curse';
    case 'draw.run':
      return 'ran the draw';
    case 'prize.award':
      return 'awarded a prize to';
    case 'prize.unaward':
      return 'unset a prize awarded to';
    case 'user.paid':
      return 'marked as paid';
    case 'user.unpaid':
      return 'marked as unpaid';
    default:
      return kind;
  }
}
