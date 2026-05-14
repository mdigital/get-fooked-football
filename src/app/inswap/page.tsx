import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db, schema } from '@/db/client';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { saveUploadedImage } from '@/lib/uploads';
import { getInswapStandings, sortStandings } from '@/lib/inswap';
import ThumbButton from './_thumb-button';

export const dynamic = 'force-dynamic';

async function uploadPhoto(formData: FormData) {
  'use server';
  const s = await getSession();
  if (!s.userId) redirect('/login');
  const file = formData.get('image') as File | null;
  const caption = String(formData.get('caption') ?? '').trim() || null;
  if (!file) redirect('/inswap?err=nofile');
  try {
    const filePath = await saveUploadedImage(file);
    await db.insert(schema.photos).values({ userId: s.userId!, filePath, caption });
  } catch (err) {
    const code = err instanceof Error ? err.message : 'upload-failed';
    redirect(`/inswap?err=${encodeURIComponent(code)}`);
  }
  redirect('/inswap#mine');
}

async function deletePhoto(formData: FormData) {
  'use server';
  const s = await getSession();
  if (!s.userId) redirect('/login');
  const photoId = Number(formData.get('photo_id'));
  // Only the owner (or an admin) can delete.
  const row = await db.select().from(schema.photos).where(eq(schema.photos.id, photoId)).limit(1);
  if (!row[0]) redirect('/inswap');
  if (row[0].userId !== s.userId && !s.isAdmin) redirect('/inswap');
  await db.delete(schema.photos).where(eq(schema.photos.id, photoId));
  redirect('/inswap');
}

export default async function InswapPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const session = await getSession();
  const standings = sortStandings(await getInswapStandings());

  // Which photos has the current user already thumbs-upped?
  let myVotes = new Set<number>();
  if (session.userId) {
    const v = await db.select({ id: schema.photoVotes.photoId }).from(schema.photoVotes).where(eq(schema.photoVotes.userId, session.userId));
    myVotes = new Set(v.map((r) => r.id));
  }

  return (
    <div className="space-y-6">
      <div className="brutal-card">
        <h1 className="text-xl font-bold">The InSwap League 📸</h1>
        <p className="text-sm opacity-100">
          Photo competition. Upload your best face-swap (or whatever the theme is). Everyone gives thumbs up to as many as they like.
          If the top is a tie, head over to the <Link className="brutal-link hover:underline" href="/inswap/hot-or-not">Hot-or-Not playoff</Link> to break it.
        </p>
        {err && (
          <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700">
            {{ nofile: 'Choose an image first.' }[err] ?? `Upload failed: ${err}`}
          </p>
        )}
      </div>

      {session.userId ? (
        <div className="brutal-card" id="mine">
          <h2 className="text-lg font-semibold">Upload a photo</h2>
          <form action={uploadPhoto} encType="multipart/form-data" className="mt-3 space-y-3">
            <input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif" required className="block w-full text-sm" />
            <input className="brutal-input" name="caption" placeholder="Caption (optional)" maxLength={200} />
            <button className="brutal-btn-primary" type="submit">Upload</button>
          </form>
          <p className="mt-2 text-xs opacity-100">JPG / PNG / WEBP / GIF, max 6MB. You can upload multiple.</p>
        </div>
      ) : (
        <div className="brutal-card">
          <p>
            <Link className="brutal-link hover:underline" href="/login">Sign in</Link> to upload and vote.
          </p>
        </div>
      )}

      <div className="brutal-card">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Standings</h2>
          <Link className="text-sm brutal-link hover:underline" href="/inswap/hot-or-not">Hot-or-Not playoff →</Link>
        </div>
        {standings.length === 0 && <p className="mt-2 opacity-100">No photos yet — be first.</p>}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {standings.map((p) => {
            const mine = session.userId === p.userId;
            const iVoted = myVotes.has(p.photoId);
            return (
              <div key={p.photoId} className="overflow-hidden border-[3px] border-black bg-white text-cga-black shadow-brutal-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.filePath} alt={p.caption ?? 'InSwap entry'} className="aspect-square w-full object-cover" />
                <div className="p-3 text-sm">
                  <div className="font-medium">{p.userName}</div>
                  {p.caption && <div className="opacity-100">{p.caption}</div>}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs opacity-100">
                      H2H {p.hotOrNotWins}–{p.hotOrNotLosses}
                    </span>
                    <ThumbButton
                      photoId={p.photoId}
                      initialVoted={iVoted}
                      initialCount={p.thumbsUp}
                      disabled={!session.userId}
                    />
                  </div>
                  {(mine || session.isAdmin) && (
                    <form action={deletePhoto} className="mt-2">
                      <input type="hidden" name="photo_id" value={p.photoId} />
                      <button className="text-xs opacity-100 hover:opacity-100 hover:text-red-600" type="submit">
                        delete
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
