import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { bootstrapAdminIfNeeded } from '@/lib/auth';
import ThemeToggle from './_theme-toggle';
import { Avatar } from './_avatar';
import { HowItWorksButton } from './_how-it-works';
import { headers } from 'next/headers';
import { db, schema } from '@/db/client';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Get Fooked — 2026 World Cup tipping',
  description: 'Invite-only football tipping for cunts. Random teams, weird leaderboards, real prizes.',
};

const NAV: Array<[string, string]> = [
  ['Fixtures', '/fixtures'],
  ['Preferences', '/preferences'],
  ['My Teams', '/teams'],
  ['Boards', '/leaderboards'],
  ['InSwap', '/inswap'],
  ['Prizes', '/prizes'],
  ['Profile', '/profile'],
  ['Help', '/help'],
];

// Runs synchronously before hydration so the page paints in the user's theme
// from the very first frame — no flash of wrong colours.
const THEME_BOOTSTRAP = `
(function() {
  try {
    var stored = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored === 'dark' || ((!stored || stored === 'system') && prefersDark);
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();
`;

/** Paths that signed-in-but-not-onboarded users are allowed to view. */
const ONBOARDING_ALLOWLIST = new Set(['/onboarding', '/login', '/register', '/logout']);

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  try {
    await bootstrapAdminIfNeeded();
  } catch {}
  let session: Awaited<ReturnType<typeof getSession>> | undefined;
  try {
    session = await getSession();
  } catch {}

  // Gate: a signed-in user with no onboardedAt is bounced to /onboarding.
  // Path comes from middleware (x-pathname). API/_next requests are excluded
  // by the middleware matcher so we never see them here.
  let needsOnboarding = false;
  if (session?.userId) {
    try {
      const h = await headers();
      const pathname = h.get('x-pathname') ?? '/';
      const exempt = ONBOARDING_ALLOWLIST.has(pathname) || pathname.startsWith('/api/');
      if (!exempt) {
        const [me] = await db
          .select({ onboardedAt: schema.users.onboardedAt })
          .from(schema.users)
          .where(eq(schema.users.id, session.userId))
          .limit(1);
        if (me && !me.onboardedAt) needsOnboarding = true;
      }
    } catch {
      // DB hiccup in the gate shouldn't blank the whole app.
    }
  }
  if (needsOnboarding) redirect('/onboarding');

  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-screen">
        <header className="border-b-[3px] border-current">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-xl md:text-2xl font-bold uppercase tracking-tight">
                <span className="ansi-magenta">▓</span>
                <span className="ansi-cyan">▒</span>
                <span className="ansi-magenta">░</span>{' '}
                GET FOOKED
              </span>
              <span className="text-xs font-bold opacity-100">⚽ '26</span>
            </Link>
            <nav className="hidden gap-1 md:flex">
              {NAV.map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="border-[2px] border-transparent px-3 py-1 text-sm font-bold uppercase tracking-wide hover:bg-cga-cyan hover:text-cga-black"
                >
                  {label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-2 text-sm">
              <HowItWorksButton className="hidden md:inline-flex border-[2px] border-current px-2 py-1 text-xs font-bold uppercase tracking-wide hover:bg-cga-cyan hover:text-cga-black" label="How it works" />
              <ThemeToggle />
              {session?.userId ? (
                <>
                  <Link href="/profile" className="flex items-center gap-2 hover:bg-cga-cyan hover:text-cga-black px-1 py-1" title="Edit profile">
                    <Avatar
                      user={{ email: session.email ?? '', avatarUrl: session.avatarUrl, name: session.name }}
                      size={28}
                    />
                    <span className="hidden sm:inline font-bold">{session.name}</span>
                  </Link>
                  {session.isAdmin && (
                    <Link className="border-[3px] border-current px-2 py-1 text-xs font-bold uppercase hover:bg-cga-cyan hover:text-cga-black" href="/admin">
                      Admin
                    </Link>
                  )}
                  <form action="/api/auth/logout" method="post">
                    <button className="border-[3px] border-current px-2 py-1 text-xs font-bold uppercase hover:bg-cga-magenta hover:text-cga-black" type="submit">Sign out</button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="brutal-btn-pink text-xs">
                  Sign in
                </Link>
              )}
            </div>
          </div>
          <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 md:hidden">
            {NAV.map(([label, href]) => (
              <Link key={href} href={href} className="whitespace-nowrap border-[2px] border-current px-3 py-1 text-xs font-bold uppercase">
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-8 text-xs">
          <span className="brutal-tag-magenta">GET FOOKED</span>
          <span className="ml-2 opacity-100">
            <span className="ansi-cyan">═══</span> WC2026 <span className="ansi-cyan">═══</span> built for friends, not bookies
          </span>
        </footer>
      </body>
    </html>
  );
}
