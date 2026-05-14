import Link from 'next/link';
import { db, schema } from '@/db/client';
import { desc } from 'drizzle-orm';
import { displayName } from '@/lib/display-name';
import { fmtNzDateTime } from '@/lib/format';

const FEED_LIMIT = 60;

type FeedItem = {
  when: Date;
  kind: string;
  actorId: number | null;
  actorName: string | null;
  actorNickname: string | null;
  detail: React.ReactNode;
};

/**
 * Admin tab: chronological audit timeline. Unions
 *   - audit_events (manual entries for avatar / nickname / curse-lift /
 *     draw / prize / paid-toggle)
 *   - score_edits  (fixture result changes)
 *   - profile_jabs (wall-of-shame posts; includes soft-deleted with a tag)
 *   - burns        (sitewide banner posts)
 *   - team_curses  (curse-cast events; lifts come from audit_events)
 *   - match_comments (per-fixture chat; includes soft-deleted with a tag)
 *
 * Each row is shaped into a unified FeedItem and rendered newest-first.
 */
export async function AuditTab() {
  const [audit, scoreEdits, jabs, burns, curses, comments, users, teams, fixtures] = await Promise.all([
    db
      .select()
      .from(schema.auditEvents)
      .orderBy(desc(schema.auditEvents.createdAt))
      .limit(FEED_LIMIT),
    db.select().from(schema.scoreEdits).orderBy(desc(schema.scoreEdits.createdAt)).limit(FEED_LIMIT),
    db.select().from(schema.profileJabs).orderBy(desc(schema.profileJabs.createdAt)).limit(FEED_LIMIT),
    db.select().from(schema.burns).orderBy(desc(schema.burns.createdAt)).limit(FEED_LIMIT),
    db.select().from(schema.teamCurses).orderBy(desc(schema.teamCurses.createdAt)).limit(FEED_LIMIT),
    db.select().from(schema.matchComments).orderBy(desc(schema.matchComments.createdAt)).limit(FEED_LIMIT),
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

  // 1) audit_events — already shaped.
  for (const e of audit) {
    const actor = userById.get(e.userId);
    items.push({
      when: e.createdAt,
      kind: e.kind,
      actorId: e.userId,
      actorName: actor?.name ?? null,
      actorNickname: actor?.nickname ?? null,
      detail: (
        <span>
          {fmtUser(e.userId)} <span className="opacity-100">{labelFor(e.kind)}</span>{' '}
          {e.targetUserId != null && fmtUser(e.targetUserId)}
          {e.detail && <span className="text-xs opacity-100 ml-1">[{truncate(e.detail, 60)}]</span>}
        </span>
      ),
    });
  }

  // 2) score_edits.
  for (const r of scoreEdits) {
    items.push({
      when: r.createdAt,
      kind: 'score.edit',
      actorId: r.userId,
      actorName: userById.get(r.userId)?.name ?? null,
      actorNickname: userById.get(r.userId)?.nickname ?? null,
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
          {r.note && <span className="ml-1 text-xs opacity-100">"{truncate(r.note, 50)}"</span>}
        </span>
      ),
    });
  }

  // 3) profile_jabs.
  for (const r of jabs) {
    items.push({
      when: r.createdAt,
      kind: 'jab.post',
      actorId: r.authorUserId,
      actorName: userById.get(r.authorUserId)?.name ?? null,
      actorNickname: userById.get(r.authorUserId)?.nickname ?? null,
      detail: (
        <span>
          {fmtUser(r.authorUserId)} <span className="opacity-100">jabbed</span> {fmtUser(r.targetUserId)}: "
          {truncate(r.body, 80)}"
          {r.deletedAt && <span className="ml-1 text-xs opacity-50">(hidden)</span>}
        </span>
      ),
    });
  }

  // 4) burns.
  for (const r of burns) {
    items.push({
      when: r.createdAt,
      kind: 'burn.post',
      actorId: r.userId,
      actorName: userById.get(r.userId)?.name ?? null,
      actorNickname: userById.get(r.userId)?.nickname ?? null,
      detail: (
        <span>
          {fmtUser(r.userId)} <span className="opacity-100">dropped a burn:</span> "{truncate(r.body, 80)}"
          {r.dismissedAt && <span className="ml-1 text-xs opacity-50">(dismissed)</span>}
        </span>
      ),
    });
  }

  // 5) team_curses (casts).
  for (const r of curses) {
    items.push({
      when: r.createdAt,
      kind: 'curse.cast',
      actorId: r.userId,
      actorName: userById.get(r.userId)?.name ?? null,
      actorNickname: userById.get(r.userId)?.nickname ?? null,
      detail: (
        <span>
          {fmtUser(r.userId)} <span className="opacity-100">cursed</span> {fmtTeam(r.teamId)}
          {r.curseText && <span className="ml-1 text-xs opacity-100">"{truncate(r.curseText, 60)}"</span>}
        </span>
      ),
    });
  }

  // 6) match_comments.
  for (const r of comments) {
    items.push({
      when: r.createdAt,
      kind: 'comment.post',
      actorId: r.userId,
      actorName: userById.get(r.userId)?.name ?? null,
      actorNickname: userById.get(r.userId)?.nickname ?? null,
      detail: (
        <span>
          {fmtUser(r.userId)} <span className="opacity-100">commented on</span> {fmtFixture(r.fixtureId)}: "
          {truncate(r.body, 80)}"
          {r.deletedAt && <span className="ml-1 text-xs opacity-50">(hidden)</span>}
        </span>
      ),
    });
  }

  items.sort((a, b) => b.when.getTime() - a.when.getTime());
  const top = items.slice(0, FEED_LIMIT);

  return (
    <section className="brutal-card">
      <h2 className="brutal-h2">Audit log</h2>
      <p className="text-sm opacity-100 mt-2">
        Chronological feed of recent activity. Covers profile hijacks (avatars + nicknames), curse casts and lifts,
        sitewide burns, wall-of-shame jabs, match comments, score edits, prize awards, and draw runs. Top {FEED_LIMIT}{' '}
        events.
      </p>
      <ul className="mt-4 space-y-1">
        {top.length === 0 && <li className="opacity-100 text-sm">Nothing happening yet.</li>}
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
    </section>
  );
}

/**
 * Convert dotted audit-event kinds into readable verb phrases. Falls back
 * to the raw kind so a future event type still renders something.
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
