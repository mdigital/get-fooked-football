/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db, schema } from '@/db/client';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { submitScoreEdit, getEditHistory } from '@/lib/score-edits';
import { saveUploadedImage } from '@/lib/uploads';
import { pointsForFixture } from '@/lib/scoring';
import { fmtNzDateTime, nzZoneAbbr } from '@/lib/format';
import { avatarFor } from '@/lib/avatar';
import { displayName } from '@/lib/display-name';
import {
  aggregateReactions,
  clampEmoji,
  parseMentions,
  validateCommentBody,
  MAX_COMMENT_LEN,
} from '@/lib/match-chat';
import PasteImageField from './_paste-image';
import { Avatar } from '../../_avatar';
import { UserLink } from '../../_user-link';

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

function parseIntOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

async function updateScore(formData: FormData) {
  'use server';
  const s = await getSession();
  if (!s.userId) redirect('/login');
  const id = Number(formData.get('id'));
  const stage = String(formData.get('stage') ?? 'GROUP');
  try {
    await submitScoreEdit({
      fixtureId: id,
      userId: s.userId,
      stage,
      status: String(formData.get('status') ?? 'FINISHED'),
      homeScore: parseIntOrNull(formData.get('home')),
      awayScore: parseIntOrNull(formData.get('away')),
      homeScoreEt: parseIntOrNull(formData.get('home_et')),
      awayScoreEt: parseIntOrNull(formData.get('away_et')),
      homePens: parseIntOrNull(formData.get('home_pens')),
      awayPens: parseIntOrNull(formData.get('away_pens')),
      note: String(formData.get('note') ?? '').trim() || null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed';
    redirect(`/match/${id}?err=${encodeURIComponent(msg)}`);
  }
  redirect(`/match/${id}`);
}

async function postComment(formData: FormData) {
  'use server';
  const s = await getSession();
  if (!s.userId) redirect('/login');
  const fixtureId = Number(formData.get('fixture_id'));
  const file = formData.get('image');

  let imagePath: string | null = null;
  if (file instanceof File && file.size > 0) {
    try {
      imagePath = await saveUploadedImage(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'upload-failed';
      redirect(`/match/${fixtureId}?err=${encodeURIComponent(msg)}#chat`);
    }
  }

  const result = validateCommentBody(formData.get('body'), imagePath !== null);
  if (!result.ok) redirect(`/match/${fixtureId}?err=${result.reason}#chat`);

  await db.insert(schema.matchComments).values({
    fixtureId,
    userId: s.userId!,
    body: result.body,
    imagePath,
  });
  redirect(`/match/${fixtureId}#chat`);
}

async function toggleReaction(formData: FormData) {
  'use server';
  const s = await getSession();
  if (!s.userId) redirect('/login');
  const commentId = Number(formData.get('comment_id'));
  const fixtureId = Number(formData.get('fixture_id'));
  const emoji = clampEmoji(String(formData.get('emoji') ?? ''));
  if (!emoji) redirect(`/match/${fixtureId}#chat`);

  // Toggle: if this (user, comment, emoji) reaction exists, remove it; else add.
  const existing = await db
    .select()
    .from(schema.commentReactions)
    .where(
      and(
        eq(schema.commentReactions.commentId, commentId),
        eq(schema.commentReactions.userId, s.userId!),
        eq(schema.commentReactions.emoji, emoji),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .delete(schema.commentReactions)
      .where(
        and(
          eq(schema.commentReactions.commentId, commentId),
          eq(schema.commentReactions.userId, s.userId!),
          eq(schema.commentReactions.emoji, emoji),
        ),
      );
  } else {
    await db.insert(schema.commentReactions).values({ commentId, userId: s.userId!, emoji });
  }
  redirect(`/match/${fixtureId}#chat`);
}

async function deleteComment(formData: FormData) {
  'use server';
  const s = await getSession();
  if (!s.userId) redirect('/login');
  const commentId = Number(formData.get('comment_id'));
  const fixtureId = Number(formData.get('fixture_id'));
  const [row] = await db.select().from(schema.matchComments).where(eq(schema.matchComments.id, commentId)).limit(1);
  if (!row) redirect(`/match/${fixtureId}#chat`);
  if (row.userId !== s.userId && !s.isAdmin) redirect(`/match/${fixtureId}#chat`);
  await db
    .update(schema.matchComments)
    .set({ deletedAt: new Date() })
    .where(eq(schema.matchComments.id, commentId));
  redirect(`/match/${fixtureId}#chat`);
}

const QUICK_REACTS = ['🔥', '😂', '⚽', '😭', '👏', '💀', '🤡', '🐑', '👑', '🇳🇿', '🇦🇷', '💯'];

export default async function MatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { id: rawId } = await params;
  const { err } = await searchParams;
  const id = Number(rawId);
  if (!Number.isFinite(id)) notFound();
  const session = await getSession();

  const [fixture] = await db.select().from(schema.fixtures).where(eq(schema.fixtures.id, id)).limit(1);
  if (!fixture) notFound();
  const teams = await db.select().from(schema.teams);
  const teamById = new Map(teams.map((t) => [t.id, t] as const));
  const home = fixture.homeTeamId ? teamById.get(fixture.homeTeamId) : undefined;
  const away = fixture.awayTeamId ? teamById.get(fixture.awayTeamId) : undefined;

  // Comments + their authors. Soft-deleted comments are filtered out at the
  // query level — we never want to render the body of a removed message.
  const comments = await db
    .select({
      id: schema.matchComments.id,
      body: schema.matchComments.body,
      imagePath: schema.matchComments.imagePath,
      createdAt: schema.matchComments.createdAt,
      userId: schema.matchComments.userId,
      userName: schema.users.name,
      userNickname: schema.users.nickname,
      userEmail: schema.users.email,
      userAvatar: schema.users.avatarUrl,
    })
    .from(schema.matchComments)
    .leftJoin(schema.users, eq(schema.users.id, schema.matchComments.userId))
    .where(and(eq(schema.matchComments.fixtureId, id), isNull(schema.matchComments.deletedAt)))
    .orderBy(asc(schema.matchComments.createdAt));

  // All reactions for the visible comments, joined to user names for the
  // hover-list. One query keeps it O(1) round-trips.
  const reactionRows =
    comments.length > 0
      ? await db
          .select({
            commentId: schema.commentReactions.commentId,
            emoji: schema.commentReactions.emoji,
            userId: schema.commentReactions.userId,
            userName: schema.users.name,
            userNickname: schema.users.nickname,
          })
          .from(schema.commentReactions)
          .leftJoin(schema.users, eq(schema.users.id, schema.commentReactions.userId))
          .where(inArray(schema.commentReactions.commentId, comments.map((c) => c.id)))
          .orderBy(asc(schema.commentReactions.createdAt))
      : [];

  const reactionsByComment = new Map<number, Array<{ emoji: string; userId: number; userName: string }>>();
  for (const r of reactionRows) {
    const arr = reactionsByComment.get(r.commentId) ?? [];
    const renderedName = r.userName
      ? displayName({ name: r.userName, nickname: r.userNickname })
      : '?';
    arr.push({ emoji: r.emoji, userId: r.userId, userName: renderedName });
    reactionsByComment.set(r.commentId, arr);
  }

  // For @-mention parsing — every user in the system is fair game.
  const allUsers = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users);

  const history = await getEditHistory(id);
  const points = pointsForFixture(fixture);
  const knockout = fixture.stage !== 'GROUP';

  return (
    <div className="space-y-6">
      <div className="brutal-card">
        <Link href="/fixtures" className="text-sm font-bold underline">
          ← All fixtures
        </Link>
        <div className="mt-2 text-xs font-bold uppercase tracking-widest">
          {STAGE_LABEL[fixture.stage] ?? fixture.stage}
          {fixture.groupName ? ` · ${fixture.groupName}` : ''}
          {' · '}
          {fmtNzDateTime(fixture.kickoff)} {nzZoneAbbr(fixture.kickoff)}
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="text-right text-2xl font-black">
            <div className="text-4xl">{home?.flag ?? '🏳️'}</div>
            <div>{home?.name ?? fixture.homeLabel ?? 'TBD'}</div>
          </div>
          <div className="text-center text-5xl font-black tabular-nums">
            {fixture.status === 'FINISHED' ? `${fixture.homeScore}–${fixture.awayScore}` : 'vs'}
            {fixture.homePens != null && fixture.awayPens != null && (
              <div className="text-base font-bold opacity-100">
                pens {fixture.homePens}–{fixture.awayPens}
              </div>
            )}
          </div>
          <div className="text-2xl font-black">
            <div className="text-4xl">{away?.flag ?? '🏳️'}</div>
            <div>{away?.name ?? fixture.awayLabel ?? 'TBD'}</div>
          </div>
        </div>

        {fixture.status === 'FINISHED' && (
          <div className="mt-4 flex justify-center gap-3 text-sm font-bold">
            <span className="brutal-pill">{home?.code ?? 'H'} +{points.home} pts</span>
            <span className="brutal-pill">{away?.code ?? 'A'} +{points.away} pts</span>
          </div>
        )}
      </div>

      {/* Chat -------------------------------------------------------------- */}
      <div id="chat" className="brutal-card">
        <h2 className="brutal-h2">Match chat</h2>
        <p className="text-sm opacity-100 mt-1">
          Trash-talk in real time. Drop an image or paste a sticker. Type <code className="brutal-pill text-xs">@Name</code> to mention someone.
        </p>

        {err && <p className="brutal-error mt-3">{decodeURIComponent(err)}</p>}

        <ul className="mt-4 space-y-3">
          {comments.length === 0 && (
            <li className="opacity-100 text-sm">No comments yet — be the first.</li>
          )}
          {comments.map((c) => {
            const aggs = aggregateReactions(reactionsByComment.get(c.id) ?? [], session.userId ?? null);
            const spans = parseMentions(c.body, allUsers);
            const canDelete = session.userId != null && (c.userId === session.userId || session.isAdmin);
            const commenter = c.userName
              ? displayName({ name: c.userName, nickname: c.userNickname })
              : 'someone';
            return (
              <li key={c.id} className="border-[3px] border-current p-3">
                <div className="flex items-start gap-3">
                  <Link href={`/profile/${c.userId}`} aria-label={`${commenter}'s profile`}>
                    <Avatar
                      src={avatarFor({ email: c.userEmail ?? '', avatarUrl: c.userAvatar ?? null }, 48)}
                      name={commenter}
                      size={28}
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline flex-wrap gap-2">
                      <UserLink userId={c.userId} name={commenter} className="font-bold" />
                      <span className="text-xs opacity-100">{fmtNzDateTime(c.createdAt)}</span>
                    </div>
                    {c.body && (
                      <div className="mt-1 whitespace-pre-wrap break-words text-sm">
                        {spans.map((s, i) =>
                          s.type === 'mention' ? (
                            <span key={i} className="brutal-tag-magenta text-xs mx-0.5 align-baseline">@{s.value}</span>
                          ) : (
                            <span key={i}>{s.value}</span>
                          ),
                        )}
                      </div>
                    )}
                    {c.imagePath && (
                      <a href={c.imagePath} target="_blank" rel="noreferrer" className="mt-2 inline-block">
                        <img
                          src={c.imagePath}
                          alt="attached image"
                          className="max-h-64 max-w-full border-[3px] border-current"
                        />
                      </a>
                    )}

                    {aggs.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {aggs.map((a) => (
                          <form key={a.emoji} action={toggleReaction}>
                            <input type="hidden" name="comment_id" value={c.id} />
                            <input type="hidden" name="fixture_id" value={id} />
                            <input type="hidden" name="emoji" value={a.emoji} />
                            <button
                              type="submit"
                              title={a.names.join(', ')}
                              className={`brutal-pill text-xs cursor-pointer ${a.mine ? 'bg-cga-cyan text-cga-black' : ''}`}
                            >
                              <span className="mr-1">{a.emoji}</span>
                              <span className="tabular-nums">{a.count}</span>
                            </button>
                          </form>
                        ))}
                      </div>
                    )}

                    {session.userId && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs uppercase font-bold opacity-100 select-none">+ react</summary>
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          {QUICK_REACTS.map((e) => (
                            <form key={e} action={toggleReaction}>
                              <input type="hidden" name="comment_id" value={c.id} />
                              <input type="hidden" name="fixture_id" value={id} />
                              <input type="hidden" name="emoji" value={e} />
                              <button type="submit" className="brutal-emoji-btn h-8 w-8 text-base">{e}</button>
                            </form>
                          ))}
                          <form action={toggleReaction} className="flex items-center gap-1 ml-2">
                            <input type="hidden" name="comment_id" value={c.id} />
                            <input type="hidden" name="fixture_id" value={id} />
                            <input
                              className="brutal-input w-20 text-center text-base"
                              name="emoji"
                              placeholder="🙂"
                              maxLength={4}
                              required
                            />
                            <button type="submit" className="brutal-btn-ghost text-xs">add</button>
                          </form>
                        </div>
                      </details>
                    )}
                  </div>

                  {canDelete && (
                    <form action={deleteComment}>
                      <input type="hidden" name="comment_id" value={c.id} />
                      <input type="hidden" name="fixture_id" value={id} />
                      <button type="submit" className="brutal-btn-ghost text-xs" title="Delete">✕</button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {session.userId ? (
          <form action={postComment} encType="multipart/form-data" className="mt-4 brutal-card-inner space-y-2">
            <textarea
              name="body"
              rows={2}
              maxLength={MAX_COMMENT_LEN}
              placeholder="Say something. @Name to ping someone."
              className="brutal-input"
            />
            <PasteImageField />
            <input type="hidden" name="fixture_id" value={id} />
            <div className="flex justify-end">
              <button type="submit" className="brutal-btn-primary">Send</button>
            </div>
          </form>
        ) : (
          <p className="mt-4 text-sm">
            <Link href="/login" className="brutal-link">Sign in</Link> to join the chat.
          </p>
        )}
      </div>

      <div className="brutal-card">
        <h2 className="brutal-h2">Update the score</h2>
        <p className="text-sm opacity-100">
          Anyone in the league can post a result — but every edit is logged below, so don’t go full Fergie time.
        </p>
        {session.userId ? (
          <form action={updateScore} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto]">
            <input type="hidden" name="id" value={fixture.id} />
            <input type="hidden" name="stage" value={fixture.stage} />
            <div className="flex items-center gap-2">
              <label className="text-sm">{home?.name ?? 'Home'}</label>
              <input className="brutal-input w-16 text-center" name="home" defaultValue={fixture.homeScore ?? ''} inputMode="numeric" />
            </div>
            <div className="self-center text-2xl font-black">–</div>
            <div className="flex items-center gap-2">
              <input className="brutal-input w-16 text-center" name="away" defaultValue={fixture.awayScore ?? ''} inputMode="numeric" />
              <label className="text-sm">{away?.name ?? 'Away'}</label>
            </div>
            <select className="brutal-input" name="status" defaultValue={fixture.status}>
              <option value="SCHEDULED">Scheduled</option>
              <option value="LIVE">Live</option>
              <option value="FINISHED">Finished</option>
            </select>
            {knockout && (
              <>
                <div className="col-span-full text-xs font-bold uppercase opacity-100">Extra time / penalties (if needed)</div>
                <div className="flex items-center gap-2">
                  <label className="text-sm">ET home</label>
                  <input className="brutal-input w-16 text-center" name="home_et" defaultValue={fixture.homeScoreEt ?? ''} inputMode="numeric" />
                </div>
                <div className="self-center">–</div>
                <div className="flex items-center gap-2">
                  <input className="brutal-input w-16 text-center" name="away_et" defaultValue={fixture.awayScoreEt ?? ''} inputMode="numeric" />
                  <label className="text-sm">ET away</label>
                </div>
                <div />
                <div className="flex items-center gap-2">
                  <label className="text-sm">Pens home</label>
                  <input className="brutal-input w-16 text-center" name="home_pens" defaultValue={fixture.homePens ?? ''} inputMode="numeric" />
                </div>
                <div className="self-center">–</div>
                <div className="flex items-center gap-2">
                  <input className="brutal-input w-16 text-center" name="away_pens" defaultValue={fixture.awayPens ?? ''} inputMode="numeric" />
                  <label className="text-sm">Pens away</label>
                </div>
                <div />
              </>
            )}
            <input className="brutal-input col-span-full" name="note" placeholder="Optional note (source, who told you, etc.)" maxLength={200} />
            <div className="col-span-full">
              <button className="brutal-btn-primary" type="submit">Save score</button>
            </div>
          </form>
        ) : (
          <p>
            <Link href="/login" className="underline">Sign in</Link> to post a result.
          </p>
        )}
      </div>

      {history.length > 0 && (
        <div className="brutal-card">
          <h2 className="brutal-h2">Edit history</h2>
          <ul className="space-y-1">
            {history.map((h) => (
              <li key={String(h.id)} className="flex flex-wrap items-center gap-3 border-b border-current/10 py-1 text-sm">
                <UserLink userId={Number(h.user_id)} name={String(h.user_name)} className="font-bold" />
                <span className="font-mono">
                  {(h.home_score as number | null) ?? '?'}–{(h.away_score as number | null) ?? '?'}
                  {h.home_pens != null && h.away_pens != null ? ` (pens ${String(h.home_pens)}–${String(h.away_pens)})` : ''}
                </span>
                <span className="brutal-pill text-xs">{String(h.status)}</span>
                {h.note ? <span className="opacity-100">“{String(h.note)}”</span> : null}
                <span className="ml-auto text-xs">{fmtNzDateTime(String(h.created_at))} {nzZoneAbbr(String(h.created_at))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
