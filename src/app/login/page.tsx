import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { findUserByEmail, verifyPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function login(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) {
    redirect('/login?error=missing');
  }
  const user = await findUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    redirect('/login?error=bad');
  }
  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  session.isAdmin = user.isAdmin;
  session.avatarUrl = user.avatarUrl;
  await session.save();
  redirect('/');
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="brutal-card">
        <h1 className="text-xl font-bold">Sign in</h1>
        <p className="text-sm opacity-100">Don’t have an account? You need an invite. Ask whoever roped you in.</p>
        {error === 'bad' && <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-red-700">Wrong email or password.</p>}
        {error === 'missing' && <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-red-700">Fill in both fields.</p>}
        <form action={login} className="mt-4 space-y-3">
          <label className="block">
            <span className="text-sm opacity-100">Email</span>
            <input className="brutal-input mt-1" name="email" type="email" required autoComplete="email" />
          </label>
          <label className="block">
            <span className="text-sm opacity-100">Password</span>
            <input className="brutal-input mt-1" name="password" type="password" required autoComplete="current-password" />
          </label>
          <button className="brutal-btn-primary w-full" type="submit">Sign in</button>
        </form>
        <p className="mt-3 text-sm opacity-100">
          Have an invite link? <Link href="/register" className="brutal-link hover:underline">Register here</Link>.
        </p>
      </div>
    </div>
  );
}
