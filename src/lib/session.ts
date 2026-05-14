import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export type SessionData = {
  userId?: number;
  email?: string;
  name?: string;
  isAdmin?: boolean;
  /** Path to a self-uploaded avatar, or undefined to fall back to Gravatar. */
  avatarUrl?: string | null;
};

const password = process.env.SESSION_SECRET;
if (!password || password.length < 32) {
  // Don't crash at import time during build — only flag when actually used.
  console.warn(
    '[auth] SESSION_SECRET is missing or shorter than 32 chars. Set one in Railway env vars before going live.',
  );
}

const sessionOptions: SessionOptions = {
  password: password && password.length >= 32 ? password : 'dev-only-secret-please-change-me-32chars!',
  cookieName: 'gf_football_session',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 60, // 60 days
  },
};

export async function getSession() {
  const c = await cookies();
  return getIronSession<SessionData>(c, sessionOptions);
}

export async function requireUser() {
  const s = await getSession();
  if (!s.userId) {
    throw new Error('UNAUTHENTICATED');
  }
  return s as Required<Pick<SessionData, 'userId' | 'email' | 'name'>> & SessionData;
}

export async function requireAdmin() {
  const s = await getSession();
  if (!s.userId || !s.isAdmin) throw new Error('FORBIDDEN');
  return s;
}
