import Link from 'next/link';
import { db, schema } from '@/db/client';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { avatarFor } from '@/lib/avatar';
import { displayName } from '@/lib/display-name';
import { gatherNicknames, tallyNicknameVotes, type NicknameAuditRow } from '@/lib/nicknames';
import { Avatar } from '../_avatar';
import NicknameVoteButton from './_vote-button';

export const dynamic = 'force-dynamic';

export default async function NicknamesPage() {
  const session = await getSession();

  const [auditRows, voteRows, users] = await Promise.all([
    db
      .select({
        kind: schema.auditEvents.kind,
        detail: schema.auditEvents.detail,
        userId: schema.auditEvents.userId,
        targetUserId: schema.auditEvents.targetUserId,
      })
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.kind, 'nickname.set')),
    db
      .select({ nickname: schema.nicknameVotes.nickname, userId: schema.nicknameVotes.userId })
      .from(schema.nicknameVotes),
    db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        nickname: schema.users.nickname,
        email: schema.users.email,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.users),
  ]);

  const options = gatherNicknames(auditRows as NicknameAuditRow[]);
  const ranked = tallyNicknameVotes(options, voteRows);
  const userById = new Map(users.map((u) => [u.id, u] as const));
  const myVotes = new Set(voteRows.filter((v) => v.userId === session.userId).map((v) => v.nickname));
  const totalVotes = voteRows.length;

  return (
    <div className="space-y-6">
      <div className="brutal-card">
        <h1 className="brutal-h1 brutal-heading-magenta">Nickname Hall of Fame</h1>
        <p className="mt-2 text-sm opacity-100">
          Every nickname ever slapped on someone — pulled straight from the audit log, retired ones
          and all. Thumbs-up as many as you like; the crew&rsquo;s favourites rise to the top.
        </p>
        <p className="mt-2 text-xs uppercase font-bold opacity-100">
          {ranked.length} nickname{ranked.length === 1 ? '' : 's'} · {totalVotes} vote
          {totalVotes === 1 ? '' : 's'} cast
          {!session.userId && (
            <>
              {' · '}
              <Link className="brutal-link" href="/login">sign in</Link> to vote
            </>
          )}
        </p>
      </div>

      {ranked.length === 0 ? (
        <div className="brutal-card">
          <p className="text-sm opacity-100">
            No nicknames yet. Go tag someone on their{' '}
            <Link className="brutal-link" href="/profile">profile</Link> and check back.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {ranked.map((n, i) => {
            const voted = myVotes.has(n.key);
            const tagged = n.taggedUserIds.map((id) => userById.get(id)).filter(Boolean);
            return (
              <li key={n.key} className="brutal-card flex flex-wrap items-center gap-4">
                <div className="min-w-[2.5rem] text-center text-2xl font-black tabular-nums">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-black">&ldquo;{n.label}&rdquo;</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs opacity-100">
                    <span>assigned {n.assignedCount}×</span>
                    {tagged.length > 0 && <span aria-hidden>·</span>}
                    {tagged.map(
                      (u) =>
                        u && (
                          <Link
                            key={u.id}
                            href={`/profile/${u.id}`}
                            className="inline-flex items-center gap-1 hover:underline"
                            title={displayName(u)}
                          >
                            <Avatar src={avatarFor({ email: u.email, avatarUrl: u.avatarUrl }, 32)} name={u.name} size={18} />
                            <span>{u.name}</span>
                          </Link>
                        ),
                    )}
                  </div>
                </div>
                <NicknameVoteButton
                  nickname={n.key}
                  initialVoted={voted}
                  initialCount={n.votes}
                  signedIn={!!session.userId}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
