/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db, schema } from '@/db/client';
import { asc, eq } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { saveUploadedImage } from '@/lib/uploads';
import { BUY_IN_DEFAULT, BUY_IN_MAX, BUY_IN_MIN, validateBuyIn } from '@/lib/buy-in';
import { avatarFor } from '@/lib/avatar';
import { buildTeamTiers } from '@/lib/team-tiers';
import { HowItWorksButton } from '../_how-it-works';
import { BuyInSlider } from './_buy-in-slider';

export const dynamic = 'force-dynamic';

async function saveOnboarding(formData: FormData) {
  'use server';
  const s = await getSession();
  if (!s.userId) redirect('/login');
  const userId = s.userId;

  // Display name — keep what they had if they leave it blank.
  const rawName = String(formData.get('name') ?? '').trim();
  const name = rawName.length > 0 ? rawName.slice(0, 60) : null;

  // Buy-in — validated against $20–$500 with $5 step.
  const buyInResult = validateBuyIn(formData.get('buy_in'));
  if (!buyInResult.ok) redirect(`/onboarding?err=buyin-${buyInResult.reason}`);

  // Optional avatar upload — leave existing if not provided.
  const file = formData.get('image');
  let newAvatarPath: string | null | undefined = undefined;
  if (file instanceof File && file.size > 0) {
    try {
      newAvatarPath = await saveUploadedImage(file);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'upload-failed';
      redirect(`/onboarding?err=${encodeURIComponent(code)}`);
    }
  }

  // Team preferences — three different teams, all optional individually
  // but the user can come back to /preferences any time to fix later.
  const parsed = [1, 2, 3].map((rank) => {
    const raw = String(formData.get(`pref-${rank}`) ?? '').trim();
    const id = Number.parseInt(raw, 10);
    return { rank, teamId: Number.isFinite(id) && id > 0 ? id : null };
  });
  const ids = parsed.map((p) => p.teamId).filter((x): x is number => x != null);
  if (new Set(ids).size !== ids.length) redirect('/onboarding?err=pref-duplicate');

  // One transaction so a half-saved onboarding can't strand someone.
  await db.transaction(async (tx) => {
    const userUpdate: Partial<typeof schema.users.$inferInsert> = {
      buyIn: buyInResult.value,
      onboardedAt: new Date(),
    };
    if (name) userUpdate.name = name;
    if (newAvatarPath !== undefined) userUpdate.avatarUrl = newAvatarPath;
    await tx.update(schema.users).set(userUpdate).where(eq(schema.users.id, userId));

    await tx.delete(schema.teamPreferences).where(eq(schema.teamPreferences.userId, userId));
    for (const p of parsed) {
      if (p.teamId == null) continue;
      await tx.insert(schema.teamPreferences).values({ userId, rank: p.rank, teamId: p.teamId });
    }
  });

  // Refresh the session so the avatar/name in the header reflect the update
  // without making the user sign out and back in.
  if (name) s.name = name;
  if (newAvatarPath !== undefined) s.avatarUrl = newAvatarPath;
  await s.save();

  redirect('/');
}

