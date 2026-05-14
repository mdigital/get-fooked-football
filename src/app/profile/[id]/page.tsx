/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db, schema } from '@/db/client';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { avatarFor, gravatarUrl } from '@/lib/avatar';
import { clearAvatarAction, setNicknameAction, uploadAvatarAction } from '../_actions';
import { displayName, nicknameOnly } from '@/lib/display-name';
import { WallOfShame, type JabRow } from '../_wall-of-shame';

export const dynamic = 'force-dynamic';

/**
 * Easter-egg route: any signed-in user can edit any other user's profile
 * photo. There's no link to this anywhere — discovery is by guessing the
 * URL. If `id` matches the signed-in user, the experience is identical to
 * /profile so it's also a deep-link to your own page.
 */
export default async function HijackProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { id: rawId } = await params;
  const targetId = Number(rawId);
  if (!Number.isFinite(targetId) || targetId <= 0) notFound();

  const { err, ok } = await searchParams;
  const session = await getSession();
  if (!session.userId) {
    return (
      <div className="brutal-card">
        <p>
          You need to <Link className="brutal-link" href="/login">sign in</Link> first.
        </p>
      </div>
    );
  }

  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, targetId)).limit(1);
  if (!target) notFound();

  const isSelf = targetId === session.userId;
  const targetDisplay = displayName(target);
  const targetNick = nicknameOnly(target);
  const current = avatarFor({ email: target.email, avatarUrl: target.avatarUrl }, 240);

  const jabRows = await db
    .select({
      id: schema.profileJabs.id,
      body: schema.profileJabs.body,
      createdAt: schema.profileJabs.createdAt,
      authorUserId: schema.profileJabs.authorUserId,
      authorName: schema.users.name,
      authorNickname: schema.users.nickname,
      authorEmail: schema.users.email,
      authorAvatar: schema.users.avatarUrl,
    })
    .from(schema.profileJabs)
    .leftJoin(schema.users, eq(schema.users.id, schema.profileJabs.authorUserId))
    .where(and(eq(schema.profileJabs.targetUserId, target.id), isNull(schema.profileJabs.deletedAt)))
    .orderBy(asc(schema.profileJabs.createdAt));
  const jabs: JabRow[] = jabRows;
  const gravatar = gravatarUrl(target.email, 240);
  const usingGravatar = !target.avatarUrl;

  return (
    <div className="space-y-6">
      <div className="brutal-card">
        <h1 className="brutal-h1 brutal-heading-magenta">
          {isSelf ? 'Profile' : `Hijacking ${targetDisplay}`}
        </h1>
        <p className="text-sm mt-2">
          {isSelf ? (
            <>This is your profile.</>
          ) : (
            <>
              You are about to mess with <strong>{targetDisplay}</strong>&rsquo;s identity. Use this power wisely — there
              is <em>no audit log</em>, no notification, and no one stopping you.{' '}
              <Link className="brutal-link" href="/profile">Back to your own profile</Link>.
            </>
          )}
        </p>
        {ok && <p className="mt-3 brutal-tag-cyan">Saved.</p>}
        {err === 'nofile' && <p className="brutal-error mt-3">Pick a file first.</p>}
        {err && err !== 'nofile' && <p className="brutal-error mt-3">Upload failed: {decodeURIComponent(err)}</p>}
      </div>

      <div className="brutal-card">
        <h2 className="brutal-h2">{isSelf ? 'Current photo' : `${target.name}'s current photo`}</h2>
        <div className="mt-3 flex flex-wrap items-start gap-6">
          <div>
            <img
              src={current}
              alt={`${target.name}'s avatar`}
              width={160}
              height={160}
              className="border-[3px] border-current shadow-cga"
              style={{ width: 160, height: 160, objectFit: 'cover' }}
            />
            <p className="mt-2 text-xs uppercase font-bold opacity-100">
              {usingGravatar ? 'Gravatar fallback' : 'Uploaded'}
            </p>
          </div>
          {!usingGravatar && (
            <div>
              <p className="text-xs uppercase font-bold mb-2">Gravatar fallback would be:</p>
              <img
                src={gravatar}
                alt="Gravatar preview"
                width={96}
                height={96}
                className="border-[2px] border-current opacity-100"
                style={{ width: 96, height: 96, objectFit: 'cover' }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="brutal-card">
        <h2 className="brutal-h2">Nickname</h2>
        <p className="text-sm mt-2 opacity-100">
          {isSelf
            ? 'Your own nickname (shows up alongside your name everywhere).'
            : `Whatever you put here renders alongside ${target.name}'s real name everywhere in the app. Leave blank to clear.`}
        </p>
        <form action={setNicknameAction} className="mt-3 flex flex-wrap items-center gap-3">
          <input type="hidden" name="target_user_id" value={target.id} />
          <input
            type="text"
            name="nickname"
            defaultValue={targetNick ?? ''}
            maxLength={30}
            placeholder='e.g. "Sheep Lord"'
            className="brutal-input flex-1 min-w-[16rem]"
          />
          <button type="submit" className={isSelf ? 'brutal-btn-primary' : 'brutal-btn-pink'}>
            {isSelf ? 'Save nickname' : `Tag ${target.name}`}
          </button>
        </form>
        {targetNick && (
          <p className="mt-3 text-xs opacity-100">
            Currently renders as <strong>{targetDisplay}</strong>
          </p>
        )}
      </div>

      <div className="brutal-card">
        <h2 className="brutal-h2">Upload a new photo {isSelf ? '' : `for ${target.name}`}</h2>
        <form action={uploadAvatarAction} className="mt-3 space-y-3">
          <input type="hidden" name="target_user_id" value={target.id} />
          <input
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/webp,image/gif"
            required
            className="brutal-input"
          />
          <p className="text-xs opacity-100">JPEG / PNG / WEBP / GIF, up to 6 MB.</p>
          <button type="submit" className={isSelf ? 'brutal-btn-primary' : 'brutal-btn-pink'}>
            {isSelf ? 'Save photo' : `Replace ${target.name}'s photo`}
          </button>
        </form>
      </div>

      {!usingGravatar && (
        <div className="brutal-card">
          <h2 className="brutal-h2">Back to Gravatar</h2>
          <form action={clearAvatarAction} className="mt-3">
            <input type="hidden" name="target_user_id" value={target.id} />
            <p className="text-sm mb-3">
              {isSelf
                ? "Removes your uploaded photo and falls back to your Gravatar."
                : `Wipes ${target.name}'s uploaded photo and falls back to their Gravatar.`}
            </p>
            <button type="submit" className="brutal-btn-pink">Use Gravatar instead</button>
          </form>
        </div>
      )}

      <WallOfShame
        targetUserId={target.id}
        targetName={target.name}
        jabs={jabs}
        viewerUserId={session.userId ?? null}
        viewerIsAdmin={!!session.isAdmin}
        isSelf={isSelf}
      />
    </div>
  );
}
