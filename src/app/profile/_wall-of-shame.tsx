/* eslint-disable @next/next/no-img-element */
import { Avatar } from '../_avatar';
import { UserLink } from '../_user-link';
import { avatarFor } from '@/lib/avatar';
import { displayName } from '@/lib/display-name';
import { fmtNzDateTime } from '@/lib/format';
import { MAX_JAB_LEN } from '@/lib/profile-jabs';
import { deleteJabAction, postJabAction } from './_actions';

/**
 * One jab as displayed on a target's wall.
 *
 * `userName`/`userNickname`/`userEmail`/`userAvatar` are the AUTHOR's,
 * pulled via leftJoin against `users` in the parent fetch.
 */
export type JabRow = {
  id: number;
  body: string;
  createdAt: Date;
  authorUserId: number;
  authorName: string | null;
  authorNickname: string | null;
  authorEmail: string | null;
  authorAvatar: string | null;
};

export function WallOfShame({
  targetUserId,
  targetName,
  jabs,
  viewerUserId,
  viewerIsAdmin,
  isSelf,
}: {
  targetUserId: number;
  targetName: string;
  jabs: JabRow[];
  viewerUserId: number | null | undefined;
  viewerIsAdmin: boolean;
  isSelf: boolean;
}) {
  const canDeleteAny = isSelf || viewerIsAdmin;
  return (
    <div id="wall" className="brutal-card">
      <h2 className="brutal-h2">Wall of Shame</h2>
      <p className="text-sm mt-2 opacity-100">
        {isSelf ? (
          <>
            Anyone can post a jab here. <strong>You</strong> can hide them (target-only delete). The authors are locked
            in — there&rsquo;s no taking the post back once it&rsquo;s up.
          </>
        ) : (
          <>
            Drop a one-liner that lives on <strong>{targetName}</strong>&rsquo;s wall. They can hide it; you can&rsquo;t.
          </>
        )}
      </p>

      {jabs.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {jabs.map((j) => {
            const author = j.authorName ?? 'someone';
            const display = j.authorName
              ? displayName({ name: j.authorName, nickname: j.authorNickname })
              : author;
            return (
              <li key={j.id} className="border-[3px] border-current p-3">
                <div className="flex items-start gap-3">
                  <UserLink userId={j.authorUserId} name={display}>
                    <Avatar
                      src={avatarFor({ email: j.authorEmail ?? '', avatarUrl: j.authorAvatar ?? null }, 48)}
                      name={display}
                      size={24}
                    />
                  </UserLink>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline flex-wrap gap-2">
                      <UserLink userId={j.authorUserId} name={display} className="font-bold" />
                      <span className="text-xs opacity-100">{fmtNzDateTime(j.createdAt)}</span>
                    </div>
                    <div className="mt-1 whitespace-pre-wrap break-words text-sm">{j.body}</div>
                  </div>
                  {canDeleteAny && (
                    <form action={deleteJabAction}>
                      <input type="hidden" name="jab_id" value={j.id} />
                      <button type="submit" className="brutal-btn-ghost text-xs" title="Hide this jab">✕</button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 opacity-100 text-sm">
          {isSelf ? 'Your wall is empty — for now.' : 'Be the first to drop a jab.'}
        </p>
      )}

      {viewerUserId != null && (
        <form action={postJabAction} className="mt-4 brutal-card-inner space-y-2">
          <input type="hidden" name="target_user_id" value={targetUserId} />
          <textarea
            name="body"
            rows={2}
            maxLength={MAX_JAB_LEN}
            placeholder={isSelf ? 'Self-burn welcome.' : `Tell ${targetName} what you really think (one line).`}
            className="brutal-input"
            required
          />
          <div className="flex justify-end">
            <button type="submit" className={isSelf ? 'brutal-btn-primary' : 'brutal-btn-pink'}>
              {isSelf ? 'Post jab' : `Jab ${targetName}`}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