const ERR_LABEL: Record<string, string> = {
  'buyin-too-low': `Buy-in must be at least $${BUY_IN_MIN}.`,
  'buyin-too-high': `Buy-in can't be more than $${BUY_IN_MAX}.`,
  'buyin-not-a-number': 'Buy-in must be a number.',
  'pref-duplicate': 'Pick three different teams.',
};

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const session = await getSession();
  if (!session.userId) {
    return (
      <div className="brutal-card">
        <p>
          <Link className="brutal-link" href="/login">Sign in</Link> first — onboarding is per-user.
        </p>
      </div>
    );
  }
  const { err } = await searchParams;

  const [meRow] = await db.select().from(schema.users).where(eq(schema.users.id, session.userId!)).limit(1);
  const me = meRow!;
  const currentAvatar = avatarFor({ email: me.email, avatarUrl: me.avatarUrl }, 200);

  const teams = await db.select().from(schema.teams).orderBy(asc(schema.teams.groupName), asc(schema.teams.name));
  const prefs = await db
    .select()
    .from(schema.teamPreferences)
    .where(eq(schema.teamPreferences.userId, session.userId!))
    .orderBy(asc(schema.teamPreferences.rank));
  const byRank: (number | undefined)[] = [];
  for (const p of prefs) byRank[p.rank - 1] = p.teamId;

  const { favourites, midtable, underdogs, havePrices } = buildTeamTiers(teams);

  const errLabel = err ? ERR_LABEL[err] ?? `Something went wrong: ${decodeURIComponent(err)}` : null;
  const alreadyOnboarded = !!me.onboardedAt;

  return (
    <div className="space-y-6">
      <div className="brutal-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="brutal-h1 brutal-heading-cyan">Welcome to Get Fooked</h1>
            <p className="mt-3 text-sm max-w-xl">
              Set your pledge, your name, your face, and three team preferences. You can change any of this later from
              your profile or the preferences page — we just need a baseline to seed the draw.
            </p>
            {alreadyOnboarded && (
              <p className="mt-2 text-xs uppercase font-bold opacity-100">
                ✓ Already onboarded — saving here just updates what's on file.
              </p>
            )}
          </div>
          <HowItWorksButton className="brutal-btn-pink text-xs" />
        </div>
        {errLabel && <p className="brutal-error mt-4">{errLabel}</p>}
      </div>

      <form action={saveOnboarding} encType="multipart/form-data" className="space-y-6">
        <section className="brutal-card">
          <h2 className="brutal-h2">1. What can you put in the pot?</h2>
          <p className="text-sm mt-2 opacity-100">
            Default is $100. Min ${BUY_IN_MIN}, max ${BUY_IN_MAX}. Pledge whatever feels right — prizes are percentages
            of the total pot, so it works for everyone.
          </p>
          <div className="mt-4">
            <BuyInSlider initial={me.buyIn ?? BUY_IN_DEFAULT} />
          </div>
        </section>

        <section className="brutal-card">
          <h2 className="brutal-h2">2. Identity</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-[180px_1fr] items-start">
            <div>
              <img
                src={currentAvatar}
                alt="Current avatar"
                width={160}
                height={160}
                className="border-[3px] border-current shadow-cga"
                style={{ width: 160, height: 160, objectFit: 'cover' }}
              />
              <p className="mt-2 text-xs uppercase font-bold opacity-100">Current photo</p>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-bold uppercase">Display name</span>
                <input
                  type="text"
                  name="name"
                  defaultValue={me.name}
                  maxLength={60}
                  className="brutal-input mt-1"
                  placeholder="e.g. Robin M"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold uppercase">New photo (optional)</span>
                <input
                  type="file"
                  name="image"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="brutal-input mt-1"
                />
                <span className="block text-xs opacity-100 mt-1">
                  JPEG/PNG/WEBP/GIF up to 6 MB. Leave blank to keep your{' '}
                  {me.avatarUrl ? 'uploaded photo' : 'Gravatar fallback'}.
                </span>
              </label>
            </div>
          </div>
        </section>

        <section className="brutal-card">
          <h2 className="brutal-h2">3. Team preferences</h2>
          <p className="text-sm mt-2 opacity-100">
            Pick three in order. The draw tries to give everyone one favourite team plus their other picks; whatever
            doesn't fit goes into a leftover pool.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((rank) => (
              <label key={rank} className="block">
                <span className="text-sm font-bold uppercase">{ordinal(rank)} choice</span>
                <select className="brutal-input mt-1" name={`pref-${rank}`} defaultValue={byRank[rank - 1] ?? ''}>
                  <option value="">— pick a team —</option>
                  <optgroup label={`★ Favourites (top 8 ${havePrices ? 'by Polymarket' : 'by FIFA rank'})`}>
                    {favourites.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.flag} {t.name} (Grp {t.groupName})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Mid-table">
                    {midtable.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.flag} {t.name} (Grp {t.groupName})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Underdogs">
                    {underdogs.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.flag} {t.name} (Grp {t.groupName})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="brutal-btn-primary">Save &amp; enter</button>
          <Link href="/" className="brutal-btn-ghost text-sm">Cancel</Link>
        </div>
      </form>
    </div>
  );
}

function ordinal(n: number) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : '3rd';
}
