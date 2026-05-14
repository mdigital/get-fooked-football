/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db, schema } from '@/db/client';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { saveUploadedImage } from '@/lib/uploads';
import { avatarFor, gravatarUrl } from '@/lib/avatar';

export const dynamic = 'force-dynamic';

async function uploadAvatar(formData: FormData) {
  'use server';
  const s = await getSession();
  if (!s.userId) redirect('/login');
  const file = formData.get('image') as File | null;
  if (!file || !file.size) redirect('/profile?err=nofile');
  try {
    const filePath = await saveUploadedImage(file);
    await db.update(schema.users).set({ avatarUrl: filePath }).where(eq(schema.users.id, s.userId!));
    s.avatarUrl = filePath;
    await s.save();
  } catch (err) {
    const code = err instanceof Error ? err.message : 'upload-failed';
    redirect(`/profile?err=${encodeURIComponent(code)}`);
  }
  redirect('/profile?ok=1');
}

async function clearAvatar() {
  'use server';
  const s = await getSession();
  if (!s.userId) redirect('/login');
  await db.update(schema.users).set({ avatarUrl: null }).where(eq(schema.users.id, s.userId!));
  s.avatarUrl = null;
  await s.save();
  redirect('/profile?ok=1');
}

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const { err, ok } = await searchParams;
  const session = await getSession();
  if (!session.userId) {
    return (
      <div className="brutal-card">
        <p>
          You need to <Link className="brutal-link" href="/login">sign in</Link> to manage your profile.
        </p>
      </div>
    );
  }

  // Always read fresh from the DB so the page shows the truth even if the
  // session cookie is stale (e.g. user updated in another tab).
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, session.userId!)).limit(1);
  const me = rows[0]!;
  const current = avatarFor({ email: me.email, avatarUrl: me.avatarUrl }, 240);
  const gravatar = gravatarUrl(me.email, 240);
  const usingGravatar = !me.avatarUrl;

  return (
    <div className="space-y-6">
      <div className="brutal-card">
        <h1 className="brutal-h1 brutal-heading-cyan">[ Profile ]</h1>
        <p className="text-sm mt-2">
          Your photo shows up next to your name on leaderboards, match comments and reactions. If you don't upload one,
          we fall back to your{' '}
          <a href="https://gravatar.com" target="_blank" rel="noreferrer" className="brutal-link">
            Gravatar
          </a>{' '}
          (an 8-bit "retro" identicon if none is registered).
        </p>
        {ok && <p className="mt-3 brutal-tag-cyan">Saved.</p>}
        {err === 'nofile' && <p className="brutal-error mt-3">Pick a file first.</p>}
        {err && err !== 'nofile' && <p className="brutal-error mt-3">Upload failed: {decodeURIComponent(err)}</p>}
      </div>

      <div className="brutal-card">
        <h2 className="brutal-h2">Current photo</h2>
        <div className="mt-3 flex flex-wrap items-start gap-6">
          <div>
            <img
              src={current}
              alt={`${me.name}'s avatar`}
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
              <p className="text-xs uppercase font-bold mb-2">Your Gravatar would be:</p>
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
        <h2 className="brutal-h2">Upload a new photo</h2>
        <form action={uploadAvatar} className="mt-3 space-y-3">
          <input
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/webp,image/gif"
            required
            className="brutal-input"
          />
          <p className="text-xs opacity-100">JPEG / PNG / WEBP / GIF, up to 6 MB.</p>
          <button type="submit" className="brutal-btn-primary">Save photo</button>
        </form>
      </div>

      {!usingGravatar && (
        <div className="brutal-card">
          <h2 className="brutal-h2">Back to Gravatar</h2>
          <form action={clearAvatar} className="mt-3">
            <p className="text-sm mb-3">Removes your uploaded photo and falls back to your Gravatar.</p>
            <button type="submit" className="brutal-btn-pink">Use Gravatar instead</button>
          </form>
        </div>
      )}
    </div>
  );
}
