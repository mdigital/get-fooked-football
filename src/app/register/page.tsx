import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db, schema } from '@/db/client';
import { eq } from 'drizzle-orm';
import { findInvite, findUserByEmail, hashPassword } from '@/lib/auth';
import { validateInvite } from '@/lib/group-invite';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

async function register(formData: FormData) {
  'use server';
  const token = String(formData.get('token') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!token || !email || !name || password.length < 8) {
    redirect(`/register?token=${encodeURIComponent(token)}&error=missing`);
  }

  const invite = await findInvite(token);
  const check = validateInvite(invite ?? null, new Date());
  if (!check.ok) {
    redirect(`/register?error=${check.reason === 'unknown' ? 'badtoken' : check.reason}`);
  }

  const existing = await findUserByEmail(email);
  if (existing) redirect(`/register?token=${encodeURIComponent(token)}&error=existing`);

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(schema.users)
    .values({ email, name, passwordHash, isAdmin: false })
    .returning();

  // Multi-use (group) invites stay reusable. Single-use email invites stamp
  // the consuming user so the same token can't be reused.
  if (!invite!.multiUse) {
    await db
      .update(schema.invites)
      .set({ usedByUserId: user.id, usedAt: new Date() })
      .where(eq(schema.invites.token, token));
  }

  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  session.isAdmin = false;
  session.avatarUrl = null;
  await session.save();
  redirect('/');
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token = '', error } = await searchParams;
  const errMsg = {
    badtoken: 'That invite token isn’t valid.',
    used: 'That invite has already been used.',
    expired: 'That invite link has expired. Ask whoever shared it for the latest one.',
    existing: 'There’s already an account with that email — try signing in.',
    missing: 'Fill in every field. Password needs at least 8 characters.',
  }[error ?? ''];

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="brutal-card">
        <h1 className="text-xl font-bold">Create your account</h1>
        <p className="text-sm opacity-100">You’ll need a valid invite token. The admin generates these on the admin page.</p>
        {errMsg && <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-red-700">{errMsg}</p>}
        <form action={register} className="mt-4 space-y-3">
          <label className="block">
            <span className="text-sm opacity-100">Invite token</span>
            <input className="brutal-input mt-1 font-mono" name="token" defaultValue={token} required />
          </label>
          <label className="block">
            <span className="text-sm opacity-100">Display name</span>
            <input className="brutal-input mt-1" name="name" required autoComplete="name" />
          </label>
          <label className="block">
            <span className="text-sm opacity-100">Email</span>
            <input className="brutal-input mt-1" name="email" type="email" required autoComplete="email" />
          </label>
          <label className="block">
            <span className="text-sm opacity-100">Password (8+ chars)</span>
            <input className="brutal-input mt-1" name="password" type="password" required minLength={8} autoComplete="new-password" />
          </label>
          <button className="brutal-btn-primary w-full" type="submit">Create account</button>
        </form>
        <p className="mt-3 text-sm opacity-100">
          Already registered? <Link href="/login" className="brutal-link hover:underline">Sign in</Link>.
        </p>
      </div>
    </div>
  );
}
