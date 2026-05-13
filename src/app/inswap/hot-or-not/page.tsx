import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db, schema } from '@/db/client';
import { getSession } from '@/lib/session';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

async function recordHotOrNotVote(formData: FormData) {
  'use server';
  const s = await getSession();
  if (!s.userId) redirect('/login');
  const winner = Number(formData.get('winner'));
  const loser = Number(formData.get('loser'));
  if (!Number.isFinite(winner) || !Number.isFinite(loser) || winner === loser) {
    redirect('/inswap/hot-or-not');
  }
  await db.insert(schema.hotOrNotVotes).values({ userId: s.userId!, winnerPhotoId: winner, loserPhotoId: loser });
  redirect('/inswap/hot-or-not');
}

export default async function HotOrNotPage() {
  const session = await getSession();
  if (!session.userId) {
    return (
      <div className="brutal-card">
        <p>
          <Link className="brutal-link hover:underline" href="/login">Sign in</Link> to play hot-or-not.
        </p>
      </div>
    );
  }

  // Pick the two photos the current user has compared the least often, then break ties randomly.
  const candidates = await db.execute(sql`
    select p.id, p.file_path, p.caption, u.name as user_name
    from photos p
    join users u on u.id = p.user_id
    order by random()
    limit 12
  `);
  const list = candidates.rows.map((r) => r as Record<string, unknown>);

  if (list.length < 2) {
    return (
      <div className="space-y-4">
        <div className="brutal-card">
          <h1 className="text-xl font-bold">Hot or Not</h1>
          <p className="text-sm opacity-100">Need at least 2 photos before this works. Get uploading.</p>
          <Link href="/inswap" className="mt-3 inline-block brutal-link hover:underline">← back to InSwap</Link>
        </div>
      </div>
    );
  }
  const a = list[0];
  const b = list[1];

  return (
    <div className="space-y-4">
      <div className="brutal-card">
        <h1 className="text-xl font-bold">Hot or Not — tiebreaker round</h1>
        <p className="text-sm opacity-100">Pick the better one. Each click is a head-to-head vote that breaks thumbs-up ties.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[a, b].map((photo, idx) => {
          const otherId = idx === 0 ? Number(b.id) : Number(a.id);
          const photoId = Number(photo.id);
          return (
            <form key={photoId} action={recordHotOrNotVote} className="contents">
              <input type="hidden" name="winner" value={photoId} />
              <input type="hidden" name="loser" value={otherId} />
              <button className="group block overflow-hidden rounded-2xl border-2 border-transparent transition hover:border-black" type="submit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={String(photo.file_path)} alt={(photo.caption as string) ?? ''} className="aspect-square w-full object-cover" />
                <div className="bg-white p-3 text-left text-sm dark:bg-white/5">
                  <div className="font-medium">{String(photo.user_name)}</div>
                  {photo.caption ? <div className="opacity-100">{String(photo.caption)}</div> : null}
                </div>
              </button>
            </form>
          );
        })}
      </div>
      <div className="text-center">
        <Link href="/inswap" className="text-sm brutal-link hover:underline">← back to standings</Link>
      </div>
    </div>
  );
}
